/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceCancellationError, Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from '../../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationService.js';
import { DevContainerGitCredentialForwardingSettingId } from '../../../../common/devContainerAgentHostService.js';

interface IPendingGitCredentialApproval {
	readonly response: DeferredPromise<boolean>;
	readonly store: DisposableStore;
	readonly addresses: Set<string>;
	waiters: number;
}

/** Defers container-wide consent until a lookup and keeps decisions only for this VS Code run. */
export class DevContainerGitCredentialForwarding extends Disposable {
	private readonly _decisions = new Map<string, boolean>();
	private readonly _pending = new Map<string, IPendingGitCredentialApproval>();
	private readonly _connections = new Set<{ update: (enabled: boolean) => Promise<void> }>();
	private _disposed = false;

	constructor(
		private readonly _configurationService: IConfigurationService,
		private readonly _notificationService: IChatInputNotificationService,
		private readonly _connectionsService: IAgentHostConnectionsService,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(_connectionsService.onDidChangeSessionResolution(() => {
			if (this._pending.size > 0) {
				this._notificationService.refresh();
			}
		}));
		this._register(_configurationService.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration(DevContainerGitCredentialForwardingSettingId)) {
				this._cancelPendingRequests();
				this._decisions.clear();
				for (const connection of this._connections) {
					void connection.update(this._mode() !== 'off').catch(error =>
						this._logService.error('[DevContainerAgentHost] Failed to update Git credential forwarding', error));
				}
			}
		}));
	}

	private _mode(): 'off' | 'prompt' | 'on' {
		return this._configurationService.getValue<'off' | 'prompt' | 'on'>(DevContainerGitCredentialForwardingSettingId) ?? 'prompt';
	}

	async request(workspaceUri: URI, containerKey: string, address: string, token: CancellationToken): Promise<boolean> {
		if (this._disposed || token.isCancellationRequested) {
			throw new CancellationError();
		}
		switch (this._mode()) {
			case 'off': return false;
			case 'on': return true;
		}
		const decision = this._decisions.get(containerKey);
		if (decision !== undefined) {
			return decision;
		}
		let pending = this._pending.get(containerKey);
		const isNew = !pending;
		if (!pending) {
			pending = { response: new DeferredPromise<boolean>(), store: new DisposableStore(), addresses: new Set(), waiters: 0 };
			this._pending.set(containerKey, pending);
		}
		pending.waiters++;
		pending.addresses.add(address);
		try {
			if (isNew) {
				this._showApproval(workspaceUri, containerKey, pending);
			} else {
				this._notificationService.refresh();
			}
			return await raceCancellationError(pending.response.p, token);
		} finally {
			pending.waiters--;
			if (pending.waiters === 0) {
				this._completeApproval(containerKey, pending, false);
			}
		}
	}

	private _showApproval(workspaceUri: URI, containerKey: string, pending: IPendingGitCredentialApproval): void {
		const id = `devContainer.gitCredentials.${generateUuid()}`;
		const allowCommand = `${id}.allow`;
		const denyCommand = `${id}.deny`;
		pending.store.add(CommandsRegistry.registerCommand(allowCommand, () => this._completeApproval(containerKey, pending, true, true)));
		pending.store.add(CommandsRegistry.registerCommand(denyCommand, () => this._completeApproval(containerKey, pending, false, true)));
		pending.store.add(toDisposable(() => this._notificationService.deleteNotification(id)));
		this._notificationService.setNotification({
			id,
			telemetryId: 'devContainer.gitCredentials',
			severity: ChatInputNotificationSeverity.Warning,
			message: localize('devContainerGitCredentials.confirm', "Allow Git credential forwarding?"),
			description: localize('devContainerGitCredentials.detail', "A process in the Dev Container for '{0}' is requesting HTTPS Git credentials from the workspace's host. Approval applies to all sessions and processes sharing this container until VS Code restarts or the forwarding setting changes.", basename(workspaceUri)),
			actions: [
				{ kind: ChatInputNotificationActionKind.Command, label: localize('devContainerGitCredentials.allow', "Allow"), commandId: allowCommand, primary: true, telemetryActionId: 'allow' },
				{ kind: ChatInputNotificationActionKind.Command, label: localize('devContainerGitCredentials.decline', "Don't Allow"), commandId: denyCommand, primary: false, outlined: true, telemetryActionId: 'deny' },
			],
			when: context => {
				const identity = context.sessionResource && this._connectionsService.resolveSessionResourceIdentity(context.sessionResource);
				return !!identity?.connectionAddress && pending.addresses.has(identity.connectionAddress);
			},
			dismissible: false,
			autoDismissOnMessage: false,
		});
	}

	private _completeApproval(containerKey: string, pending: IPendingGitCredentialApproval, allowed: boolean, remember = false): void {
		if (this._pending.get(containerKey) !== pending) {
			return;
		}
		if (remember && this._mode() === 'prompt') {
			this._decisions.set(containerKey, allowed);
		}
		this._pending.delete(containerKey);
		void pending.response.complete(allowed);
		pending.store.dispose();
	}

	async registerConnection(update: (enabled: boolean) => Promise<void>): Promise<IDisposable> {
		const sequencer = new Sequencer();
		let disposed = false;
		const connection = {
			update: (enabled: boolean) => sequencer.queue(async () => {
				if (!disposed) {
					await update(enabled);
				}
			})
		};
		this._connections.add(connection);
		const registration = toDisposable(() => {
			disposed = true;
			this._connections.delete(connection);
		});
		try {
			await connection.update(this._mode() !== 'off');
			return registration;
		} catch (error) {
			registration.dispose();
			throw error;
		}
	}

	private _cancelPendingRequests(): void {
		for (const [containerKey, pending] of this._pending) {
			this._completeApproval(containerKey, pending, false);
		}
	}

	override dispose(): void {
		this._disposed = true;
		this._cancelPendingRequests();
		this._decisions.clear();
		super.dispose();
	}
}
