/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

/**
 * Maximum byte size of a single attached image. The IDE applies a 5MB
 * per-message total; the CLI is slightly more generous because the user
 * only sends one or two images per turn from the terminal.
 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Inline image attached to the next user turn. The CLI mirrors the IDE
 * `ImageAttachmentPayload` shape so the persistence + transport layers
 * stay symmetric across surfaces.
 */
export interface PendingAttachment {
	/** Absolute resolved path on disk — what's shown in transcript placeholders. */
	path: string;
	/** Basename for compact transcript rendering. */
	name: string;
	/** Detected MIME type (`image/png` etc.). */
	mime: string;
	/** Raw byte count for the size cap + UI summary. */
	sizeBytes: number;
	/** Base64-encoded contents, ready to ship as an `LlmContentPart` image. */
	base64: string;
}

/**
 * Supported image MIME types — matches the set the IDE webview accepts.
 * Files with other extensions are rejected with a clear error so the user
 * doesn't accidentally ship a binary that the model will reject downstream.
 */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
};

/**
 * Format a byte count as a short human-readable string (`24 KB`, `1.2 MB`).
 * Mirrors the transcript placeholder style used by the IDE chat panel.
 */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read an image from disk and return a fully-populated `PendingAttachment`,
 * or an `Error`-style result describing why the path was rejected. Validation
 * covers existence, regular-file-ness, recognised extension, and the byte
 * cap. The extension/MIME mapping is conservative — sniffing magic bytes
 * is overkill for the CLI surface and the model rejects malformed payloads
 * anyway.
 *
 * The input path is resolved against `cwd` so users can pass either a
 * relative path (`docs/foo.png`) or an absolute one. Tilde expansion is
 * NOT performed — the shell handles `~` in interactive contexts and
 * silently passing it through to `fs.stat` would surface a confusing error.
 */
export function loadAttachment(rawPath: string, cwd: string): { ok: true; attachment: PendingAttachment } | { ok: false; error: string } {
	if (!rawPath) {
		return { ok: false, error: 'no path supplied' };
	}
	const resolved = path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
	let stat: fs.Stats;
	try {
		stat = fs.statSync(resolved);
	} catch {
		return { ok: false, error: `file not found: ${rawPath}` };
	}
	if (!stat.isFile()) {
		return { ok: false, error: `not a regular file: ${rawPath}` };
	}
	if (stat.size > MAX_IMAGE_BYTES) {
		return { ok: false, error: `${path.basename(resolved)} is ${formatBytes(stat.size)} — over the ${formatBytes(MAX_IMAGE_BYTES)} cap` };
	}
	const ext = path.extname(resolved).toLowerCase();
	const mime = MIME_BY_EXT[ext];
	if (!mime) {
		return { ok: false, error: `${path.basename(resolved)} is not a supported image (png, jpg, jpeg, gif, webp)` };
	}
	let bytes: Buffer;
	try {
		bytes = fs.readFileSync(resolved);
	} catch (err) {
		return { ok: false, error: `could not read ${rawPath}: ${err instanceof Error ? err.message : String(err)}` };
	}
	return {
		ok: true,
		attachment: {
			path: resolved,
			name: path.basename(resolved),
			mime,
			sizeBytes: stat.size,
			base64: bytes.toString('base64'),
		},
	};
}

/**
 * Build the single-line transcript placeholder that renders ABOVE the user's
 * typed prompt when an attachment is in flight. Matches the IDE convention
 * of a paperclip glyph plus a compact count + sizes summary.
 */
export function describeAttachments(attachments: ReadonlyArray<PendingAttachment>): string {
	if (attachments.length === 0) {
		return '';
	}
	const summary = attachments
		.map((a) => `${a.name} (${formatBytes(a.sizeBytes)})`)
		.join(', ');
	const noun = attachments.length === 1 ? 'attachment' : 'attachments';
	return `📎 ${attachments.length} ${noun}: ${summary}`;
}
