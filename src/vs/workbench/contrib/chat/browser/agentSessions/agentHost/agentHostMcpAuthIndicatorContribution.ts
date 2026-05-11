/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { McpServerStatusKind } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatWidget, IChatWidgetService } from '../../chat.js';
import { IAgentHostMcpAuthRegistry } from './agentHostMcpAuthRegistry.js';

/**
 * Per-chat-widget binding of {@link ChatContextKeys.mcpAuthRequiredCount}
 * to the count of MCP servers in `AuthRequired` state on the active AHP
 * session.
 *
 * The action contributed to the chat-input toolbar (see
 * `chatMcpAuthAction.ts`) gates its visibility on this key, so it
 * appears only when at least one server needs authentication.
 */
export class AgentHostMcpAuthIndicatorContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentHostMcpAuthIndicator';

	private readonly _widgetBindings = this._register(new DisposableMap<IChatWidget>());

	constructor(
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IAgentHostMcpAuthRegistry private readonly _registry: IAgentHostMcpAuthRegistry,
	) {
		super();

		for (const widget of this._chatWidgetService.getAllWidgets()) {
			this._bindWidget(widget);
		}
		this._register(this._chatWidgetService.onDidAddWidget(widget => this._bindWidget(widget)));
	}

	private _bindWidget(widget: IChatWidget): void {
		if (this._widgetBindings.has(widget)) {
			return;
		}

		const store = new DisposableStore();
		const countKey = ChatContextKeys.mcpAuthRequiredCount.bindTo(widget.scopedContextKeyService);

		// Single autorun covering session swap, registry register/unregister
		// race (the session handler may register its entry AFTER the chat
		// widget is created), and the entry's `mcpServers` observable.
		const sync = () => {
			autorunStore.clear();
			autorunStore.add(autorun(reader => {
				const sessionResource = widget.viewModel?.sessionResource;
				if (!sessionResource) {
					countKey.set(0);
					return;
				}
				const entry = this._registry.getEntry(sessionResource, reader);
				if (!entry) {
					countKey.set(0);
					return;
				}
				const summaries = entry.mcpServers.read(reader);
				let count = 0;
				for (const s of summaries) {
					if (s.status.kind === McpServerStatusKind.AuthRequired) {
						count++;
					}
				}
				countKey.set(count);
			}));
		};
		const autorunStore = store.add(new DisposableStore());

		store.add(widget.onDidChangeViewModel(() => sync()));
		sync();

		this._widgetBindings.set(widget, store);
	}
}
