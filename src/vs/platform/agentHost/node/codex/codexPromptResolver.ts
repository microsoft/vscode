/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { MessageAttachmentKind, type MessageAttachment, type MessageEmbeddedResourceAttachment } from '../../common/state/sessionState.js';
import type { UserInput } from './protocol/generated/v2/UserInput.js';
import type { TextElement } from './protocol/generated/v2/TextElement.js';

/**
 * Translate the agent host's `(prompt, attachments)` shape into codex's
 * `turn/start.input[]`.
 *
 * Phase 2 minimum:
 *  - The prompt text becomes a single `{ type: 'text' }` input item.
 *  - `Resource` attachments referencing local files are inlined into the
 *    text as `@<path>` mentions so codex's prompt template picks them up.
 *  - `Simple` attachments with a `modelRepresentation` get appended to the
 *    prompt text as a separate paragraph.
 *  - `EmbeddedResource` attachments with an `image/*` content type are
 *    written to a temp file and surfaced as `{ type: 'localImage' }`. The
 *    returned files are tracked in `cleanupPaths` so the caller can unlink
 *    them after the turn completes.
 *  - `EmbeddedResource` attachments carrying textual content (e.g. the live
 *    text of an unsaved / dirty editor or a code selection, which the client
 *    inlines as a `text/plain` embedded resource) are base64-decoded and
 *    inlined into the prompt as a labelled fenced block so codex sees the
 *    exact in-memory content — a path mention would read the stale on-disk
 *    file (or nothing at all for untitled buffers). Non-textual, non-image
 *    embedded resources (e.g. `application/pdf`) are still dropped.
 *
 * Skill / app mentions are deferred to a later phase.
 */
export interface IResolvedCodexInput {
	readonly input: ReadonlyArray<UserInput>;
	/** Temporary files created during resolution. Caller MUST unlink. */
	readonly cleanupPaths: readonly string[];
}

const EMPTY_TEXT_ELEMENTS: TextElement[] = [];

export function resolveCodexInput(
	prompt: string,
	attachments: readonly MessageAttachment[] | undefined,
): IResolvedCodexInput {
	const cleanupPaths: string[] = [];
	const input: UserInput[] = [];
	const textChunks: string[] = [prompt];

	if (attachments && attachments.length > 0) {
		for (const att of attachments) {
			switch (att.type) {
				case MessageAttachmentKind.Resource: {
					// Resource attachments reference a URI (on the wire,
					// already a string). For file URIs we inline the
					// absolute path as a `@<path>` mention so the codex
					// prompt template can render / read it.
					const uri = URI.parse(att.uri);
					if (uri.scheme === 'file') {
						textChunks.push(`@${uri.fsPath}`);
					} else {
						// Non-file URIs (vscode-userdata://, untitled://, …)
						// are surfaced as a plain string so they still show
						// up in the prompt, even if codex can't resolve them.
						textChunks.push(uri.toString());
					}
					break;
				}
				case MessageAttachmentKind.EmbeddedResource: {
					if (att.contentType.startsWith('image/')) {
						const ext = guessImageExtension(att.contentType);
						const tmp = join(os.tmpdir(), `codex-img-${crypto.randomBytes(8).toString('hex')}${ext}`);
						try {
							fs.writeFileSync(tmp, Buffer.from(att.data, 'base64'));
							cleanupPaths.push(tmp);
							input.push({ type: 'localImage', path: tmp });
						} catch {
							// If writing the temp file fails, drop the
							// attachment silently — better to send the prompt
							// without the image than to fail the whole turn.
						}
						break;
					}
					if (isTextualContentType(att.contentType)) {
						// The client inlines the live text of an unsaved / dirty
						// editor (or a selection within one) as a `text/plain`
						// embedded resource. Decode it and inline it into the
						// prompt so codex sees the exact in-memory content — a
						// `@<path>` mention would read the stale on-disk file (or
						// nothing at all for an untitled buffer).
						const inlined = renderTextualEmbeddedResource(att);
						if (inlined) {
							textChunks.push(inlined);
						}
						break;
					}
					// Non-textual, non-image embedded resources (e.g.
					// application/pdf) are not supported and are dropped.
					break;
				}
				case MessageAttachmentKind.Simple: {
					const rep = att.modelRepresentation;
					if (typeof rep === 'string' && rep.length > 0) {
						textChunks.push(rep);
					}
					break;
				}
			}
		}
	}

	const text = textChunks.filter(s => s.length > 0).join('\n\n');
	// Always include a text input first, even if empty (codex needs at
	// least one element).
	input.unshift({ type: 'text', text, text_elements: EMPTY_TEXT_ELEMENTS });

	return { input, cleanupPaths };
}

function guessImageExtension(contentType: string): string {
	const subtype = contentType.slice('image/'.length).toLowerCase();
	switch (subtype) {
		case 'jpeg':
		case 'jpg':
			return '.jpg';
		case 'png':
			return '.png';
		case 'gif':
			return '.gif';
		case 'webp':
			return '.webp';
		case 'bmp':
			return '.bmp';
		default:
			return '';
	}
}

/**
 * Whether an embedded resource's content type carries UTF-8 text that can be
 * inlined into the prompt. Covers `text/*` plus a small allow-list of textual
 * `application/*` types. Anything else (e.g. `application/pdf`,
 * `application/octet-stream`) is treated as binary and dropped.
 */
function isTextualContentType(contentType: string): boolean {
	const type = contentType.toLowerCase().split(';', 1)[0].trim();
	if (type.startsWith('text/')) {
		return true;
	}
	// Structured-text application subtypes and the `+json` / `+xml` suffixes.
	return type === 'application/json'
		|| type === 'application/xml'
		|| type === 'application/javascript'
		|| type === 'application/typescript'
		|| type.endsWith('+json')
		|| type.endsWith('+xml');
}

/**
 * Decode a textual {@link MessageEmbeddedResourceAttachment} (e.g. the live
 * text of an unsaved / dirty editor or a selection within one) and render it
 * as a labelled fenced block for inlining into the prompt. Returns `undefined`
 * when the payload decodes to empty text so the caller can skip it.
 */
function renderTextualEmbeddedResource(att: MessageEmbeddedResourceAttachment): string | undefined {
	let content: string;
	try {
		content = Buffer.from(att.data, 'base64').toString('utf8');
	} catch {
		return undefined;
	}
	if (content.length === 0) {
		return undefined;
	}
	const label = att.label || 'attachment';
	const range = att.selection?.range;
	// Positions on the wire are zero-based; render them one-based for humans.
	const suffix = range
		? ` (lines ${range.start.line + 1}-${range.end.line + 1})`
		: '';
	// A fenced block keeps the inlined text visually distinct from the prompt
	// and prevents backtick-free content from bleeding into surrounding markup.
	return `${label}${suffix}:\n\`\`\`\n${content}\n\`\`\``;
}
