/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentCanvasInstance, IAgentCanvasOperation, IAgentCanvases, IAgentCanvasSnapshot } from '../../common/agentHostCanvases.js';
import type { OpenCanvasParams } from '../../common/state/protocol/channels-canvas/commands.js';
import { CanvasAvailabilityStatus, CanvasSourceKind, CanvasTrustStatus, type CanvasIdentityKey, type CanvasSourcePresentation, type CanvasState, type CanvasTrustState } from '../../common/state/protocol/channels-canvas/state.js';
import { buildDefaultChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostCanvasesService } from '../../node/agentHostCanvasesService.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostProviderService } from '../../node/agentHostProviderService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { validateCanvasInput } from '../../node/agentHostCanvasSchema.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { MockAgent } from './mockAgent.js';
import { NullAgentHostWorktreeIsolation, type IAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';

export const canvasSession = 'copilot:/canvas-test';
export const canvasChat = buildDefaultChatUri(canvasSession);
export const canvasIdentity: CanvasIdentityKey = {
	chat: canvasChat, source: { kind: CanvasSourceKind.Extension, extensionId: 'project:counter' }, canvasType: 'counter', instanceId: 'main',
};

export class TestCanvases extends Disposable implements IAgentCanvases {
	private readonly _onDidChange = this._register(new Emitter<IAgentCanvasSnapshot>());
	readonly onDidChange = this._onDidChange.event;
	available = true;
	initialized = true;
	defersHostTurnStart = false;
	onInitialize?: (chat: string, operation: IAgentCanvasOperation) => Promise<void>;
	instanceIdScope: 'chat' | undefined;
	readiness: Promise<void> | undefined;
	trust: CanvasTrustState = { status: CanvasTrustStatus.Trusted };
	readonly calls: string[] = [];
	resolveResult: CanvasSourcePresentation = { url: 'http://127.0.0.1:8123/canvas?ephemeral=not-persisted' };
	resolveGate?: Promise<CanvasSourcePresentation>;
	invokeResult: unknown = { count: 1 };
	invokeGate?: Promise<void>;
	beforeValidate?: () => void;
	schemaReference: unknown;
	snapshot: IAgentCanvasSnapshot = {
		chat: canvasChat, generation: 'first',
		types: [{ source: canvasIdentity.source, canvasType: 'counter', title: 'Counter', declaredActions: [{ id: 'preview-only' }] }],
		instances: [],
	};

	getSnapshot(chat: string): IAgentCanvasSnapshot | undefined { return this.initialized && this.snapshot.chat === chat ? this.snapshot : undefined; }
	getTrust(): CanvasTrustState { return this.trust; }
	async prepare(): Promise<void> { this.calls.push('prepare'); }
	async initializeChat(chat: string, operation: IAgentCanvasOperation): Promise<void> {
		this.calls.push('initialize');
		if (!this.initialized) {
			operation.willExecute();
			await this.onInitialize?.(chat, operation);
			operation.willExecute();
			this.initialized = true;
		}
	}
	publish(snapshot: IAgentCanvasSnapshot): void {
		this.snapshot = snapshot;
		this._onDidChange.fire(snapshot);
	}
	instance(identity = canvasIdentity): IAgentCanvasInstance {
		return { identity, title: 'Counter', availability: { status: CanvasAvailabilityStatus.Ready, actions: [{ id: 'increment' }] } };
	}
	async open(params: OpenCanvasParams, operation: IAgentCanvasOperation): Promise<IAgentCanvasInstance> {
		operation.willExecute();
		this.calls.push('open');
		const instance = this.instance(params.identity);
		this.publish({ ...this.snapshot, closed: [], instances: [instance] });
		return instance;
	}
	async invoke(_state: CanvasState, _params: object, operation: IAgentCanvasOperation): Promise<unknown> {
		operation.willExecute();
		this.calls.push('invoke');
		await this.invokeGate;
		return this.invokeResult;
	}
	async close(state: CanvasState, operation: IAgentCanvasOperation): Promise<void> {
		operation.willExecute();
		this.calls.push('close');
		this.publish({ ...this.snapshot, closed: [state.identity], instances: [] });
	}
	async restart(_state: CanvasState, operation: IAgentCanvasOperation): Promise<void> {
		operation.willExecute();
		this.calls.push('restart');
		this.publish({ ...this.snapshot, generation: `${this.snapshot.generation}-next` });
	}
	async resolve(_state: CanvasState, clientId: string): Promise<CanvasSourcePresentation> {
		this.calls.push(`resolve:${clientId}`);
		return this.resolveGate ?? this.resolveResult;
	}
	async resolveSchema(): Promise<unknown> { return this.schemaReference; }
	async validateInput(_chat: string, _source: object, schema: object, input: unknown): Promise<void> {
		this.beforeValidate?.();
		validateCanvasInput(schema, input);
	}
}

class CanvasAgent extends MockAgent {
	constructor(readonly canvases: TestCanvases) { super('copilot'); }
}

export function createCanvasServices(store: Pick<DisposableStore, 'add'>, state = store.add(new AgentHostStateManager(new NullLogService())), connections = store.add(new AgentHostClientConnectionService()), worktree: IAgentHostWorktreeIsolation = new NullAgentHostWorktreeIsolation()) {
	const services = createCanvasHostServices(store, state, connections, worktree);
	const facet = store.add(new TestCanvases());
	services.providers.registerProvider(new CanvasAgent(facet));
	return { ...services, facet };
}

export function createCanvasHostServices(store: Pick<DisposableStore, 'add'>, state = store.add(new AgentHostStateManager(new NullLogService())), connections = store.add(new AgentHostClientConnectionService()), worktree: IAgentHostWorktreeIsolation = new NullAgentHostWorktreeIsolation()) {
	const database = new TestSessionDatabase();
	const authentication = store.add(new AgentHostAuthenticationService(new NullLogService()));
	const providers = store.add(new AgentHostProviderService(authentication, new NullLogService()));
	const service = store.add(new AgentHostCanvasesService(providers, state, createSessionDataService(database), new NullLogService(), connections, worktree, authentication, createTestGitHubEndpointService()));
	return { state, database, connections, providers, service };
}

export function createCanvasSession(state: AgentHostStateManager): void {
	state.createSession({
		resource: canvasSession, provider: 'copilot', title: 'Canvas Test', status: SessionStatus.Idle,
		createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
	});
}
