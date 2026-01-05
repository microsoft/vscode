/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, Command, EventEmitter, Event, workspace, Uri, l10n } from 'vscode';
import { Repository } from './repository';
import { anyEvent, dispose, filterEvent } from './util';
import { Branch, RefType, RemoteSourcePublisher } from './api/git';
import { IRemoteSourcePublisherRegistry } from './remotePublisher';
import { CheckoutOperation, CheckoutTrackingOperation, OperationKind } from './operation';

interface CheckoutStatusBarState {
	readonly isCheckoutRunning: boolean;
	readonly isCommitRunning: boolean;
	readonly isSyncRunning: boolean;
}

class CheckoutStatusBar {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	private _state: CheckoutStatusBarState;
	private get state() { return this._state; }
	private set state(state: CheckoutStatusBarState) {
		this._state = state;
		this._onDidChange.fire();
	}

	constructor(private repository: Repository) {
		this._state = {
			isCheckoutRunning: false,
			isCommitRunning: false,
			isSyncRunning: false
		};

		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);
		repository.onDidRunGitStatus(this._onDidChange.fire, this._onDidChange, this.disposables);
		repository.onDidChangeBranchProtection(this._onDidChange.fire, this._onDidChange, this.disposables);
	}

	get command(): Command | undefined {
		const operationData = [
			...this.repository.operations.getOperations(OperationKind.Checkout) as CheckoutOperation[],
			...this.repository.operations.getOperations(OperationKind.CheckoutTracking) as CheckoutTrackingOperation[]
		];

		const rebasing = !!this.repository.rebaseCommit;
		const label = operationData[0]?.refLabel ?? `${this.repository.headLabel}${rebasing ? ` (${l10n.t('Rebasing')})` : ''}`;
		const command = (this.state.isCheckoutRunning || this.state.isCommitRunning || this.state.isSyncRunning) ? '' : 'git.checkout';

		return {
			command,
			tooltip: `${label}, ${this.getTooltip()}`,
			title: `${this.getIcon()} ${label}`,
			arguments: [this.repository.sourceControl]
		};
	}

	private getIcon(): string {
		if (!this.repository.HEAD) {
			return '';
		}

		// Checkout
		if (this.state.isCheckoutRunning) {
			return '$(loading~spin)';
		}

		// Branch
		if (this.repository.HEAD.type === RefType.Head && this.repository.HEAD.name) {
			switch (true) {
				case this.repository.isBranchProtected():
					return '$(lock)';
				case this.repository.mergeInProgress || !!this.repository.rebaseCommit:
					return '$(git-branch-conflicts)';
				case this.repository.indexGroup.resourceStates.length > 0:
					return '$(git-branch-staged-changes)';
				case this.repository.workingTreeGroup.resourceStates.length + this.repository.untrackedGroup.resourceStates.length > 0:
					return '$(git-branch-changes)';
				default:
					return '$(git-branch)';
			}
		}

		// Tag
		if (this.repository.HEAD.type === RefType.Tag) {
			return '$(tag)';
		}

		// Commit
		return '$(git-commit)';
	}

	private getTooltip(): string {
		if (this.state.isCheckoutRunning) {
			return l10n.t('Checking Out Branch/Tag...');
		}

		if (this.state.isCommitRunning) {
			return l10n.t('Committing Changes...');

		}

		if (this.state.isSyncRunning) {
			return l10n.t('Synchronizing Changes...');
		}

		return l10n.t('Checkout Branch/Tag...');
	}

	private onDidChangeOperations(): void {
		const isCommitRunning = this.repository.operations.isRunning(OperationKind.Commit);
		const isCheckoutRunning = this.repository.operations.isRunning(OperationKind.Checkout) ||
			this.repository.operations.isRunning(OperationKind.CheckoutTracking);
		const isSyncRunning = this.repository.operations.isRunning(OperationKind.Sync) ||
			this.repository.operations.isRunning(OperationKind.Push) ||
			this.repository.operations.isRunning(OperationKind.Pull);

		this.state = { ...this.state, isCheckoutRunning, isCommitRunning, isSyncRunning };
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

interface SyncStatusBarState {
	readonly enabled: boolean;
	readonly isCheckoutRunning: boolean;
	readonly isCommitRunning: boolean;
	readonly isSyncRunning: boolean;
	readonly hasRemotes: boolean;
	readonly HEAD: Branch | undefined;
	readonly remoteSourcePublishers: RemoteSourcePublisher[];
}

class SyncStatusBar {

	private _onDidChange = new EventEmitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }
	private disposables: Disposable[] = [];

	private _state: SyncStatusBarState;
	private get state() { return this._state; }
	private set state(state: SyncStatusBarState) {
		this._state = state;
		this._onDidChange.fire();
	}

	constructor(private repository: Repository, private remoteSourcePublisherRegistry: IRemoteSourcePublisherRegistry) {
		this._state = {
			enabled: true,
			isCheckoutRunning: false,
			isCommitRunning: false,
			isSyncRunning: false,
			hasRemotes: false,
			HEAD: undefined,
			remoteSourcePublishers: remoteSourcePublisherRegistry.getRemoteSourcePublishers()
		};

		repository.onDidRunGitStatus(this.onDidRunGitStatus, this, this.disposables);
		repository.onDidChangeOperations(this.onDidChangeOperations, this, this.disposables);

		anyEvent(remoteSourcePublisherRegistry.onDidAddRemoteSourcePublisher, remoteSourcePublisherRegistry.onDidRemoveRemoteSourcePublisher)
			(this.onDidChangeRemoteSourcePublishers, this, this.disposables);

		const onEnablementChange = filterEvent(workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.enableStatusBarSync'));
		onEnablementChange(this.updateEnablement, this, this.disposables);
		this.updateEnablement();
	}

	private updateEnablement(): void {
		const config = workspace.getConfiguration('git', Uri.file(this.repository.root));
		const enabled = config.get<boolean>('enableStatusBarSync', true);

		this.state = { ... this.state, enabled };
	}

	private onDidChangeOperations(): void {
		const isCommitRunning = this.repository.operations.isRunning(OperationKind.Commit);
		const isCheckoutRunning = this.repository.operations.isRunning(OperationKind.Checkout) ||
			this.repository.operations.isRunning(OperationKind.CheckoutTracking);
		const isSyncRunning = this.repository.operations.isRunning(OperationKind.Sync) ||
			this.repository.operations.isRunning(OperationKind.Push) ||
			this.repository.operations.isRunning(OperationKind.Pull);

		this.state = { ...this.state, isCheckoutRunning, isCommitRunning, isSyncRunning };
	}

	private onDidRunGitStatus(): void {
		this.state = {
			...this.state,
			hasRemotes: this.repository.remotes.length > 0,
			HEAD: this.repository.HEAD
		};
	}

	private onDidChangeRemoteSourcePublishers(): void {
		this.state = {
			...this.state,
			remoteSourcePublishers: this.remoteSourcePublisherRegistry.getRemoteSourcePublishers()
		};
	}

	get command(): Command | undefined {
		if (!this.state.enabled) {
			return;
		}

		if (!this.state.hasRemotes) {
			if (this.state.remoteSourcePublishers.length === 0) {
				return;
			}

			const command = (this.state.isCheckoutRunning || this.state.isCommitRunning) ? '' : 'git.publish';
			const tooltip =
				this.state.isCheckoutRunning ? l10n.t('Checking Out Changes...') :
					this.state.isCommitRunning ? l10n.t('Committing Changes...') :
						this.state.remoteSourcePublishers.length === 1
							? l10n.t('Publish to {0}', this.state.remoteSourcePublishers[0].name)
							: l10n.t('Publish to...');

			return {
				command,
				title: `$(cloud-upload)`,
				tooltip,
				arguments: [this.repository.sourceControl]
			};
		}

		const HEAD = this.state.HEAD;
		let icon = '$(sync)';
		let text = '';
		let command = '';
		let tooltip = '';

		if (HEAD && HEAD.name && HEAD.commit) {
			if (HEAD.upstream) {
				if (HEAD.ahead || HEAD.behind) {
					text += this.repository.syncLabel;
				}

				command = 'git.sync';
				tooltip = this.repository.syncTooltip;
			} else {
				icon = '$(cloud-upload)';
				command = 'git.publish';
				tooltip = l10n.t('Publish Branch');
			}
		} else {
			command = '';
			tooltip = '';
		}

		if (this.state.isCheckoutRunning) {
			command = '';
			tooltip = l10n.t('Checking Out Changes...');
		}

		if (this.state.isCommitRunning) {
			command = '';
			tooltip = l10n.t('Committing Changes...');
		}

		if (this.state.isSyncRunning) {
			icon = '$(sync~spin)';
			command = '';
			tooltip = l10n.t('Synchronizing Changes...');
		}

		return {
			command,
			title: [icon, text].join(' ').trim(),
			tooltip,
			arguments: [this.repository.sourceControl]
		};
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

export class StatusBarCommands {

	readonly onDidChange: Event<void>;

	private syncStatusBar: SyncStatusBar;
	private checkoutStatusBar: CheckoutStatusBar;
	private disposables: Disposable[] = [];

	constructor(repository: Repository, remoteSourcePublisherRegistry: IRemoteSourcePublisherRegistry) {
		this.syncStatusBar = new SyncStatusBar(repository, remoteSourcePublisherRegistry);
		this.checkoutStatusBar = new CheckoutStatusBar(repository);
		this.onDidChange = anyEvent(this.syncStatusBar.onDidChange, this.checkoutStatusBar.onDidChange);
	}

	get commands(): Command[] {
		return [this.checkoutStatusBar.command, this.syncStatusBar.command]
			.filter((c): c is Command => !!c);
	}

	dispose(): void {
		this.syncStatusBar.dispose();
		this.checkoutStatusBar.dispose();
		this.disposables = dispose(this.disposables);
	}
}
