/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from '../../../../../amdX.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, autorun, keepObserved } from '../../../../../base/common/observable.js';
import { Proxied } from '../../../../../base/common/worker/webWorker.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IBackgroundTokenizationStore, ILanguageIdCodec } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { TokenizationStateStore } from '../../../../../editor/common/model/textModelTokens.js';
import { deserializeFontTokenOptions, IFontTokenOption, IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { IModelContentChange } from '../../../../../editor/common/model/mirrorTextModel.js';
import { ContiguousMultilineTokensBuilder } from '../../../../../editor/common/tokens/contiguousMultilineTokensBuilder.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { MonotonousIndexTransformer } from '../indexTransformer.js';
import type { StateDeltas, TextMateTokenizationWorker } from './worker/textMateTokenizationWorker.worker.js';
import type { applyStateStackDiff, StateStack } from 'vscode-textmate';
import { linesLengthEditFromModelContentChange } from '../../../../../editor/common/model/textModelStringEdit.js';
import { StringEdit } from '../../../../../editor/common/core/edits/stringEdit.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { AnnotationsUpdate, ISerializedAnnotation } from '../../../../../editor/common/model/tokens/annotations.js';

export class TextMateWorkerTokenizerController extends Disposable {
	private static _id = 0;

	public readonly controllerId;
	private readonly _pendingChanges: IModelContentChangedEvent[];

	/**
	 * These states will eventually equal the worker states.
	 * _states[i] stores the state at the end of line number i+1.
	 */
	private readonly _states;

	private readonly _loggingEnabled;

	private _applyStateStackDiffFn?: typeof applyStateStackDiff;
	private _initialState?: StateStack;

	constructor(
		private readonly _model: ITextModel,
		private readonly _worker: Proxied<TextMateTokenizationWorker>,
		private readonly _languageIdCodec: ILanguageIdCodec,
		private readonly _backgroundTokenizationStore: IBackgroundTokenizationStore,
		private readonly _configurationService: IConfigurationService,
		private readonly _maxTokenizationLineLength: IObservable<number>,
	) {
		super();
		this.controllerId = TextMateWorkerTokenizerController._id++;
		this._pendingChanges = [];
		this._states = new TokenizationStateStore<StateStack>();
		this._loggingEnabled = observableConfigValue('editor.experimental.asyncTokenizationLogging', false, this._configurationService);

		this._register(keepObserved(this._loggingEnabled));

		this._register(this._model.onDidChangeContent((e) => {
			if (this._shouldLog) {
				console.log('model change', {
					fileName: this._model.uri.fsPath.split('\\').pop(),
					changes: changesToString(e.changes),
				});
			}
			this._worker.$acceptModelChanged(this.controllerId, e);
			this._pendingChanges.push(e);
		}));

		this._register(this._model.onDidChangeLanguage((e) => {
			const languageId = this._model.getLanguageId();
			const encodedLanguageId =
				this._languageIdCodec.encodeLanguageId(languageId);
			this._worker.$acceptModelLanguageChanged(
				this.controllerId,
				languageId,
				encodedLanguageId
			);
		}));

		const languageId = this._model.getLanguageId();
		const encodedLanguageId = this._languageIdCodec.encodeLanguageId(languageId);
		this._worker.$acceptNewModel({
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
			this._worker.$acceptMaxTokenizationLineLength(this.controllerId, maxTokenizationLineLength);
		}));
	}

	public override dispose(): void {
		super.dispose();
		this._worker.$acceptRemovedModel(this.controllerId);
	}

	public requestTokens(startLineNumber: number, endLineNumberExclusive: number): void {
		this._worker.$retokenize(this.controllerId, startLineNumber, endLineNumberExclusive);
	}

	/**
	 * This method is called from the worker through the worker host.
	 */
	public async setTokensAndStates(controllerId: number, versionId: number, rawTokens: Uint8Array, fontTokens: ISerializedAnnotation<IFontTokenOption>[], stateDeltas: StateDeltas[]): Promise<void> {
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
		const fontTokensUpdate = AnnotationsUpdate.deserialize(fontTokens, deserializeFontTokenOptions());

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
				this._pendingChanges.map((c) => linesLengthEditFromModelContentChange(c.changes))
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
			fontTokensUpdate.rebase(this._stringEditFromChanges(this._model, this._pendingChanges));
		}

		const curToFutureTransformerStates = MonotonousIndexTransformer.fromMany(
			this._pendingChanges.map((c) => linesLengthEditFromModelContentChange(c.changes))
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
		this._backgroundTokenizationStore.setFontInfo(fontTokensUpdate);
	}

	private _stringEditFromChanges(model: ITextModel, pendingChanges: IModelContentChangedEvent[]): StringEdit {
		const edits: StringEdit[] = [];
		for (const change of pendingChanges) {
			for (const innerChanges of change.changes) {
				const range = Range.lift(innerChanges.range);
				const text = innerChanges.text;
				const offsetEditStart = model.getOffsetAt(range.getStartPosition());
				const offsetEditEnd = model.getOffsetAt(range.getEndPosition());
				edits.push(StringEdit.replace(new OffsetRange(offsetEditStart, offsetEditEnd), text));
			}
		}
		return StringEdit.compose(edits);
	}

	private get _shouldLog() { return this._loggingEnabled.get(); }

}

function changesToString(changes: IModelContentChange[]): string {
	return changes.map(c => Range.lift(c.range).toString() + ' => ' + c.text).join(' & ');
}
