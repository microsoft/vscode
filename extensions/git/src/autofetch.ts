/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, Disposable, EventEmitter, Memento, window, MessageItem, ConfigurationTarget } from 'vscode';
import { Repository, Operation } from './repository';
import { eventToPromise, filterEvent, onceEvent } from './util';
import * as nls from 'vscode-nls';
import { GitErrorCodes } from './api/git';

const localize = nls.loadMessageBundle();

function isRemoteOperation(operation: Operation): boolean {
	return operation === Operation.Pull || operation === Operation.Push || operation === Operation.Sync || operation === Operation.Fetch;
}

export class AutoFetcher {

	private static DidInformUser = 'autofetch.didInformUser';

	private _onDidChange = new EventEmitter<boolean | number>();
	private onDidChange = this._onDidChange.event;

	private _enabled: boolean = false;
	get enabled(): boolean { return this._enabled; }
	set enabled(enabled: boolean) { this._enabled = enabled; this._onDidChange.fire(enabled); }

	private _timeout: number = workspace.getConfiguration('git').get<number>('autofetchPeriod', 3) * 60 * 1000;
	private get timeout(): number { return this._timeout; }
	private set timeout(minutes: number) { this._timeout = minutes * 60 * 1000; this._onDidChange.fire(minutes); }

	private disposables: Disposable[] = [];

	constructor(private repository: Repository, private globalState: Memento) {
		workspace.onDidChangeConfiguration(this.onConfiguration, this, this.disposables);
		this.onConfiguration();

		const onGoodRemoteOperation = filterEvent(repository.onDidRunOperation, ({ operation, error }) => !error && isRemoteOperation(operation));
		const onFirstGoodRemoteOperation = onceEvent(onGoodRemoteOperation);
		onFirstGoodRemoteOperation(this.onFirstGoodRemoteOperation, this, this.disposables);
	}

	private async onFirstGoodRemoteOperation(): Promise<void> {
		const didInformUser = !this.globalState.get<boolean>(AutoFetcher.DidInformUser);

		if (this.enabled && !didInformUser) {
			this.globalState.update(AutoFetcher.DidInformUser, true);
		}

		const shouldInformUser = !this.enabled && didInformUser;

		if (!shouldInformUser) {
			return;
		}

		const yes: MessageItem = { title: localize('yes', "Yes") };
		const no: MessageItem = { isCloseAffordance: true, title: localize('no', "No") };
		const askLater: MessageItem = { title: localize('not now', "Ask Me Later") };
		const result = await window.showInformationMessage(localize('suggest auto fetch', "Would you like Code to [periodically run 'git fetch']({0})?", 'https://go.microsoft.com/fwlink/?linkid=865294'), yes, no, askLater);

		if (result === askLater) {
			return;
		}

		if (result === yes) {
			const gitConfig = workspace.getConfiguration('git');
			gitConfig.update('autofetch', true, ConfigurationTarget.Global);
		}

		this.globalState.update(AutoFetcher.DidInformUser, true);
	}

	private onConfiguration(): void {
		const gitConfig = workspace.getConfiguration('git');
		const minutes = gitConfig.get<number>('autofetchPeriod', 3);
		const autofetch = gitConfig.get<boolean>('autofetch');

		if (this.timeout !== minutes) {
			this.timeout = minutes;
		}

		if (this.enabled !== autofetch) {
			autofetch ? this.enable() : this.disable();
		}
	}

	enable(): void {
		this.enabled = true;
		this.run();
	}

	disable(): void {
		this.enabled = false;
	}

	private async run(): Promise<void> {
		while (this.enabled) {
			await this.repository.whenIdleAndFocused();

			if (!this.enabled) {
				return;
			}

			try {
				await this.repository.fetchDefault();
			} catch (err) {
				if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
					this.disable();
				}
			}

			if (!this.enabled) {
				return;
			}

			const timeout = new Promise(c => setTimeout(c, this.timeout));
			const onChanged = eventToPromise(filterEvent(this.onDidChange, () => true));
			await Promise.race([timeout, onChanged]);
		}
	}

	dispose(): void {
		this.disable();
		this.disposables.forEach(d => d.dispose());
	}
}
