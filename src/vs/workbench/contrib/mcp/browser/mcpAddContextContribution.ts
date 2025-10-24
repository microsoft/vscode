/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextPick, IChatContextPickService } from '../../chat/browser/chatContextPickService.js';
import { McpResourcePickHelper } from './mcpResourceQuickAccess.js';

export class McpAddContextContribution extends Disposable implements IWorkbenchContribution {
	private readonly _helper: McpResourcePickHelper;
	private readonly _addContextMenu = this._register(new MutableDisposable());
	constructor(
		@IChatContextPickService private readonly _chatContextPickService: IChatContextPickService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._helper = instantiationService.createInstance(McpResourcePickHelper);
		this._register(autorun(reader => {
			const enabled = this._helper.hasServersWithResources.read(reader);
			if (enabled && !this._addContextMenu.value) {
				this._registerAddContextMenu();
			} else {
				this._addContextMenu.clear();
			}
		}));
	}

	private _registerAddContextMenu() {
		this._addContextMenu.value = this._chatContextPickService.registerChatContextItem({
			type: 'pickerPick',
			label: localize('mcp.addContext', "MCP Resources..."),
			icon: Codicon.mcp,
			asPicker: () => ({
				placeholder: localize('mcp.addContext.placeholder', "Select MCP Resource..."),
				picks: (_query, token) => this._getResourcePicks(token),
			}),
		});
	}

	private _getResourcePicks(token: CancellationToken) {
		const observable = observableValue<{ busy: boolean; picks: ChatContextPick[] }>(this, { busy: true, picks: [] });

		const picksObservable = this._helper.getPicks(token);
		this._register(autorun(reader => {
			const servers = picksObservable.read(reader);
			const picks: ChatContextPick[] = [];
			for (const [server, resources] of servers) {
				if (resources.length === 0) {
					continue;
				}

				picks.push(McpResourcePickHelper.sep(server));
				for (const resource of resources) {
					picks.push({
						...McpResourcePickHelper.item(resource),
						validateForAttachment: (): Promise<boolean> => {
							if (this._helper.validateForAttachment) {
								return this._helper.validateForAttachment(resource, server);
							} else {
								return Promise.resolve(true);
							}
						},
						asAttachment: () => this._helper.toAttachment(resource, server).then(r => {
							if (!r) {
								throw new CancellationError();
							} else {
								return r;
							}
						}),
					});
				}
			}
			observable.set({ picks, busy: false }, undefined);
		}));

		return observable;
	}
}
