/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as MarkdownIt from 'markdown-it';
// import type * as MarkdownItToken from 'markdown-it/lib/token';
import type { RendererContext } from 'vscode-notebook-renderer';

interface MarkdownItRenderer {
	extendMarkdownIt(fn: (md: MarkdownIt) => void): void;
}

export async function activate(ctx: RendererContext<void>) {
	console.log('CellAttachmentRenderer activation');
	const markdownItRenderer = (await ctx.getRenderer('vscode.markdown-it-renderer')) as MarkdownItRenderer | any;
	if (!markdownItRenderer) {
		throw new Error(`Could not load 'vscode.markdown-it-renderer'`);
	}
	markdownItRenderer.extendMarkdownIt((md: MarkdownIt) => {
		// addCellAttachmentRendering(md);
		// const originalRender = md.render;

		md.render = function () {
			const outputInfo = arguments[1].outputItem;

			const text = outputInfo.text();
			let markdownText = outputInfo.mime.startsWith('text/x-') ? `\`\`\`${outputInfo.mime.substr(7)}\n${text}\n\`\`\``
				: (outputInfo.mime.startsWith('application/') ? `\`\`\`${outputInfo.mime.substr(12)}\n${text}\n\`\`\`` : text);
			const attachments: Record<string, Record<string, string>> = (outputInfo.metadata as any).custom.attachments;
			if (attachments) {
				let attachmentName: keyof typeof attachments;
				for (attachmentName in attachments) {
					const [attachmentKey, attachmentVal] = Object.entries(attachments[attachmentName])[0];
					const attachmentData = 'data:' + attachmentKey + ';base64,' + attachmentVal;
					markdownText = markdownText.replace(`attachment:${attachmentName}`, attachmentData);
				}
			}
			// const unsanitizedRenderedMarkdown =
			return markdownText;
		};
	});
}

// function addCellAttachmentRendering(md: MarkdownIt): void {
// 	console.log('cell render fxn');
// 	const cell_attachment = md.renderer.rules.cell_attachment;
// 	md.renderer.rules.cell_attachment = (tokens: MarkdownItToken[], idx: number, options, env, self) => {
// 		// const token = tokens[idx];
// 		console.log('rule fxn');
// 		const outputInfo = env.outputItem;
// 		const text = outputInfo.text();
// 		let markdownText = outputInfo.mime.startsWith('text/x-') ? `\`\`\`${outputInfo.mime.substr(7)}\n${text}\n\`\`\``
// 			: (outputInfo.mime.startsWith('application/') ? `\`\`\`${outputInfo.mime.substr(12)}\n${text}\n\`\`\`` : text);
// 		const attachments: Record<string, Record<string, string>> = (outputInfo.metadata as any).custom.attachments;
// 		if (attachments) {
// 			let attachmentName: keyof typeof attachments;
// 			for (attachmentName in attachments) {
// 				const [attachmentKey, attachmentVal] = Object.entries(attachments[attachmentName])[0];
// 				const attachmentData = 'data:' + attachmentKey + ';base64,' + attachmentVal;
// 				markdownText = markdownText.replace(`attachment:${attachmentName}`, attachmentData);
// 			}
// 		}
// 		// const unsanitizedRenderedMarkdown =
// 		return md.render(markdownText, { outputItem: outputInfo, });
// 		// return self.renderToken(tokens, idx, options);
// 	};

// 	const originalRender = md.render;
// 	md.render = function () {
// 		return originalRender.apply(this, arguments as any);
// 	};
// }



	// md.renderer.rules.attachmentRender = (tokens: MarkdownItToken[], idx: number, options, env, self) => {
	// 	console.log('rule fxn');
	// 	const outputInfo = env.outputItem;
	// 	const text = outputInfo.text();
	// 	let markdownText = outputInfo.mime.startsWith('text/x-') ? `\`\`\`${outputInfo.mime.substr(7)}\n${text}\n\`\`\``
	// 		: (outputInfo.mime.startsWith('application/') ? `\`\`\`${outputInfo.mime.substr(12)}\n${text}\n\`\`\`` : text);
	// 	const attachments: Record<string, Record<string, string>> = (outputInfo.metadata as any).custom.attachments;
	// 	if (attachments) {
	// 		let attachmentName: keyof typeof attachments;
	// 		for (attachmentName in attachments) {
	// 			const [attachmentKey, attachmentVal] = Object.entries(attachments[attachmentName])[0];
	// 			const attachmentData = 'data:' + attachmentKey + ';base64,' + attachmentVal;
	// 			markdownText = markdownText.replace(`attachment:${attachmentName}`, attachmentData);
	// 		}
	// 	}
	// 	// const unsanitizedRenderedMarkdown =
	// 	const unsanitizedRenderedMarkdown = md.render(markdownText, { outputItem: outputInfo, });


	// 	return self.renderToken(tokens, idx, options);
	// };

	// const originalRender = md.render;
	// md.render = function () {
	// 	return originalRender.apply(this, arguments as any);
	// };


// FIXME: kinda works. data is there at least
// function addCellAttachmentRendering(md: MarkdownIt): void {
// 	console.log('cell render fxn');
// 	md.renderer.rules.attachmentRender = (tokens: MarkdownItToken[], idx: number, options, env, self) => {
// 		console.log('rule fxn');
// 		const outputInfo = env.outputItem;
// 		const text = outputInfo.text();
// 		let markdownText = outputInfo.mime.startsWith('text/x-') ? `\`\`\`${outputInfo.mime.substr(7)}\n${text}\n\`\`\``
// 			: (outputInfo.mime.startsWith('application/') ? `\`\`\`${outputInfo.mime.substr(12)}\n${text}\n\`\`\`` : text);
// 		const attachments: Record<string, Record<string, string>> = (outputInfo.metadata as any).custom.attachments;
// 		if (attachments) {
// 			let attachmentName: keyof typeof attachments;
// 			for (attachmentName in attachments) {
// 				const [attachmentKey, attachmentVal] = Object.entries(attachments[attachmentName])[0];
// 				const attachmentData = 'data:' + attachmentKey + ';base64,' + attachmentVal;
// 				markdownText = markdownText.replace(`attachment:${attachmentName}`, attachmentData);
// 			}
// 		}
// 		// const unsanitizedRenderedMarkdown =
// 		const unsanitizedRenderedMarkdown = md.render(markdownText, { outputItem: outputInfo, });


// 		return self.renderToken(tokens, idx, options);
// 	};

// 	const originalRender = md.render;
// 	md.render = function () {
// 		return originalRender.apply(this, arguments as any);
// 	};
// }


// implement code below to render cell attachments
// fIXME: metadata needs typing other than 'unknonw', rather than cast as any
// tODO: put attachments field as top level, instead of metadata->custom->attachments (match jupyter) ??? Maybe -- meeting
// const attachments = outputInfo.metadata.custom.attachments; // fIXME: might be messy, but I put a field "custom" within the NotebookCellMetadata interface. meeting with Peng/Matt to decide how to handle this
// const attachments: Record<string, Record<string, string>> = (outputInfo.metadata as any).custom.attachments;
// if (attachments) {
// 	let attachmentName: keyof typeof attachments;
// 	for (attachmentName in attachments) {
// 		const [attachmentKey, attachmentVal] = Object.entries(attachments[attachmentName])[0];
// 		const attachmentData = 'data:' + attachmentKey + ';base64,' + attachmentVal;
// 		markdownText = markdownText.replace(`attachment:${attachmentName}`, attachmentData);
// 	}
// }
