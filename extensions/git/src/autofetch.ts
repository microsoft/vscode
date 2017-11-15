/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, Disposable, EventEmitter } from 'vscode';
import { GitErrorCodes } from './git';
import { Repository } from './repository';
import { eventToPromise, filterEvent } from './util';

export class AutoFetcher {

	private static Period = 3 * 60 * 1000 /* three minutes */;

	private _onDidChange = new EventEmitter<boolean>();
	private onDidChange = this._onDidChange.event;

	private _enabled: boolean = false;
	get enabled(): boolean { return this._enabled; }
	set enabled(enabled: boolean) { this._enabled = enabled; this._onDidChange.fire(enabled); }

	private disposables: Disposable[] = [];

	constructor(private repository: Repository) {
		workspace.onDidChangeConfiguration(this.onConfiguration, this, this.disposables);
		this.onConfiguration();
	}

	private onConfiguration(): void {
		const gitConfig = workspace.getConfiguration('git');

		if (gitConfig.get<boolean>('autofetch') === false) {
			this.disable();
		} else {
			this.enable();
		}
	}

	enable(): void {
		if (this.enabled) {
			return;
		}

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
				await this.repository.fetch();
			} catch (err) {
				if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
					this.disable();
				}
			}

			if (!this.enabled) {
				return;
			}

			const timeout = new Promise(c => setTimeout(c, AutoFetcher.Period));
			const whenDisabled = eventToPromise(filterEvent(this.onDidChange, enabled => !enabled));
			await Promise.race([timeout, whenDisabled]);
		}
	}

	dispose(): void {
		this.disable();
		this.disposables.forEach(d => d.dispose());
	}
}
