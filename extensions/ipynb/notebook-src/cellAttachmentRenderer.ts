/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as MarkdownIt from 'markdown-it';
import type * as MarkdownItToken from 'markdown-it/lib/token';
import type { RendererContext } from 'vscode-notebook-renderer';

interface MarkdownItRenderer {
	extendMarkdownIt(fn: (md: MarkdownIt) => void): void;
}

export async function activate(ctx: RendererContext<void>) {
	const markdownItRenderer = (await ctx.getRenderer('vscode.markdown-it-renderer')) as MarkdownItRenderer | any;
	if (!markdownItRenderer) {
		throw new Error(`Could not load 'vscode.markdown-it-renderer'`);
	}

	markdownItRenderer.extendMarkdownIt((md: MarkdownIt) => {
		const original = md.renderer.rules.image;
		md.renderer.rules.image = (tokens: MarkdownItToken[], idx: number, options, env, self) => {
			const token = tokens[idx];
			const src = token.attrGet('src');
			const attachments: Record<string, Record<string, string>> | undefined = env.outputItem.metadata?.attachments;
			if (attachments && src && src.startsWith('attachment:')) {
				const imageAttachment = attachments[tryDecodeURIComponent(src.replace('attachment:', ''))];
				if (imageAttachment) {
					// objEntries will always be length 1, with objEntries[0] holding [0]=mime,[1]=b64
					// if length = 0, something is wrong with the attachment, mime/b64 weren't copied over
					const objEntries = Object.entries(imageAttachment);
					if (objEntries.length) {
						const [attachmentKey, attachmentVal] = objEntries[0];
						const b64Markdown = 'data:' + attachmentKey + ';base64,' + attachmentVal;
						token.attrSet('src', b64Markdown);
					}
				}
			}

			if (original) {
				return original(tokens, idx, options, env, self);
			} else {
				return self.renderToken(tokens, idx, options);
			}
		};
	});
}

function tryDecodeURIComponent(uri: string) {
	try {
		return decodeURIComponent(uri);
	} catch {
		return uri;
	}
}
