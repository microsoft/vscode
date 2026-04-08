/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../platform/log/common/logService';
import { IPromptsService, ParsedPromptFile } from '../../../platform/promptFiles/common/promptsService';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { CancellationToken, CancellationTokenSource } from '../../../util/vs/base/common/cancellation';
import { isCancellationError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IChatCustomAgentsService } from '../common/chatCustomAgentsService';


export class ChatCustomAgentsService extends Disposable implements IChatCustomAgentsService {
	declare _serviceBrand: undefined;
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;

	private customAgents: ParsedPromptFile[] = [];
	private refreshCts: CancellationTokenSource | undefined;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(vscode.chat.onDidChangeCustomAgents(() => {
			this.triggerRefreshCustomAgents();
		}));

		this.triggerRefreshCustomAgents();
	}

	getCustomAgents(): ParsedPromptFile[] {
		return [...this.customAgents];
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
		const parsedAgents = coalesce(await Promise.all(vscode.chat.customAgents.map(async resource => {
			try {
				return await this.promptsService.parseFile(resource.uri, token);
			} catch (error) {
				if (isCancellationError(error) || token.isCancellationRequested) {
					return undefined;
				}
				this.logService.error(`[ChatCustomAgentsService] Failed to parse custom agent ${resource.uri.toString()}`, error);
				return undefined;
			}
		})));

		if (token.isCancellationRequested) {
			return;
		}

		this.customAgents = parsedAgents;
		this._onDidChangeCustomAgents.fire();
	}
}
