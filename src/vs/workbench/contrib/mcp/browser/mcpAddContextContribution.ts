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

		this._helper.getPicks(servers => {
			const picks: ChatContextPick[] = [];
			for (const [server, resources] of servers) {
				if (resources.length === 0) {
					continue;
				}

				picks.push(McpResourcePickHelper.sep(server));
				for (const resource of resources) {
					picks.push({
						...McpResourcePickHelper.item(resource),
						asAttachment: () => this._helper.toAttachment(resource).then(r => {
							if (!r) {
								throw new CancellationError();
							} else {
								return r;
							}
						}),
					});
				}
			}
			observable.set({ picks, busy: true }, undefined);
		}, token).finally(() => {
			observable.set({ busy: false, picks: observable.get().picks }, undefined);
		});

		return observable;
	}
}
