/*---------------------------------------------------------------------------------------------
 *  Copyright (c) stokd. Thin-patch fork — agent-aware terminal selector (AX-TERMINAL-AGENT-TABS).
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ITerminalChatService, ITerminalGroupService, ITerminalInstance } from '../terminal.js';
import { AgentRunState, IAgentRowMeta, mergeSelectorRows, SelectorRow } from './agentTerminalSelectorRows.js';

/**
 * The merged, DOM-free data model for the agent-aware terminal selector.
 *
 * It is the single consumer of the upstream terminal/agent services — which is
 * what keeps the blast radius of upstream interface drift to this one file
 * (AX-TERMINAL-AGENT-TABS). It fans the dozen-plus upstream events the stock
 * list subscribes to down into a single {@link onDidChange}, and delegates the
 * actual merge/de-dupe/sectioning to the pure, unit-tested
 * {@link mergeSelectorRows}.
 */
export class AgentTerminalSelectorModel extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires whenever the merged row list may have changed. */
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _rows: SelectorRow<ITerminalInstance>[] = [];
	get rows(): readonly SelectorRow<ITerminalInstance>[] { return this._rows; }

	constructor(
		@ITerminalGroupService private readonly _groupService: ITerminalGroupService,
		@ITerminalChatService private readonly _chatService: ITerminalChatService,
	) {
		super();
		this._recompute();

		// Single fan-in: structural changes, active-instance changes, and new
		// agent (tool-session) terminals all trigger one recompute + one event.
		const recompute = () => this._recompute();
		this._register(this._groupService.onDidChangeInstances(recompute));
		this._register(this._groupService.onDidChangeActiveInstance(recompute));
		this._register(this._chatService.onDidRegisterTerminalInstanceWithToolSession(recompute));
	}

	private _recompute(): void {
		const agents = this._chatService.getToolSessionTerminalInstances().map(instance => ({
			instance,
			meta: this._agentMeta(instance),
		}));
		this._rows = mergeSelectorRows<ITerminalInstance>({
			terminals: this._groupService.instances,
			agents,
		});
		this._onDidChange.fire();
	}

	private _agentMeta(instance: ITerminalInstance): IAgentRowMeta {
		const sessionId = this._chatService.getToolSessionIdForInstance(instance);
		const resource = this._chatService.getChatSessionResourceForInstance(instance);
		const isBackground = this._chatService.isBackgroundTerminal(sessionId);
		const sessionTitle = resource?.path?.split('/').pop() || instance.title || 'Agent';

		// Best-effort run-state for the Phase 2 skeleton. Richer status
		// (awaiting-approval + pending-approval counts) lands in Phase 4 via the
		// auto-approve rules already exposed on ITerminalChatService.
		let runState: AgentRunState = isBackground ? 'background' : 'idle';
		if (sessionId && this._chatService.getAhpCommandSource(sessionId)) {
			runState = 'running';
		}

		return { sessionTitle, runState, pendingApprovals: 0, isBackground };
	}
}
