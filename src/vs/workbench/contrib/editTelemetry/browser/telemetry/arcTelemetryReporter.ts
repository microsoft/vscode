/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { TimeoutTimer } from '../../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservableWithChange, IObservable, runOnChange } from '../../../../../base/common/observable.js';
import { BaseStringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { StringText } from '../../../../../editor/common/core/text/abstractText.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { ArcTracker } from '../../common/arcTracker.js';
import type { ScmRepoAdapter } from './scmAdapter.js';

export class ArcTelemetryReporter extends Disposable {
	private readonly _arcTracker;
	private readonly _initialBranchName: string | undefined;

	private readonly _initialLineCounts;

	constructor(
		private readonly _timesMs: number[],
		private readonly _documentValueBeforeTrackedEdit: StringText,
		private readonly _document: { value: IObservableWithChange<StringText, { edit: BaseStringEdit }> },
		// _markedEdits -> document.value
		private readonly _gitRepo: IObservable<ScmRepoAdapter | undefined>,
		private readonly _trackedEdit: BaseStringEdit,
		private readonly _sendTelemetryEvent: (res: ArcTelemetryReporterData) => void,
		private readonly _onBeforeDispose: () => void,
		@ITelemetryService private readonly _telemetryService: ITelemetryService
	) {
		super();

		this._arcTracker = new ArcTracker(this._documentValueBeforeTrackedEdit, this._trackedEdit);

		this._store.add(toDisposable(() => {
			this._onBeforeDispose();
		}));

		this._store.add(runOnChange(this._document.value, (_val, _prevVal, changes) => {
			const edit = BaseStringEdit.composeOrUndefined(changes.map(c => c.edit));
			if (edit) {
				this._arcTracker.handleEdits(edit);
			}
		}));

		this._initialLineCounts = this._arcTracker.getLineCountInfo();

		this._initialBranchName = this._gitRepo.get()?.headBranchNameObs.get();

		for (let i = 0; i < this._timesMs.length; i++) {
			const timeMs = this._timesMs[i];

			if (timeMs <= 0) {
				this._report(timeMs);
			} else {
				this._reportAfter(timeMs, i === this._timesMs.length - 1 ? () => {
					this.dispose();
				} : undefined);
			}
		}
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
		const currentBranch = this._gitRepo.get()?.headBranchNameObs.get();
		const didBranchChange = currentBranch !== this._initialBranchName;
		const currentLineCounts = this._arcTracker.getLineCountInfo();

		this._sendTelemetryEvent({
			telemetryService: this._telemetryService,
			timeDelayMs: timeMs,
			didBranchChange,
			arc: this._arcTracker.getAcceptedRestrainedCharactersCount(),
			originalCharCount: this._arcTracker.getOriginalCharacterCount(),

			currentLineCount: currentLineCounts.insertedLineCounts,
			currentDeletedLineCount: currentLineCounts.deletedLineCounts,
			originalLineCount: this._initialLineCounts.insertedLineCounts,
			originalDeletedLineCount: this._initialLineCounts.deletedLineCounts,
		});
	}
}

export interface ArcTelemetryReporterData {
	telemetryService: ITelemetryService;
	timeDelayMs: number;
	didBranchChange: boolean;
	arc: number;
	originalCharCount: number;

	currentLineCount: number;
	currentDeletedLineCount: number;
	originalLineCount: number;
	originalDeletedLineCount: number;
}
