/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
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
import { chatInputSchemes } from '../../../../common/constants.js';

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
