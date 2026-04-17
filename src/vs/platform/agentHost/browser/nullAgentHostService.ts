/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IReference } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import type { IAgentCreateSessionConfig, IAgentHostService, IAgentHostSocketInfo, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult } from '../common/agentService.js';
import type { IAgentSubscription } from '../common/state/agentSubscription.js';
import type { ICreateTerminalParams, IResolveSessionConfigResult, ISessionConfigCompletionsResult } from '../common/state/protocol/commands.js';
import type { IActionEnvelope, INotification, ISessionAction, ITerminalAction } from '../common/state/sessionActions.js';
import type { IResourceCopyParams, IResourceCopyResult, IResourceDeleteParams, IResourceDeleteResult, IResourceListResult, IResourceMoveParams, IResourceMoveResult, IResourceReadResult, IResourceWriteParams, IResourceWriteResult } from '../common/state/sessionProtocol.js';
import type { ComponentToState, IRootState, StateComponents } from '../common/state/sessionState.js';

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
	readonly onDidAction: Event<IActionEnvelope> = Event.None;

	get rootState(): IAgentSubscription<IRootState> { return notSupported(); }

	getSubscription<T extends StateComponents>(_kind: T, _resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> { return notSupported(); }
	getSubscriptionUnmanaged<T extends StateComponents>(_kind: T, _resource: URI): IAgentSubscription<ComponentToState[T]> | undefined { return undefined; }
	dispatch(_action: ISessionAction | ITerminalAction): void { notSupported(); }

	async restartAgentHost(): Promise<void> { notSupported(); }
	async authenticate(_params: IAuthenticateParams): Promise<IAuthenticateResult> { return notSupported(); }
	async listSessions(): Promise<IAgentSessionMetadata[]> { return []; }
	async createSession(_config?: IAgentCreateSessionConfig): Promise<URI> { return notSupported(); }
	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult> { return notSupported(); }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult> { return notSupported(); }
	async startWebSocketServer(): Promise<IAgentHostSocketInfo> { return notSupported(); }
	async disposeSession(_session: URI): Promise<void> { }
	async createTerminal(_params: ICreateTerminalParams): Promise<void> { notSupported(); }
	async disposeTerminal(_terminal: URI): Promise<void> { }
	async resourceList(_uri: URI): Promise<IResourceListResult> { return notSupported(); }
	async resourceRead(_uri: URI): Promise<IResourceReadResult> { return notSupported(); }
	async resourceWrite(_params: IResourceWriteParams): Promise<IResourceWriteResult> { return notSupported(); }
	async resourceCopy(_params: IResourceCopyParams): Promise<IResourceCopyResult> { return notSupported(); }
	async resourceDelete(_params: IResourceDeleteParams): Promise<IResourceDeleteResult> { return notSupported(); }
	async resourceMove(_params: IResourceMoveParams): Promise<IResourceMoveResult> { return notSupported(); }
}
