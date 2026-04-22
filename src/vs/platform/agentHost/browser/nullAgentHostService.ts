/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IReference } from '../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentCreateSessionConfig, IAgentHostService, IAgentHostSocketInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, AuthenticateParams, AuthenticateResult } from '../common/agentService.js';
import type { IAgentSubscription } from '../common/state/agentSubscription.js';
import type { CreateTerminalParams, ResolveSessionConfigResult, SessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { ActionEnvelope, INotification, SessionAction, TerminalAction } from '../common/state/sessionActions.js';
import type { ResourceCopyParams, ResourceCopyResult, ResourceDeleteParams, ResourceDeleteResult, ResourceListResult, ResourceMoveParams, ResourceMoveResult, ResourceReadResult, ResourceWriteParams, ResourceWriteResult } from '../common/state/sessionProtocol.js';
import type { ComponentToState, RootState, StateComponents } from '../common/state/sessionState.js';

const notSupported = () => { throw new Error('Local agent host is not supported in the browser.'); };

/**
 * Null implementation of {@link IAgentHostService} for browser contexts
 * where a local agent host process is not available.
 */
export class NullAgentHostService implements IAgentHostService {
	declare readonly _serviceBrand: undefined;

	readonly clientId = '';
	readonly onAgentHostExit = Event.None;
	readonly onAgentHostStart = Event.None;
	readonly onDidNotification: Event<INotification> = Event.None;
	readonly onDidAction: Event<ActionEnvelope> = Event.None;

	readonly authenticationPending: IObservable<boolean> = constObservable(false);
	setAuthenticationPending(_pending: boolean): void { /* no-op */ }

	get rootState(): IAgentSubscription<RootState> { return notSupported(); }

	getSubscription<T extends StateComponents>(_kind: T, _resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> { return notSupported(); }
	getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, _resource: URI): IAgentSubscription<ComponentToState[T]> | undefined { return undefined; }
	dispatch(_action: SessionAction | TerminalAction): void { notSupported(); }

	async restartAgentHost(): Promise<void> { notSupported(); }
	async authenticate(_params: AuthenticateParams): Promise<AuthenticateResult> { return notSupported(); }
	async listSessions(): Promise<IAgentSessionMetadata[]> { return []; }
	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> { return notSupported(); }
	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> { return notSupported(); }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> { return notSupported(); }
	async startWebSocketServer(): Promise<IAgentHostSocketInfo> { return notSupported(); }
	async disposeSession(_session: URI): Promise<void> { }
	async createTerminal(_params: CreateTerminalParams): Promise<void> { notSupported(); }
	async disposeTerminal(_terminal: URI): Promise<void> { }
	async resourceList(_uri: URI): Promise<ResourceListResult> { return notSupported(); }
	async resourceRead(_uri: URI): Promise<ResourceReadResult> { return notSupported(); }
	async resourceWrite(_params: ResourceWriteParams): Promise<ResourceWriteResult> { return notSupported(); }
	async resourceCopy(_params: ResourceCopyParams): Promise<ResourceCopyResult> { return notSupported(); }
	async resourceDelete(_params: ResourceDeleteParams): Promise<ResourceDeleteResult> { return notSupported(); }
	async resourceMove(_params: ResourceMoveParams): Promise<ResourceMoveResult> { return notSupported(); }
}
