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
import { StateDeltas } from 'vs/workbench/services/textMate/browser/workerHost/textMateWorkerHost';
import type { StackDiff, StateStack, diffStateStacksRefEq } from 'vscode-textmate';
import { TextMateTokenizationWorker } from './textMate.worker';

export class TextMateWorkerModel extends MirrorTextModel {
	private _tokenizationStateStore: TokenizerWithStateStore<StateStack> | null = null;
	private _isDisposed: boolean = false;
	private readonly _maxTokenizationLineLength = observableValue(
		'_maxTokenizationLineLength',
		-1
	);
	private _diffStateStacksRefEqFn?: typeof diffStateStacksRefEq;

	constructor(
		uri: URI,
		lines: string[],
		eol: string,
		versionId: number,
		private readonly _worker: TextMateTokenizationWorker,
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

	private readonly tokenizeDebouncer = new RunOnceScheduler(
		() => this._tokenize(),
		10
	);

	override onEvents(e: IModelChangedEvent): void {
		super.onEvents(e);

		if (this._tokenizationStateStore) {
			this._tokenizationStateStore.store.acceptChanges(e.changes);
		}
		this.tokenizeDebouncer.schedule();
	}

	public acceptMaxTokenizationLineLength(maxTokenizationLineLength: number): void {
		this._maxTokenizationLineLength.set(maxTokenizationLineLength, undefined);
	}

	public retokenize(startLineNumber: number, endLineNumberExclusive: number) {
		if (this._tokenizationStateStore) {
			this._tokenizationStateStore.store.invalidateEndStateRange(new LineRange(startLineNumber, endLineNumberExclusive));
			this.tokenizeDebouncer.schedule();
		}
	}

	private _resetTokenization(): void {
		this._tokenizationStateStore = null;

		const languageId = this._languageId;
		const encodedLanguageId = this._encodedLanguageId;
		this._worker.getOrCreateGrammar(languageId, encodedLanguageId).then((r) => {
			if (
				this._isDisposed ||
				languageId !== this._languageId ||
				encodedLanguageId !== this._encodedLanguageId ||
				!r
			) {
				return;
			}

			if (r.grammar) {
				const tokenizationSupport = new TokenizationSupportWithLineLimit(
					this._encodedLanguageId,
					new TextMateTokenizationSupport(r.grammar, r.initialState, false, undefined, () => false,
						(timeMs, lineLength, isRandomSample) => {
							this._worker.reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, isRandomSample);
						},
						false
					),
					this._maxTokenizationLineLength
				);
				this._tokenizationStateStore = new TokenizerWithStateStore(this._lines.length, tokenizationSupport);
			} else {
				this._tokenizationStateStore = null;
			}
			this._tokenize();
		});
	}

	private async _tokenize(): Promise<void> {
		if (this._isDisposed || !this._tokenizationStateStore) {
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
				const lineNumberToTokenize = this._tokenizationStateStore.store.getFirstInvalidEndStateLineNumber();
				if (lineNumberToTokenize === null || tokenizedLines > 200) {
					break;
				}

				tokenizedLines++;

				const text = this._lines[lineNumberToTokenize - 1];
				const lineStartState = this._tokenizationStateStore.getStartState(lineNumberToTokenize)!;
				const r = this._tokenizationStateStore.tokenizationSupport.tokenizeEncoded(text, true, lineStartState);
				if (this._tokenizationStateStore.store.setEndState(lineNumberToTokenize, r.endState as StateStack)) {
					const delta = this._diffStateStacksRefEqFn(lineStartState, r.endState as StateStack);
					stateDeltaBuilder.setState(lineNumberToTokenize, delta);
				} else {
					stateDeltaBuilder.setState(lineNumberToTokenize, null);
				}

				LineTokens.convertToEndOffset(r.tokens, text.length);
				tokenBuilder.add(lineNumberToTokenize, r.tokens);

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
			this._worker.setTokensAndStates(
				this._uri,
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
