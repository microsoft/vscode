/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILanguageModelsService } from '../../../chat/common/languageModels.js';
import { IChatService } from '../../../chat/common/chatService.js';
import { racePollingOrPrompt, promptForMorePolling, pollForOutputAndIdle } from './bufferOutputPolling.js';
import { IMarkerService } from '../../../../../platform/markers/common/markers.js';
import { Task } from '../../../tasks/common/taskService.js';

export interface IOutputMonitor extends Disposable {
	readonly isIdle: boolean;

	readonly onDidFinishCommand: Event<void>;
	readonly onDidIdle: Event<void>;
	readonly onDidTimeout: Event<void>;

	startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }>;
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _isIdle = false;

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand = this._onDidFinishCommand.event;
	private readonly _onDidIdle = this._register(new Emitter<void>());
	readonly onDidIdle = this._onDidIdle.event;
	private readonly _onDidTimeout = this._register(new Emitter<void>());
	readonly onDidTimeout = this._onDidTimeout.event;

	get isIdle(): boolean {
		return this._isIdle;
	}

	constructor(
		private readonly _execution: { getOutput: () => string; isActive?: () => Promise<boolean>; task?: Task; beginsPattern?: string; endsPattern?: string; dependencyTasks?: Task[] },
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IMarkerService private readonly _markerService: IMarkerService
	) {
		super();
	}

	async startMonitoring(
		chatService: IChatService,
		command: string,
		invocationContext: any,
		token: CancellationToken
	): Promise<{ terminalExecutionIdleBeforeTimeout: boolean; output: string; pollDurationMs?: number; modelOutputEvalResponse?: string }> {
		let result = await pollForOutputAndIdle(this._execution, false, token, this._languageModelsService, this._markerService);

		if (!result.terminalExecutionIdleBeforeTimeout) {
			result = await racePollingOrPrompt(
				() => pollForOutputAndIdle(this._execution, true, token, this._languageModelsService, this._markerService),
				() => promptForMorePolling(command, token, invocationContext, chatService),
				result,
				token,
				this._languageModelsService,
				this._markerService,
				this._execution
			);
		}

		return result;
	}
}
