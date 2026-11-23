/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownSyntaxTokens } from '../../../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { escape } from '../../../../../../../base/common/strings.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../../editor/common/core/ranges/offsetRange.js';
import { PositionOffsetTransformer } from '../../../../../../../editor/common/core/text/positionToOffset.js';
import { ILinksList, LinkProvider } from '../../../../../../../editor/common/languages.js';
import { Edge, ILinkComputerTarget, LinkComputer, State, StateMachine } from '../../../../../../../editor/common/languages/linkComputer.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { localize2 } from '../../../../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SESSION_LINK_SCHEME, parseExternalOpenSessionLinkUri, parseOpenSessionLinkUri } from '../../../../../../../platform/agentHost/common/openSessionLink.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { getMarkdownTokenRanges } from '../../../../common/attachments/chatInlineAttachments.js';
import { chatInputSchemes } from '../../../../common/constants.js';
import { ChatRequestTextPart, IParsedChatRequest } from '../../../../common/requestParser/chatParserTypes.js';

/** A link to an agent session in a chat input. */
export interface IChatInputSessionLink {
	readonly range: Range;
	/** The `agent-host-session://` link that opens the session, which the link in the input carries. */
	readonly link: URI;
}

/**
 * Finds the links to agent sessions in a chat input: `agent-host-session://`
 * links, and product protocol URLs that carry one, such as those that Copy Link
 * copies. Ordinary links that contain a session link are left alone.
 */
export class ChatInputSessionLinkDetector {
	private readonly _stateMachines: readonly StateMachine[];

	constructor(
		productUrlProtocol: string,
		private readonly _logService: ILogService,
	) {
		const schemes = new Set([AGENT_HOST_SESSION_LINK_SCHEME, Schemas.vscode, `${Schemas.vscode}-insiders`, productUrlProtocol]);
		this._stateMachines = [...schemes].map(scheme => {
			const prefix = `${scheme}://`;
			const edges: Edge[] = [];
			for (let i = 0; i < prefix.length; i++) {
				const from = i === 0 ? State.Start : State.LastKnownState + i - 1;
				const to = i === prefix.length - 1 ? State.End : State.LastKnownState + i;
				edges.push([from, prefix.charCodeAt(i), to]);
			}
			return new StateMachine(edges);
		});
	}

	/** The session links in `model`, in the order they appear. */
	detect(model: ILinkComputerTarget): IChatInputSessionLink[] {
		// Every session link, including a product protocol URL that carries one, names the scheme.
		if (!hasLineIncluding(model, AGENT_HOST_SESSION_LINK_SCHEME)) {
			return [];
		}
		const links: IChatInputSessionLink[] = [];
		const ordinaryLinks = LinkComputer.computeLinks(model);
		for (const stateMachine of this._stateMachines) {
			for (const link of LinkComputer.computeLinks(model, stateMachine)) {
				if (typeof link.url !== 'string' || ordinaryLinks.some(ordinaryLink => Range.containsRange(ordinaryLink.range, link.range))) {
					continue;
				}
				let sessionLink: URI | undefined;
				try {
					const uri = URI.parse(link.url);
					sessionLink = uri.scheme === AGENT_HOST_SESSION_LINK_SCHEME
						? parseOpenSessionLinkUri(uri) ? uri : undefined
						: parseExternalOpenSessionLinkUri(uri, uri.scheme);
				} catch (error) {
					this._logService.warn('Failed to parse session link in chat input', error);
					continue;
				}
				if (sessionLink) {
					links.push({ range: Range.lift(link.range), link: sessionLink });
				}
			}
		}
		return links.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
	}
}

function hasLineIncluding(model: ILinkComputerTarget, text: string): boolean {
	for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
		if (model.getLineContent(lineNumber).includes(text)) {
			return true;
		}
	}
	return false;
}

/**
 * Turns the plain session links in the text of a submitted request into
 * Markdown links, so that they render as rich session links, as they do in
 * responses. The text parts of the result hold Markdown and are for rendering
 * only; the request keeps its text.
 */
export function linkSessionMentions(message: IParsedChatRequest, detector: ChatInputSessionLinkDetector): IParsedChatRequest {
	const lines = message.text.split(/\r?\n/);
	const links = detector.detect({ getLineCount: () => lines.length, getLineContent: lineNumber => lines[lineNumber - 1] });
	if (!links.length) {
		return message;
	}

	const positions = new PositionOffsetTransformer(message.text);
	// Code renders as written, and authored links, images and link reference definitions keep their own text and target.
	const keptRanges = getMarkdownTokenRanges(message.text, token => token.type === 'code' || token.type === 'codespan' || token.type === 'link' || token.type === 'image', true);
	const htmlCodeRanges = getMarkdownHtmlCodeRanges(message.text);
	const matches = links.map(({ range, link }) => ({
		link,
		offset: new OffsetRange(positions.getOffset(range.getStartPosition()), positions.getOffset(range.getEndPosition())),
	})).filter(match => isPlainMarkdownLink(message.text, match.offset) && !keptRanges.some(range => range.intersects(match.offset)) && !htmlCodeRanges.some(range => range.intersects(match.offset)));
	let changed = false;
	const parts = message.parts.map(part => {
		if (!(part instanceof ChatRequestTextPart)) {
			return part;
		}
		let markdown = '';
		let copiedUntil = part.range.start;
		for (const { link, offset } of matches) {
			if (offset.start < copiedUntil || offset.endExclusive > part.range.endExclusive) {
				continue;
			}
			const label = escapeMarkdownSyntaxTokens(escape(message.text.slice(offset.start, offset.endExclusive)));
			const href = link.toString().replace(/\(/g, '%28').replace(/\)/g, '%29');
			markdown += `${message.text.slice(copiedUntil, offset.start)}[${label}](${href})`;
			copiedUntil = offset.endExclusive;
		}
		if (copiedUntil === part.range.start) {
			return part;
		}
		changed = true;
		return new ChatRequestTextPart(part.range, part.editorRange, markdown + message.text.slice(copiedUntil, part.range.endExclusive));
	});
	return changed ? { text: message.text, parts } : message;
}

function getMarkdownHtmlCodeRanges(text: string): OffsetRange[] {
	const htmlRanges = getMarkdownTokenRanges(text, token => token.type === 'html');
	const codeRanges: OffsetRange[] = [];
	const openTags: { name: string; contentStart: number }[] = [];
	const codeTags = /<!--[\s\S]*?-->|<\/?(?:code|pre)\b[^>]*>/gi;
	for (const htmlRange of htmlRanges) {
		const html = text.slice(htmlRange.start, htmlRange.endExclusive);
		let match: RegExpExecArray | null;
		while ((match = codeTags.exec(html))) {
			if (match[0].startsWith('<!--')) {
				continue;
			}
			const tag = /^<\s*(\/?)\s*(code|pre)\b/i.exec(match[0]);
			if (!tag) {
				continue;
			}
			const name = tag[2].toLowerCase();
			if (tag[1]) {
				let openIndex = openTags.length - 1;
				while (openIndex >= 0 && openTags[openIndex].name !== name) {
					openIndex--;
				}
				if (openIndex >= 0) {
					codeRanges.push(new OffsetRange(openTags[openIndex].contentStart, htmlRange.start + match.index));
					openTags.splice(openIndex);
				}
			} else if (!/\/\s*>$/.test(match[0])) {
				openTags.push({ name, contentStart: htmlRange.start + match.index + match[0].length });
			}
		}
		codeTags.lastIndex = 0;
	}
	for (const openTag of openTags) {
		codeRanges.push(new OffsetRange(openTag.contentStart, text.length));
	}
	return codeRanges;
}

/**
 * Whether the link at `range` is plain text in Markdown, rather than part of
 * authored Markdown or HTML, such as `[text](link)`, `<link>` or `href="link"`,
 * which must keep rendering as written.
 */
function isPlainMarkdownLink(text: string, range: OffsetRange): boolean {
	const lineStart = text.lastIndexOf('\n', range.start - 1) + 1;
	const before = text.slice(lineStart, range.start);
	const after = text.charAt(range.endExclusive);
	return /(?:^|\s|(?:^|[^\]])\()$/.test(before)
		&& /^[\s).,;:!?]?$/.test(after);
}

export class ChatInputSessionLinkProvider extends Disposable implements LinkProvider {
	private readonly _detector: ChatInputSessionLinkDetector;

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IProductService productService: IProductService,
		@ILogService logService: ILogService,
	) {
		super();
		this._detector = new ChatInputSessionLinkDetector(productService.urlProtocol, logService);
		this._register(languageFeaturesService.linkProvider.register(chatInputSchemes.map(scheme => ({ scheme, hasAccessToAllModels: true })), this));
		this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: { id: 'editor.action.openLink', title: localize2('openLink', "Open Link") },
			when: ChatContextKeys.enabled,
		}));
	}

	provideLinks(model: ITextModel): ILinksList {
		return { links: this._detector.detect(model).map(({ range, link }) => ({ range, url: link })) };
	}
}
