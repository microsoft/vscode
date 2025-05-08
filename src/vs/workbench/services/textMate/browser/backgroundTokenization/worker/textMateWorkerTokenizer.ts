/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from '../../../../../../amdX.js';
import { RunOnceScheduler } from '../../../../../../base/common/async.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { setTimeout0 } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { LineRange } from '../../../../../../editor/common/core/ranges/lineRange.js';
import { LanguageId } from '../../../../../../editor/common/encodedTokenAttributes.js';
import { IModelChangedEvent, MirrorTextModel } from '../../../../../../editor/common/model/mirrorTextModel.js';
import { TokenizerWithStateStore } from '../../../../../../editor/common/model/textModelTokens.js';
import { ContiguousMultilineTokensBuilder } from '../../../../../../editor/common/tokens/contiguousMultilineTokensBuilder.js';
import { LineTokens } from '../../../../../../editor/common/tokens/lineTokens.js';
import { TextMateTokenizationSupport } from '../../tokenizationSupport/textMateTokenizationSupport.js';
import { TokenizationSupportWithLineLimit } from '../../tokenizationSupport/tokenizationSupportWithLineLimit.js';
import type { StackDiff, StateStack, diffStateStacksRefEq } from 'vscode-textmate';
import { ICreateGrammarResult } from '../../../common/TMGrammarFactory.js';
import { StateDeltas } from './textMateTokenizationWorker.worker.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';

export interface TextMateModelTokenizerHost {
	getOrCreateGrammar(languageId: string, encodedLanguageId: LanguageId): Promise<ICreateGrammarResult | null>;
	setTokensAndStates(versionId: number, tokens: Uint8Array, stateDeltas: StateDeltas[]): void;
	reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean): void;
}

export class TextMateWorkerTokenizer extends MirrorTextModel {
	private _tokenizerWithStateStore: TokenizerWithStateStore<StateStack> | null = null;
	private _isDisposed: boolean = false;
	private readonly _maxTokenizationLineLength = observableValue(this, -1);
	private _diffStateStacksRefEqFn?: typeof diffStateStacksRefEq;
	private readonly _tokenizeDebouncer = new RunOnceScheduler(() => this._tokenize(), 10);

	constructor(
		uri: URI,
		lines: string[],
		eol: string,
		versionId: number,
		private readonly _host: TextMateModelTokenizerHost,
		private _languageId: string,
		private _encodedLanguageId: LanguageId,
		maxTokenizationLineLength: number,
	) {
		super(uri, lines, eol, versionId);
		this._maxTokenizationLineLength.set(maxTokenizationLineLength, undefined);
		this._resetTokenization();
	}

	public override dispose(): void {
		this._isDisposed = true;
		super.dispose();
	}

	public onLanguageId(languageId: string, encodedLanguageId: LanguageId): void {
		this._languageId = languageId;
		this._encodedLanguageId = encodedLanguageId;
		this._resetTokenization();
	}

	override onEvents(e: IModelChangedEvent): void {
		super.onEvents(e);

		this._tokenizerWithStateStore?.store.acceptChanges(e.changes);
		this._tokenizeDebouncer.schedule();
	}

	public acceptMaxTokenizationLineLength(maxTokenizationLineLength: number): void {
		this._maxTokenizationLineLength.set(maxTokenizationLineLength, undefined);
	}

	public retokenize(startLineNumber: number, endLineNumberExclusive: number) {
		if (this._tokenizerWithStateStore) {
			this._tokenizerWithStateStore.store.invalidateEndStateRange(new LineRange(startLineNumber, endLineNumberExclusive));
			this._tokenizeDebouncer.schedule();
		}
	}

	private async _resetTokenization() {
		this._tokenizerWithStateStore = null;

		const languageId = this._languageId;
		const encodedLanguageId = this._encodedLanguageId;

		const r = await this._host.getOrCreateGrammar(languageId, encodedLanguageId);

		if (this._isDisposed || languageId !== this._languageId || encodedLanguageId !== this._encodedLanguageId || !r) {
			return;
		}

		if (r.grammar) {
			const tokenizationSupport = new TokenizationSupportWithLineLimit(
				this._encodedLanguageId,
				new TextMateTokenizationSupport(r.grammar, r.initialState, false, undefined, () => false,
					(timeMs, lineLength, isRandomSample) => {
						this._host.reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, isRandomSample);
					},
					false
				),
				Disposable.None,
				this._maxTokenizationLineLength
			);
			this._tokenizerWithStateStore = new TokenizerWithStateStore(this._lines.length, tokenizationSupport);
		} else {
			this._tokenizerWithStateStore = null;
		}
		this._tokenize();
	}

	private async _tokenize(): Promise<void> {
		if (this._isDisposed || !this._tokenizerWithStateStore) {
			return;
		}

		if (!this._diffStateStacksRefEqFn) {
			const { diffStateStacksRefEq } = await importAMDNodeModule<typeof import('vscode-textmate')>('vscode-textmate', 'release/main.js');
			this._diffStateStacksRefEqFn = diffStateStacksRefEq;
		}

		const startTime = new Date().getTime();

		while (true) {
			let tokenizedLines = 0;
			const tokenBuilder = new ContiguousMultilineTokensBuilder();
			const stateDeltaBuilder = new StateDeltaBuilder();

			while (true) {
				const lineToTokenize = this._tokenizerWithStateStore.getFirstInvalidLine();
				if (lineToTokenize === null || tokenizedLines > 200) {
					break;
				}

				tokenizedLines++;

				const text = this._lines[lineToTokenize.lineNumber - 1];
				const r = this._tokenizerWithStateStore.tokenizationSupport.tokenizeEncoded(text, true, lineToTokenize.startState);
				if (this._tokenizerWithStateStore.store.setEndState(lineToTokenize.lineNumber, r.endState as StateStack)) {
					const delta = this._diffStateStacksRefEqFn(lineToTokenize.startState, r.endState as StateStack);
					stateDeltaBuilder.setState(lineToTokenize.lineNumber, delta);
				} else {
					stateDeltaBuilder.setState(lineToTokenize.lineNumber, null);
				}

				LineTokens.convertToEndOffset(r.tokens, text.length);
				tokenBuilder.add(lineToTokenize.lineNumber, r.tokens);

				const deltaMs = new Date().getTime() - startTime;
				if (deltaMs > 20) {
					// yield to check for changes
					break;
				}
			}

			if (tokenizedLines === 0) {
				break;
			}

			const stateDeltas = stateDeltaBuilder.getStateDeltas();
			this._host.setTokensAndStates(
				this._versionId,
				tokenBuilder.serialize(),
				stateDeltas
			);

			const deltaMs = new Date().getTime() - startTime;
			if (deltaMs > 20) {
				// yield to check for changes
				setTimeout0(() => this._tokenize());
				return;
			}
		}
	}
}

class StateDeltaBuilder {
	private _lastStartLineNumber: number = -1;
	private _stateDeltas: StateDeltas[] = [];

	public setState(lineNumber: number, stackDiff: StackDiff | null): void {
		if (lineNumber === this._lastStartLineNumber + 1) {
			this._stateDeltas[this._stateDeltas.length - 1].stateDeltas.push(stackDiff);
		} else {
			this._stateDeltas.push({ startLineNumber: lineNumber, stateDeltas: [stackDiff] });
		}
		this._lastStartLineNumber = lineNumber;
	}

	public getStateDeltas(): StateDeltas[] {
		return this._stateDeltas;
	}
}
