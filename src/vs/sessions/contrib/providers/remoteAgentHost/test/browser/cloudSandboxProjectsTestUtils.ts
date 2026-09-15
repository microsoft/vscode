/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { RootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ICloudSandboxProject } from '../../browser/cloudSandboxProjectsClient.js';

export function createCloudSandboxProject(overrides: Partial<ICloudSandboxProject> = {}): ICloudSandboxProject {
	return {
		id: 'project-1',
		path: '/checkout/owner/repo',
		git: true,
		status: 'ready',
		remoteUrl: 'https://github.com/owner/repo',
		...overrides,
	};
}

export function createCloudSandboxProjectsTestConnection(store: Pick<DisposableStore, 'add'>, options: {
	projects?: readonly unknown[];
	capability?: unknown;
	legacy?: boolean;
	request?: () => Promise<unknown>;
} = {}) {
	const capability = options.legacy ? undefined : options.capability === undefined ? { available: true } : options.capability;
	const root = (projects: readonly unknown[]): RootState => ({
		agents: [],
		_meta: capability === undefined ? {} : { 'copilot.projectManagement': capability },
		config: { schema: { type: 'object', properties: {} }, values: { copilot: { projects } } },
	});
	let state: RootState | Error | undefined = root(options.projects ?? []);
	const changes = store.add(new Emitter<RootState>());
	const errors = store.add(new Emitter<Error>());
	const requested = new DeferredPromise<void>();
	const requests: { method: string; params: Record<string, unknown> }[] = [];
	const subscription: IAgentSubscription<RootState> = {
		get value() { return state; },
		get verifiedValue() { return state instanceof Error ? undefined : state; },
		onDidChange: changes.event,
		onDidError: errors.event,
		onWillApplyAction: Event.None,
		onDidApplyAction: Event.None,
	};
	const connection = store.add(upcastPartial<AgentHostProtocolClient>({
		rootState: subscription,
		onDidChangeConnectionState: Event.None,
		resourceUris: upcastPartial<AgentHostProtocolClient['resourceUris']>({
			fromAgentHost: uri => toAgentHostUri(uri, 'sandbox'),
		}),
		async requestHostExtension(method: string, params: Record<string, unknown>): Promise<unknown> {
			requests.push({ method, params });
			requested.complete();
			return options.request ? options.request() : { project: createCloudSandboxProject({ status: 'cloning', git: false, progress: 0 }) };
		},
		dispose: () => { },
	}));
	return {
		connection, requests, requested,
		setProjects: (projects: readonly unknown[]) => {
			const next = root(projects);
			state = next;
			changes.fire(next);
		},
		setRoot: (next: RootState | undefined) => {
			state = next;
			if (next) {
				changes.fire(next);
			}
		},
		failSubscription: (error: Error) => {
			state = error;
			errors.fire(error);
		},
		hasListeners: () => changes.hasListeners() || errors.hasListeners(),
	};
}
