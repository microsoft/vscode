/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, Disposable } from 'vscode';
import { GitErrorCodes } from './git';
import { Model } from './model';
import { throttle } from './decorators';

export class AutoFetcher {

	private static Period = 3 * 60 * 1000 /* three minutes */;
	private disposables: Disposable[] = [];
	private timer: NodeJS.Timer;

	constructor(private model: Model) {
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
		if (this.timer) {
			return;
		}

		this.fetch();
		this.timer = setInterval(() => this.fetch(), AutoFetcher.Period);
	}

	disable(): void {
		clearInterval(this.timer);
	}

	@throttle
	private async fetch(): Promise<void> {
		try {
			await this.model.fetch();
		} catch (err) {
			if (err.gitErrorCode === GitErrorCodes.AuthenticationFailed) {
				this.disable();
			}
		}
	}

	dispose(): void {
		this.disable();
		this.disposables.forEach(d => d.dispose());
	}
}
