/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/sessionState.js';
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
					}
					// Non-image embedded resources are not yet supported.
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
