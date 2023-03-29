/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { IModelChangedEvent, MirrorTextModel } from 'vs/editor/common/model/mirrorTextModel';
import { TokenizationStateStore } from 'vs/editor/common/model/textModelTokens';
import { diffStateStacksRefEq, StateStack, StackDiff } from 'vscode-textmate';
import { ContiguousMultilineTokensBuilder } from 'vs/editor/common/tokens/contiguousMultilineTokensBuilder';
import { countEOL } from 'vs/editor/common/core/eolCounter';
import { LineTokens } from 'vs/editor/common/tokens/lineTokens';
import { TextMateTokenizationSupport } from 'vs/workbench/services/textMate/browser/tokenizationSupport/textMateTokenizationSupport';
import { StateDeltas } from 'vs/workbench/services/textMate/browser/workerHost/textMateWorkerHost';
import { RunOnceScheduler } from 'vs/base/common/async';
import { TextMateTokenizationWorker } from './textMate.worker';
import { observableValue } from 'vs/base/common/observable';
import { TokenizationSupportWithLineLimit } from 'vs/workbench/services/textMate/browser/tokenizationSupport/tokenizationSupportWithLineLimit';

export class TextMateWorkerModel extends MirrorTextModel {
	private _tokenizationStateStore: TokenizationStateStore | null;
	private readonly _worker: TextMateTokenizationWorker;
	private _languageId: string;
	private _encodedLanguageId: LanguageId;
	private _isDisposed: boolean;
	private readonly _maxTokenizationLineLength = observableValue(
		'_maxTokenizationLineLength',
		-1
	);

	constructor(
		uri: URI,
		lines: string[],
		eol: string,
		versionId: number,
		worker: TextMateTokenizationWorker,
		languageId: string,
		encodedLanguageId: LanguageId,
		maxTokenizationLineLength: number,
	) {
		super(uri, lines, eol, versionId);
		this._tokenizationStateStore = null;
		this._worker = worker;
		this._languageId = languageId;
		this._encodedLanguageId = encodedLanguageId;
		this._isDisposed = false;
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
			// Changes are sorted in descending order
			for (let i = 0; i < e.changes.length; i++) {
				const change = e.changes[i];
				const [eolCount] = countEOL(change.text);
				this._tokenizationStateStore.applyEdits(change.range, eolCount);
			}
		}
		this.tokenizeDebouncer.schedule();
	}

	public acceptMaxTokenizationLineLength(
		maxTokenizationLineLength: number
	): void {
		this._maxTokenizationLineLength.set(maxTokenizationLineLength, undefined);
	}

	public retokenize(startLineNumber: number, endLineNumberExclusive: number) {
		if (this._tokenizationStateStore) {
			for (
				let lineNumber = startLineNumber;
				lineNumber < endLineNumberExclusive;
				lineNumber++
			) {
				this._tokenizationStateStore.markMustBeTokenized(lineNumber - 1);
			}
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
					new TextMateTokenizationSupport(r.grammar, r.initialState, false),
					this._maxTokenizationLineLength
				);
				this._tokenizationStateStore = new TokenizationStateStore(
					tokenizationSupport,
					tokenizationSupport.getInitialState()
				);
			} else {
				this._tokenizationStateStore = null;
			}
			this._tokenize();
		});
	}

	private _tokenize(): void {
		if (this._isDisposed || !this._tokenizationStateStore) {
			return;
		}

		const startTime = new Date().getTime();

		while (true) {
			const builder = new ContiguousMultilineTokensBuilder();
			const lineCount = this._lines.length;

			let tokenizedLines = 0;

			const stateDeltaBuilder = new StateDeltaBuilder();

			// Validate all states up to and including endLineIndex
			while (this._tokenizationStateStore.invalidLineStartIndex < lineCount) {
				const lineIndex = this._tokenizationStateStore.invalidLineStartIndex;

				tokenizedLines++;
				// TODO don't spam the renderer
				if (tokenizedLines > 200) {
					break;
				}

				const text = this._lines[lineIndex];

				const lineStartState = this._tokenizationStateStore.getBeginState(
					lineIndex
				) as StateStack;
				const tokenizeResult =
					this._tokenizationStateStore.tokenizationSupport.tokenizeEncoded(
						text,
						true,
						lineStartState
					);
				if (
					this._tokenizationStateStore.setEndState(
						lineCount,
						lineIndex,
						tokenizeResult.endState
					)
				) {
					const delta = diffStateStacksRefEq(
						lineStartState,
						tokenizeResult.endState as StateStack
					);
					stateDeltaBuilder.setState(lineIndex + 1, delta);
				} else {
					stateDeltaBuilder.setState(lineIndex + 1, null);
				}

				LineTokens.convertToEndOffset(tokenizeResult.tokens, text.length);
				builder.add(lineIndex + 1, tokenizeResult.tokens);

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
				builder.serialize(),
				stateDeltas
			);

			const deltaMs = new Date().getTime() - startTime;
			if (deltaMs > 20) {
				// yield to check for changes
				setTimeout(() => this._tokenize(), 3);
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
