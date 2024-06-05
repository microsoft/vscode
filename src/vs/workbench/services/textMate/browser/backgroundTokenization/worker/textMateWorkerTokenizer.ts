/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from 'vs/amdX';
import { RunOnceScheduler } from 'vs/base/common/async';
import { observableValue } from 'vs/base/common/observable';
import { setTimeout0 } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { IModelChangedEvent, MirrorTextModel } from 'vs/editor/common/model/mirrorTextModel';
import { TokenizerWithStateStore } from 'vs/editor/common/model/textModelTokens';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { TextMateTokenizationSupport } from 'vs/workbench/services/textMate/browser/tokenizationSupport/textMateTokenizationSupport';
import { TokenizationSupportWithLineLimit } from 'vs/workbench/services/textMate/browser/tokenizationSupport/tokenizationSupportWithLineLimit';
import type { StackDiff, StateStack, diffStateStacksRefEq } from 'vscode-textmate';
import { ICreateGrammarResult } from 'vs/workbench/services/textMate/common/TMGrammarFactory';
import { StateDeltas } from 'vs/workbench/services/textMate/browser/backgroundTokenization/worker/textMateTokenizationWorker.worker';
import { Disposable } from 'vs/base/common/lifecycle';

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
