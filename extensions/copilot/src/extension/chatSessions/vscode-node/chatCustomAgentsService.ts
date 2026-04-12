/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IChatCustomAgentsService } from '../common/chatCustomAgentsService';


export class ChatCustomAgentsService extends Disposable implements IChatCustomAgentsService {
	declare _serviceBrand: undefined;
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;

	private customAgents: readonly vscode.ChatCustomAgent[] = [];
	private refreshCts: CancellationTokenSource | undefined;

	constructor(
	) {
		super();

		this._register(vscode.chat.onDidChangeCustomAgents(() => {
			this.triggerRefreshCustomAgents();
		}));

		this.triggerRefreshCustomAgents();
	}

	getCustomAgents(): readonly vscode.ChatCustomAgent[] {
		return this.customAgents;
	}

	override dispose(): void {
		this.refreshCts?.dispose(true);
		this.refreshCts = undefined;
		super.dispose();
	}

	private triggerRefreshCustomAgents(): void {
		this.refreshCts?.dispose(true);
		const refreshCts = new CancellationTokenSource();
		this.refreshCts = refreshCts;

		void this.refreshCustomAgents(refreshCts.token).finally(() => {
			if (this.refreshCts === refreshCts) {
				this.refreshCts = undefined;
			}
			refreshCts.dispose();
		});
	}

	private async refreshCustomAgents(token: CancellationToken): Promise<void> {
		try {
			const customAgents = await vscode.chat.getCustomAgents(token);

			if (token.isCancellationRequested) {
				return;
			}

			this.customAgents = customAgents;
			this._onDidChangeCustomAgents.fire();
		} catch (error) {
			if (token.isCancellationRequested) {
				return;
			}

			console.error('Failed to refresh custom agents', error);
		}
	}
}
