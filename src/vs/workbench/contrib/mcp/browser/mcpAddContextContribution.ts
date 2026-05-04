/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextPick, IChatContextPickService } from '../../chat/browser/attachments/chatContextPickService.js';
import { IMcpService, McpCapability } from '../common/mcpTypes.js';
import { McpResourcePickHelper } from './mcpResourceQuickAccess.js';

export class McpAddContextContribution extends Disposable implements IWorkbenchContribution {
	private readonly _addContextMenu = this._register(new MutableDisposable());
	constructor(
		@IChatContextPickService private readonly _chatContextPickService: IChatContextPickService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IMcpService mcpService: IMcpService
	) {
		super();

		const hasServersWithResources = derived(reader => {
			let enabled = false;
			for (const server of mcpService.servers.read(reader)) {
				const cap = server.capabilities.read(undefined);
				if (cap === undefined) {
					enabled = true; // until we know more
				} else if (cap & McpCapability.Resources) {
					enabled = true;
					break;
				}
			}

			return enabled;
		});

		this._register(autorun(reader => {
			const enabled = hasServersWithResources.read(reader);
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
			isEnabled(widget) {
				return !!widget.attachmentCapabilities.supportsMCPAttachments;
			},
			asPicker: () => {
				const helper = this._instantiationService.createInstance(McpResourcePickHelper);
				return {
					placeholder: localize('mcp.addContext.placeholder', "Select MCP Resource..."),
					picks: (_query, token) => this._getResourcePicks(token, helper),
					goBack: () => {
						return helper.navigateBack();
					},
					dispose: () => {
						helper.dispose();
					}
				};
			},
		});
	}

	private _getResourcePicks(token: CancellationToken, helper: McpResourcePickHelper) {
		const picksObservable = helper.getPicks(token);

		return derived(this, reader => {

			const pickItems = picksObservable.read(reader);
			const picks: ChatContextPick[] = [];

			for (const [server, resources] of pickItems.picks) {
				if (resources.length === 0) {
					continue;
				}
				picks.push(McpResourcePickHelper.sep(server));
				for (const resource of resources) {
					picks.push({
						...McpResourcePickHelper.item(resource),
						asAttachment: () => helper.toAttachment(resource, server)
					});
				}
			}
			return { picks, busy: pickItems.isBusy };
		});
	}
}
