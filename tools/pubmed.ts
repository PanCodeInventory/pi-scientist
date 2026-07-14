import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

export function registerPubmedTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "pubmed_search",
		label: "PubMed Search",
		description: [
			"Search PubMed directly using NCBI E-utilities API. Returns structured article metadata including titles, authors, journals, abstracts, and PMIDs.",
			"Use this for systematic literature review, gene-disease association searches, pathway validation, and post-analysis evidence gathering.",
			"Supports all PubMed/Entrez search syntax including Boolean operators (AND, OR, NOT), field tags (e.g., [Title/Abstract], [Author], [Journal]), and date filters.",
			"This tool is preferred over web_search for PubMed-specific queries because it queries the database directly with precise control over results.",
		].join(" "),
		promptSnippet: "Search PubMed database directly for articles matching QUERY",
		promptGuidelines: [
			"Use pubmed_search when the task involves searching for peer-reviewed biomedical literature.",
			"Build queries using PubMed syntax: gene symbols, disease terms, AND/OR/NOT operators, field tags.",
			"For comprehensive coverage, run 2-4 varied queries with different phrasing and keyword combinations.",
			"Set retmax to control result volume (default 20, max 100).",
			"Use date filters (mindate, maxdate, reldate) to focus on recent or historical literature.",
		],
		parameters: Type.Object({
			term: Type.String({ description: "PubMed search query using Entrez syntax. Example: '(TP53 OR p53) AND \"lung cancer\"[Title/Abstract] AND survival'" }),
			retmax: Type.Optional(Type.Number({ description: "Maximum results to return (default: 20, max: 100)", default: 20 })),
			retstart: Type.Optional(Type.Number({ description: "Start index for pagination (default: 0)", default: 0 })),
			sort: Type.Optional(Type.String({ description: "Sort order: relevance (default), pub_date, Author, JournalName", default: "relevance" })),
			mindate: Type.Optional(Type.String({ description: "Minimum date filter: YYYY/MM/DD or YYYY/MM or YYYY" })),
			maxdate: Type.Optional(Type.String({ description: "Maximum date filter: YYYY/MM/DD or YYYY/MM or YYYY" })),
			reldate: Type.Optional(Type.Number({ description: "Number of days back to limit search (e.g., 365 for last year)" })),
			datetype: Type.Optional(Type.String({ description: "Date type for filtering: pdat (publication, default), edat (Entrez), mdat (mesh)", default: "pdat" })),
			email: Type.Optional(Type.String({ description: "Email address for NCBI rate limit compliance (optional but recommended)" })),
		}),

		async execute(_toolCallId, params, signal, _onUpdate) {
			const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
			const email = params.email || "user@pi-agent.local";
			const retmax = Math.min(Math.max(1, params.retmax ?? 20), 100);
			const retstart = Math.max(0, params.retstart ?? 0);
			const sort = params.sort || "relevance";
			const datetype = params.datetype || "pdat";

			// Build ESearch URL
			const esearchParams = new URLSearchParams({
				db: "pubmed",
				term: params.term,
				retmax: String(retmax),
				retstart: String(retstart),
				retmode: "json",
				sort: sort,
				email: email,
				tool: "pi-scientist",
			});
			if (params.mindate) esearchParams.set("mindate", params.mindate);
			if (params.maxdate) esearchParams.set("maxdate", params.maxdate);
			if (params.reldate !== undefined) esearchParams.set("reldate", String(params.reldate));
			if (params.datetype) esearchParams.set("datetype", params.datetype);

			const esearchUrl = `${EUTILS_BASE}/esearch.fcgi?${esearchParams.toString()}`;

			try {
				// Step 1: ESearch
				if (signal?.aborted) throw new Error("Aborted");
				const esearchRes = await fetch(esearchUrl, { signal });
				if (!esearchRes.ok) throw new Error(`ESearch failed: ${esearchRes.status} ${esearchRes.statusText}`);
				const esearchData = await esearchRes.json();

				const idList = esearchData.esearchresult?.idlist || [];
				const totalCount = parseInt(esearchData.esearchresult?.count || "0", 10);

				if (idList.length === 0) {
					return {
						content: [{ type: "text", text: `No PubMed results found for: "${params.term}"\n\nTotal matches: ${totalCount}` }],
						details: { term: params.term, totalCount, returned: 0 },
						isError: false,
					};
				}

				// Step 2: ESummary for metadata (use direct id list, not history server, to avoid UID count limits)
				const esummaryParams = new URLSearchParams({
					db: "pubmed",
					id: idList.join(","),
					retmode: "json",
					email: email,
					tool: "pi-scientist",
				});

				const esummaryUrl = `${EUTILS_BASE}/esummary.fcgi?${esummaryParams.toString()}`;
				if (signal?.aborted) throw new Error("Aborted");
				const esummaryRes = await fetch(esummaryUrl, { signal });
				if (!esummaryRes.ok) throw new Error(`ESummary failed: ${esummaryRes.status} ${esummaryRes.statusText}`);
				const esummaryData = await esummaryRes.json();
				// Check for NCBI error response
				if (esummaryData.error) {
					throw new Error(`ESummary API error: ${esummaryData.error}`);
				}

				// Step 3: EFetch for abstracts (optional, best-effort)
				let abstracts: Record<string, string> = {};
				try {
					const efetchParams = new URLSearchParams({
						db: "pubmed",
						id: idList.join(","),
						retmode: "xml",
						rettype: "abstract",
						email: email,
						tool: "pi-scientist",
					});
					const efetchUrl = `${EUTILS_BASE}/efetch.fcgi?${efetchParams.toString()}`;
					if (!signal?.aborted) {
						const efetchRes = await fetch(efetchUrl, { signal });
						if (efetchRes.ok) {
							const xmlText = await efetchRes.text();
							// Simple XML parsing for abstracts
							const abstractMatches = xmlText.matchAll(/<AbstractText[^>]*>([^<]*)<\/AbstractText>/g);
							const pmidMatches = xmlText.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g);
							const pmidList = Array.from(pmidMatches).map(m => m[1]);
							const abstractList = Array.from(abstractMatches).map(m => m[1]);
							pmidList.forEach((pmid, i) => {
								if (abstractList[i]) abstracts[pmid] = abstractList[i];
							});
						}
					}
				} catch {
					// Abstract fetch is best-effort; don't fail if it errors
				}

				// Format results
				const result = esummaryData.result;
				const uids = result?.uids || idList;
				const articles = uids.map((uid: string) => {
					const article = result?.[uid];
					if (!article) return null;
					const doiEntry = article.articleids?.find((a: any) => a.idtype === "doi");
					return {
						pmid: uid,
						title: article.title || "",
						authors: (article.authors || []).map((a: any) => a.name).join(", "),
						journal: article.fulljournalname || article.source || "",
						pubdate: article.pubdate || "",
						doi: doiEntry?.value || "",
						abstract: abstracts[uid] || "",
						pmcrefcount: article.pmcrefcount || "",
						elocationid: article.elocationid || "",
					};
				}).filter(Boolean);

				const outputLines = [
					`## PubMed Search Results`,
					`Query: ${params.term}`,
					`Total matches: ${totalCount} | Returned: ${articles.length} | Start: ${retstart}`,
					"",
					...articles.map((a: any, i: number) => [
						`### ${i + 1}. ${a.title}`,
						`- **PMID**: ${a.pmid}`,
						`- **Authors**: ${a.authors}`,
						`- **Journal**: ${a.journal}`,
						`- **Date**: ${a.pubdate}`,
						`- **DOI**: ${a.doi || "N/A"}`,
						`- **Abstract**: ${a.abstract || "[Not available]"}`,
					].join("\n")),
				];

				return {
					content: [{ type: "text", text: outputLines.join("\n\n") }],
					details: {
						term: params.term,
						totalCount,
						returned: articles.length,
						retstart,
						retmax,
						articles,
					},
					isError: false,
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `PubMed search failed: ${err.message || err}` }],
					details: { term: params.term, error: err.message || String(err) },
					isError: true,
				};
			}
		},

		renderCall(args, theme) {
			const term = (args.term as string) || "...";
			const retmax = args.retmax as number | undefined;
			let text = theme.fg("toolTitle", theme.bold("pubmed_search ")) +
				theme.fg("accent", "PubMed");
			if (retmax && retmax !== 20) {
				text += theme.fg("muted", ` [max=${retmax}]`);
			}
			text += `\n  ${theme.fg("dim", term.slice(0, 80))}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as { term?: string; totalCount?: number; returned?: number; error?: string } | undefined;
			if (!details) {
				return new Text(result.content[0]?.type === "text" ? result.content[0].text : "(no output)", 0, 0);
			}
			if (details.error) {
				return new Text(theme.fg("error", `✗ ${details.error}`), 0, 0);
			}
			const success = theme.fg("success", `✓ ${details.returned} results`) +
				theme.fg("muted", ` / ${details.totalCount} total`);
			if (!expanded) {
				return new Text(success, 0, 0);
			}
			const text = result.content[0]?.type === "text" ? result.content[0].text : "";
			return new Text(success + "\n" + theme.fg("dim", text.slice(0, 500)), 0, 0);
		},
	});
}
