/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { ILink, ILinksList, LinkProvider } from '../../../../../../../editor/common/languages.js';
import { Edge, LinkComputer, State, StateMachine } from '../../../../../../../editor/common/languages/linkComputer.js';
import { ITextModel } from '../../../../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../../../../editor/common/services/languageFeatures.js';
import { localize2 } from '../../../../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { AGENT_HOST_SESSION_LINK_SCHEME, parseExternalOpenSessionLinkUri, parseOpenSessionLinkUri } from '../../../../../../../platform/agentHost/common/openSessionLink.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { chatInputSchemes } from '../../../../common/constants.js';

export class ChatInputSessionLinkProvider extends Disposable implements LinkProvider {
	private readonly stateMachines: readonly StateMachine[];

	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IProductService productService: IProductService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		const schemes = new Set([AGENT_HOST_SESSION_LINK_SCHEME, Schemas.vscode, `${Schemas.vscode}-insiders`, productService.urlProtocol]);
		this.stateMachines = [...schemes].map(scheme => {
			const prefix = `${scheme}://`;
			const edges: Edge[] = [];
			for (let i = 0; i < prefix.length; i++) {
				const from = i === 0 ? State.Start : State.LastKnownState + i - 1;
				const to = i === prefix.length - 1 ? State.End : State.LastKnownState + i;
				edges.push([from, prefix.charCodeAt(i), to]);
			}
			return new StateMachine(edges);
		});
		this._register(languageFeaturesService.linkProvider.register(chatInputSchemes.map(scheme => ({ scheme, hasAccessToAllModels: true })), this));
		this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
			command: { id: 'editor.action.openLink', title: localize2('openLink', "Open Link") },
			when: ChatContextKeys.enabled,
		}));
	}

	provideLinks(model: ITextModel): ILinksList {
		const links: ILink[] = [];
		const ordinaryLinks = LinkComputer.computeLinks(model);
		for (const stateMachine of this.stateMachines) {
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
					this.logService.warn('Failed to parse session link in chat input', error);
					continue;
				}
				if (sessionLink) {
					links.push({ range: link.range, url: sessionLink });
				}
			}
		}
		return { links: links.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range)) };
	}
}
