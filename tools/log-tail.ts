import { open } from "node:fs/promises";

/** Read only a bounded suffix, even for multi-GB logs or a single enormous line. */
export async function readLogTail(file: string, lines: number, signal?: AbortSignal): Promise<{ content: string; truncated: boolean }> {
	signal?.throwIfAborted();
	const handle = await open(file, "r");
	try {
		let position = (await handle.stat()).size;
		const chunks: Buffer[] = [];
		const maxBytes = 64 * 1024;
		let bytes = 0, newlines = 0;
		while (position > 0 && bytes < maxBytes && newlines < lines) {
			signal?.throwIfAborted();
			const length = Math.min(position, 16 * 1024, maxBytes - bytes);
			position -= length;
			const buffer = Buffer.allocUnsafe(length);
			const { bytesRead } = await handle.read(buffer, 0, length, position);
			const chunk = buffer.subarray(0, bytesRead);
			chunks.push(chunk);
			bytes += length;
			for (const byte of chunk) if (byte === 10) newlines++;
		}
		signal?.throwIfAborted();
		const buffer = Buffer.concat(chunks.reverse());
		// A byte-limited suffix may begin inside a UTF-8 character.
		let start = 0;
		if (position > 0) while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start++;
		return {
			content: buffer.subarray(start).toString("utf8").split("\n").slice(-lines).join("\n"),
			truncated: position > 0 && newlines < lines,
		};
	} finally {
		await handle.close();
	}
}
