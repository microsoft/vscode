/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from 'vs/amdX';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, autorun, keepObserved, observableFromEvent } from 'vs/base/common/observable';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Range } from 'vs/editor/common/core/range';
import { IBackgroundTokenizationStore, ILanguageIdCodec } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { TokenizationStateStore } from 'vs/editor/common/model/textModelTokens';
import { IModelContentChange, IModelContentChangedEvent } from 'vs/editor/common/textModelEvents';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ArrayEdit, MonotonousIndexTransformer, SingleArrayEdit } from 'vs/workbench/services/textMate/browser/arrayOperation';
import type { StateDeltas, TextMateTokenizationWorker } from 'vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker';
import type { applyStateStackDiff, StateStack } from 'vscode-textmate';

export class TextMateWorkerTokenizerController extends Disposable {
	private static _id = 0;

	public readonly controllerId = TextMateWorkerTokenizerController._id++;
	private readonly _pendingChanges: IModelContentChangedEvent[] = [];

	/**
	 * These states will eventually equal the worker states.
	 * _states[i] stores the state at the end of line number i+1.
	 */
	private readonly _states = new TokenizationStateStore<StateStack>();

	private readonly _loggingEnabled = observableConfigValue('editor.experimental.asyncTokenizationLogging', false, this._configurationService);

	private _applyStateStackDiffFn?: typeof applyStateStackDiff;
	private _initialState?: StateStack;

	constructor(
		private readonly _model: ITextModel,
		private readonly _worker: TextMateTokenizationWorker,
		private readonly _languageIdCodec: ILanguageIdCodec,
		private readonly _backgroundTokenizationStore: IBackgroundTokenizationStore,
		private readonly _configurationService: IConfigurationService,
		private readonly _maxTokenizationLineLength: IObservable<number>,
	) {
		super();

		this._register(keepObserved(this._loggingEnabled));

		this._register(this._model.onDidChangeContent((e) => {
			if (this._shouldLog) {
				console.log('model change', {
					fileName: this._model.uri.fsPath.split('\\').pop(),
					changes: changesToString(e.changes),
				});
			}
			this._worker.acceptModelChanged(this.controllerId, e);
			this._pendingChanges.push(e);
		}));

		this._register(this._model.onDidChangeLanguage((e) => {
			const languageId = this._model.getLanguageId();
			const encodedLanguageId =
				this._languageIdCodec.encodeLanguageId(languageId);
			this._worker.acceptModelLanguageChanged(
				this.controllerId,
				languageId,
				encodedLanguageId
			);
		}));

		const languageId = this._model.getLanguageId();
		const encodedLanguageId = this._languageIdCodec.encodeLanguageId(languageId);
		this._worker.acceptNewModel({
			uri: this._model.uri,
			versionId: this._model.getVersionId(),
			lines: this._model.getLinesContent(),
			EOL: this._model.getEOL(),
			languageId,
			encodedLanguageId,
			maxTokenizationLineLength: this._maxTokenizationLineLength.get(),
			controllerId: this.controllerId,
		});

		this._register(autorun(reader => {
			/** @description update maxTokenizationLineLength */
			const maxTokenizationLineLength = this._maxTokenizationLineLength.read(reader);
			this._worker.acceptMaxTokenizationLineLength(this.controllerId, maxTokenizationLineLength);
		}));
	}

	public override dispose(): void {
		super.dispose();
		this._worker.acceptRemovedModel(this.controllerId);
	}

	public requestTokens(startLineNumber: number, endLineNumberExclusive: number): void {
		this._worker.retokenize(this.controllerId, startLineNumber, endLineNumberExclusive);
	}

	/**
	 * This method is called from the worker through the worker host.
	 */
	public async setTokensAndStates(controllerId: number, versionId: number, rawTokens: ArrayBuffer, stateDeltas: StateDeltas[]): Promise<void> {
		if (this.controllerId !== controllerId) {
			// This event is for an outdated controller (the worker didn't receive the delete/create messages yet), ignore the event.
			return;
		}

		// _states state, change{k}, ..., change{versionId}, state delta base & rawTokens, change{j}, ..., change{m}, current renderer state
		//                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^                                ^^^^^^^^^^^^^^^^^^^^^^^^^
		//                | past changes                                                   | future states

		let tokens = ContiguousMultilineTokensBuilder.deserialize(
			new Uint8Array(rawTokens)
		);

		if (this._shouldLog) {
			console.log('received background tokenization result', {
				fileName: this._model.uri.fsPath.split('\\').pop(),
				updatedTokenLines: tokens.map((t) => t.getLineRange()).join(' & '),
				updatedStateLines: stateDeltas.map((s) => new LineRange(s.startLineNumber, s.startLineNumber + s.stateDeltas.length).toString()).join(' & '),
			});
		}

		if (this._shouldLog) {
			const changes = this._pendingChanges.filter(c => c.versionId <= versionId).map(c => c.changes).map(c => changesToString(c)).join(' then ');
			console.log('Applying changes to local states', changes);
		}

		// Apply past changes to _states
		while (
			this._pendingChanges.length > 0 &&
			this._pendingChanges[0].versionId <= versionId
		) {
			const change = this._pendingChanges.shift()!;
			this._states.acceptChanges(change.changes);
		}

		if (this._pendingChanges.length > 0) {
			if (this._shouldLog) {
				const changes = this._pendingChanges.map(c => c.changes).map(c => changesToString(c)).join(' then ');
				console.log('Considering non-processed changes', changes);
			}

			const curToFutureTransformerTokens = MonotonousIndexTransformer.fromMany(
				this._pendingChanges.map((c) => fullLineArrayEditFromModelContentChange(c.changes))
			);

			// Filter tokens in lines that got changed in the future to prevent flickering
			// These tokens are recomputed anyway.
			const b = new ContiguousMultilineTokensBuilder();
			for (const t of tokens) {
				for (let i = t.startLineNumber; i <= t.endLineNumber; i++) {
					const result = curToFutureTransformerTokens.transform(i - 1);
					// If result is undefined, the current line got touched by an edit.
					// The webworker will send us new tokens for all the new/touched lines after it received the edits.
					if (result !== undefined) {
						b.add(i, t.getLineTokens(i) as Uint32Array);
					}
				}
			}
			tokens = b.finalize();

			// Apply future changes to tokens
			for (const change of this._pendingChanges) {
				for (const innerChanges of change.changes) {
					for (let j = 0; j < tokens.length; j++) {
						tokens[j].applyEdit(innerChanges.range, innerChanges.text);
					}
				}
			}
		}

		const curToFutureTransformerStates = MonotonousIndexTransformer.fromMany(
			this._pendingChanges.map((c) => fullLineArrayEditFromModelContentChange(c.changes))
		);

		if (!this._applyStateStackDiffFn || !this._initialState) {
			const { applyStateStackDiff, INITIAL } = await importAMDNodeModule<typeof import('vscode-textmate')>('vscode-textmate', 'release/main.js');
			this._applyStateStackDiffFn = applyStateStackDiff;
			this._initialState = INITIAL;
		}


		// Apply state deltas to _states and _backgroundTokenizationStore
		for (const d of stateDeltas) {
			let prevState = d.startLineNumber <= 1 ? this._initialState : this._states.getEndState(d.startLineNumber - 1);
			for (let i = 0; i < d.stateDeltas.length; i++) {
				const delta = d.stateDeltas[i];
				let state: StateStack;
				if (delta) {
					state = this._applyStateStackDiffFn(prevState, delta)!;
					this._states.setEndState(d.startLineNumber + i, state);
				} else {
					state = this._states.getEndState(d.startLineNumber + i)!;
				}

				const offset = curToFutureTransformerStates.transform(d.startLineNumber + i - 1);
				if (offset !== undefined) {
					// Only set the state if there is no future change in this line,
					// as this might make consumers believe that the state/tokens are accurate
					this._backgroundTokenizationStore.setEndState(offset + 1, state);
				}

				if (d.startLineNumber + i >= this._model.getLineCount() - 1) {
					this._backgroundTokenizationStore.backgroundTokenizationFinished();
				}

				prevState = state;
			}
		}
		// First set states, then tokens, so that events fired from set tokens don't read invalid states
		this._backgroundTokenizationStore.setTokens(tokens);
	}

	private get _shouldLog() { return this._loggingEnabled.get(); }

}

function fullLineArrayEditFromModelContentChange(c: IModelContentChange[]): ArrayEdit {
	return new ArrayEdit(
		c.map(
			(c) =>
				new SingleArrayEdit(
					c.range.startLineNumber - 1,
					// Expand the edit range to include the entire line
					c.range.endLineNumber - c.range.startLineNumber + 1,
					countEOL(c.text)[0] + 1
				)
		)
	);
}

function changesToString(changes: IModelContentChange[]): string {
	return changes.map(c => Range.lift(c.range).toString() + ' => ' + c.text).join(' & ');
}

function observableConfigValue<T>(key: string, defaultValue: T, configurationService: IConfigurationService): IObservable<T> {
	return observableFromEvent(
		(handleChange) => configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(key)) {
				handleChange(e);
			}
		}),
		() => configurationService.getValue<T>(key) ?? defaultValue,
	);
}
