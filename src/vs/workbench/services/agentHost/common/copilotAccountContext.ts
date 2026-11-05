/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Event, Relay } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { IObservable, observableFromEventOpts, waitForState } from '../../../../base/common/observable.js';
import { IAgentHostService } from '../../../../platform/agentHost/common/agentService.js';
import { CopilotAccountContext, copilotAccountContextKey, readCopilotAccountContext } from '../../../../platform/agentHost/common/copilotAccountContext.js';
import { localize } from '../../../../nls.js';

/** A read-only view of host state; loading and connection errors are not gate-off. */
export type CopilotAccountContextView = CopilotAccountContext | 'loading' | Error | undefined;

export function observeCopilotAccountContext(host: IAgentHostService, store: DisposableStore): IObservable<CopilotAccountContextView> {
	const relay = store.add(new Relay<void>());
	const bind = () => {
		if (!hasAgentHostConnection(host)) {
			relay.input = Event.None;
			return;
		}
		const root = host.rootState;
		relay.input = Event.any(Event.map(root.onDidChange, () => undefined), Event.map(root.onDidError ?? Event.None, () => undefined));
	};
	bind();
	store.add(host.onAgentHostStart(bind));
	return observableFromEventOpts({
		owner: store,
		equalsFn: structuralEquals<CopilotAccountContextView>,
	}, Event.any(relay.event, host.onAgentHostStart, Event.map(host.onAgentHostExit, () => undefined)), () => {
		if (!hasAgentHostConnection(host)) {
			return undefined;
		}
		const root = host.rootState.value;
		if (!root || root instanceof Error) {
			return root ?? 'loading';
		}
		const context = readCopilotAccountContext(root);
		return context === undefined && root.config?.values[copilotAccountContextKey] !== undefined
			? new Error(localize('invalidCopilotAccountContext', "The agent host returned an unsupported Copilot account state."))
			: context;
	});
}

function hasAgentHostConnection(host: IAgentHostService): boolean {
	return !!host.clientConnectionKind || host.authenticationPending.get() || !!host.initializeResult.get();
}

export async function resolveCopilotAccountContext(host: IAgentHostService, token: CancellationToken): Promise<CopilotAccountContext | undefined> {
	const store = new DisposableStore();
	const cancellation = store.add(new CancellationTokenSource(token));
	try {
		return await waitForState(observeCopilotAccountContext(host, store),
			(state): state is CopilotAccountContext | undefined => state !== 'loading' && !(state instanceof Error),
			state => state instanceof Error ? state : undefined, cancellation.token);
	} finally {
		cancellation.cancel();
		store.dispose();
	}
}

export function canCompleteCopilotAccountSetup(context: CopilotAccountContextView): boolean {
	return context === undefined || typeof context === 'object' && !(context instanceof Error) && context.kind === 'ready';
}
