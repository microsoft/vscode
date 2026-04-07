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
import { IChatPromptFileService } from '../common/chatPromptFileService';


export class ChatPromptFileService extends Disposable implements IChatPromptFileService {
	declare _serviceBrand: undefined;
	private readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents: Event<void> = this._onDidChangeCustomAgents.event;
	private readonly _onDidChangeInstructions = this._register(new Emitter<void>());
	readonly onDidChangeInstructions: Event<void> = this._onDidChangeInstructions.event;
	private readonly _onDidChangeSkills = this._register(new Emitter<void>());
	readonly onDidChangeSkills: Event<void> = this._onDidChangeSkills.event;
	private readonly _onDidChangeHooks = this._register(new Emitter<void>());
	readonly onDidChangeHooks: Event<void> = this._onDidChangeHooks.event;
	private readonly _onDidChangePlugins = this._register(new Emitter<void>());
	readonly onDidChangePlugins: Event<void> = this._onDidChangePlugins.event;

	private _customAgents: ParsedPromptFile[] = [];
	private refreshCts: CancellationTokenSource | undefined;

	constructor(
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(vscode.chat.onDidChangeCustomAgents(() => {
			this.triggerRefreshCustomAgents();
		}));

		this._register(vscode.chat.onDidChangeInstructions(() => {
			this._onDidChangeInstructions.fire();
		}));

		this._register(vscode.chat.onDidChangeSkills(() => {
			this._onDidChangeSkills.fire();
		}));

		if (vscode.chat.onDidChangeHooks) {
			this._register(vscode.chat.onDidChangeHooks(() => {
				this._onDidChangeHooks.fire();
			}));
		}

		if (vscode.chat.onDidChangePlugins) {
			this._register(vscode.chat.onDidChangePlugins(() => {
				this._onDidChangePlugins.fire();
			}));
		}
		this.triggerRefreshCustomAgents();
	}

	get customAgentPromptFiles(): readonly ParsedPromptFile[] {
		return [...this._customAgents];
	}

	get customAgents(): readonly vscode.ChatResource[] {
		return vscode.chat.customAgents;
	}

	get instructions(): readonly vscode.ChatResource[] {
		return vscode.chat.instructions;
	}

	get skills(): readonly vscode.ChatResource[] {
		return vscode.chat.skills;
	}

	get hooks(): readonly vscode.ChatResource[] {
		return vscode.chat.hooks ?? [];
	}

	get plugins(): readonly vscode.ChatResource[] {
		return vscode.chat.plugins ?? [];
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
				this.logService.error(`[ChatPromptFileService] Failed to parse custom agent ${resource.uri.toString()}`, error);
				return undefined;
			}
		})));

		if (token.isCancellationRequested) {
			return;
		}

		this._customAgents = parsedAgents;
		this._onDidChangeCustomAgents.fire();
	}
}

