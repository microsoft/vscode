/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type vscode from 'vscode';
import { IGitService } from '../../../platform/git/common/gitService';
import { resolveWorkspaceOTelMetadata, type WorkspaceOTelMetadata } from '../../../platform/otel/common/workspaceOTelMetadata';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { TimeoutTimer } from '../../../util/vs/base/common/async';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { StringEdit } from '../../../util/vs/editor/common/core/edits/stringEdit';
import { stringEditFromTextContentChange } from '../../editing/common/edit';
import { ArcTracker } from './arcTracker';
import { EditSurvivalTracker } from './editSurvivalTracker';

export interface EditSurvivalResult {
	readonly telemetryService: ITelemetryService;
	readonly fourGram: number;
	readonly noRevert: number;
	readonly timeDelayMs: number;
	readonly didBranchChange: boolean;
	readonly currentFileContent?: string;
	readonly workspace?: WorkspaceOTelMetadata;

	/**
	 * Set includeArc to get this!
	 * See ArcTracker.
	*/
	readonly arc?: number;

	/**
	 * Text states for each edit region
	 */
	readonly textBeforeAiEdits?: string[];
	readonly textAfterAiEdits?: string[];
	readonly textAfterUserEdits?: string[];
}

export class EditSurvivalReporter {
	private readonly _store = new DisposableStore();
	private readonly _editSurvivalTracker = new EditSurvivalTracker(this._documentTextBeforeMarkedEdits, this._markedEdits);
	private readonly _arcTracker = this._options.includeArc === true ? new ArcTracker(this._documentTextBeforeMarkedEdits, this._markedEdits) : undefined;
	private readonly _initialBranchName: string | undefined;

	/**
	 * ```
	 * _documentTextBeforeMarkedEdits
	 * 	----markedEdits---->
	 * 	----editsOnTop---->
	 * _document.getText()
	 *  ----onDidChangeTextDocument edits---->
	 * 		[30sec] -> telemetry event of survival rate of markedEdits
	 * 		[2min] -> ...
	 * 		[5min] -> ...
	 * 		[10min] -> ...
	 * ```
	*/
	constructor(
		private readonly _document: vscode.TextDocument,
		private readonly _documentTextBeforeMarkedEdits: string,
		private readonly _markedEdits: StringEdit,
		editsOnTop: StringEdit,
		private readonly _options: { includeArc?: boolean },
		private readonly _sendTelemetryEvent: (res: EditSurvivalResult) => void,
		@IWorkspaceService workspaceService: IWorkspaceService,
		@IGitService private readonly _gitService: IGitService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		this._store.add(workspaceService.onDidChangeTextDocument(e => {
			if (e.document !== this._document) {
				return;
			}
			const edits = stringEditFromTextContentChange(e.contentChanges);
			this._editSurvivalTracker.handleEdits(edits);
			this._arcTracker?.handleEdits(edits);
		}));

		this._editSurvivalTracker.handleEdits(editsOnTop);
		this._arcTracker?.handleEdits(editsOnTop);

		this._initialBranchName = this._gitService.activeRepository.get()?.headBranchName;

		// This aligns with github inline completions
		this._reportAfter(0);
		this._reportAfter(5 * 1000);
		this._reportAfter(30 * 1000);
		this._reportAfter(120 * 1000);
		this._reportAfter(300 * 1000);
		this._reportAfter(600 * 1000);
		// track up to 15min to allow for slower edit responses from legacy SD endpoint
		this._reportAfter(900 * 1000, () => {
			this._store.dispose();
		});
	}

	private _getCurrentBranchName() {
		return this._gitService.activeRepository.get()?.headBranchName;
	}

	private _reportAfter(timeoutMs: number, cb?: () => void) {
		const timer = new TimeoutTimer(() => {
			this._report(timeoutMs);
			timer.dispose();
			if (cb) {
				cb();
			}
		}, timeoutMs);
		this._store.add(timer);
	}

	private _report(timeMs: number): void {
		const survivalRate = this._editSurvivalTracker.computeTrackedEditsSurvivalScore();

		const currentBranch = this._getCurrentBranchName();
		const didBranchChange = currentBranch !== this._initialBranchName;
		const workspace = resolveWorkspaceOTelMetadata(this._gitService, this._document.uri);
		this._sendTelemetryEvent({
			telemetryService: this._telemetryService,
			fourGram: survivalRate.fourGram,
			noRevert: survivalRate.noRevert,
			timeDelayMs: timeMs,
			didBranchChange,
			currentFileContent: this._document.getText(),
			workspace,
			arc: this._arcTracker?.getAcceptedRestrainedCharactersCount(),
			textBeforeAiEdits: survivalRate.textBeforeAiEdits,
			textAfterAiEdits: survivalRate.textAfterAiEdits,
			textAfterUserEdits: survivalRate.textAfterUserEdits,
		});
	}

	public cancel(): void {
		this._store.dispose();
	}
}
