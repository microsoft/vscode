/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError, Sequencer } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { DevContainerGitCredentialForwardingSettingId } from '../../../../common/devContainerAgentHostService.js';

/** Defers container-wide consent until a lookup and keeps decisions only for this VS Code run. */
export class DevContainerGitCredentialForwarding extends Disposable {
	private readonly _decisions = new Map<string, boolean>();
	private readonly _pending = new Map<string, { promise: Promise<boolean>; tokenSource: CancellationTokenSource }>();
	private readonly _connections = new Set<{ update: (enabled: boolean) => Promise<void> }>();
	private _disposed = false;

	constructor(
		private readonly _configurationService: IConfigurationService,
		private readonly _dialogService: IDialogService,
		private readonly _logService: ILogService,
	) {
		super();
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

	async request(workspaceUri: URI, containerKey: string, token: CancellationToken): Promise<boolean> {
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
		if (!pending) {
			const tokenSource = new CancellationTokenSource(token);
			const promise = this._confirm(workspaceUri, containerKey, tokenSource.token);
			pending = { promise, tokenSource };
			this._pending.set(containerKey, pending);
			const complete = () => {
				if (this._pending.get(containerKey) === pending) {
					this._pending.delete(containerKey);
				}
				tokenSource.dispose();
			};
			void promise.then(complete, complete);
		}
		return raceCancellationError(pending.promise, token);
	}

	private async _confirm(workspaceUri: URI, containerKey: string, token: CancellationToken): Promise<boolean> {
		const { confirmed } = await raceCancellationError(this._dialogService.confirm({
			type: 'warning',
			message: localize('devContainerGitCredentials.confirm', "Allow Git credential forwarding for this Dev Container?"),
			detail: localize('devContainerGitCredentials.detail', "A process in the Dev Container for '{0}' has requested HTTPS Git credentials from the workspace's host. Allowing forwarding makes credentials available to all sessions and processes in this shared container. Your decision is remembered for this container until VS Code restarts or the setting changes. Set {1} to 'off' to disable forwarding.", basename(workspaceUri), DevContainerGitCredentialForwardingSettingId),
			primaryButton: localize('devContainerGitCredentials.allow', "Allow"),
			cancelButton: localize('devContainerGitCredentials.decline', "Don't Allow"),
		}), token);
		if (token.isCancellationRequested || this._disposed) {
			throw new CancellationError();
		}
		this._decisions.set(containerKey, confirmed);
		return confirmed;
	}

	async registerConnection(update: (enabled: boolean) => Promise<void>): Promise<IDisposable> {
		const sequencer = new Sequencer();
		let disposed = false;
		const connection = { update: (enabled: boolean) => sequencer.queue(async () => {
			if (!disposed) {
				await update(enabled);
			}
		}) };
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
		for (const pending of this._pending.values()) {
			pending.tokenSource.cancel();
		}
		this._pending.clear();
	}

	override dispose(): void {
		this._disposed = true;
		this._cancelPendingRequests();
		this._decisions.clear();
		super.dispose();
	}
}
