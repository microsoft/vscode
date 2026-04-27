/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { BracketInfo, BracketPairWithMinIndentationInfo, IFoundBracket } from 'vs/editor/common/textModelBracketPairs';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IModelContentChangedEvent, IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { ResolvedLanguageConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { AstNode, AstNodeKind } from './ast';
import { TextEditInfo } from './beforeEditPositionMapper';
import { LanguageAgnosticBracketTokens } from './brackets';
import { Length, lengthAdd, lengthGreaterThanEqual, lengthLessThan, lengthLessThanEqual, lengthsToRange, lengthZero, positionToLength, toLength } from './length';
import { parseDocument } from './parser';
import { DenseKeyProvider } from './smallImmutableSet';
import { FastTokenizer, TextBufferTokenizer } from './tokenizer';
import { BackgroundTokenizationState } from 'vs/editor/common/tokenizationTextModelPart';
import { Position } from 'vs/editor/common/core/position';
import { CallbackIterable } from 'vs/base/common/arrays';
import { combineTextEditInfos } from 'vs/editor/common/model/bracketPairsTextModelPart/bracketPairsTree/combineTextEditInfos';
import { ClosingBracketKind, OpeningBracketKind } from 'vs/editor/common/languages/supports/languageBracketsConfiguration';

export class BracketPairsTree extends Disposable {
	private readonly didChangeEmitter = new Emitter<void>();

	/*
		There are two trees:
		* The initial tree that has no token information and is used for performant initial bracket colorization.
		* The tree that used token information to detect bracket pairs.

		To prevent flickering, we only switch from the initial tree to tree with token information
		when tokenization completes.
		Since the text can be edited while background tokenization is in progress, we need to update both trees.
	*/
	private initialAstWithoutTokens: AstNode | undefined;
	private astWithTokens: AstNode | undefined;

	private readonly denseKeyProvider = new DenseKeyProvider<string>();
	private readonly brackets = new LanguageAgnosticBracketTokens(this.denseKeyProvider, this.getLanguageConfiguration);

	public didLanguageChange(languageId: string): boolean {
		return this.brackets.didLanguageChange(languageId);
	}

	public readonly onDidChange = this.didChangeEmitter.event;
	private queuedTextEditsForInitialAstWithoutTokens: TextEditInfo[] = [];
	private queuedTextEdits: TextEditInfo[] = [];

	public constructor(
		private readonly textModel: TextModel,
		private readonly getLanguageConfiguration: (languageId: string) => ResolvedLanguageConfiguration
	) {
		super();

		if (!textModel.tokenization.hasTokens) {
			const brackets = this.brackets.getSingleLanguageBracketTokens(this.textModel.getLanguageId());
			const tokenizer = new FastTokenizer(this.textModel.getValue(), brackets);
			this.initialAstWithoutTokens = parseDocument(tokenizer, [], undefined, true);
			this.astWithTokens = this.initialAstWithoutTokens;
		} else if (textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
			// Skip the initial ast, as there is no flickering.
			// Directly create the tree with token information.
			this.initialAstWithoutTokens = undefined;
			this.astWithTokens = this.parseDocumentFromTextBuffer([], undefined, false);
		} else {
			// We missed some token changes already, so we cannot use the fast tokenizer + delta increments
			this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer([], undefined, true);
			this.astWithTokens = this.initialAstWithoutTokens;
		}
	}

	//#region TextModel events

	public handleDidChangeBackgroundTokenizationState(): void {
		if (this.textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
			const wasUndefined = this.initialAstWithoutTokens === undefined;
			// Clear the initial tree as we can use the tree with token information now.
			this.initialAstWithoutTokens = undefined;
			if (!wasUndefined) {
				this.didChangeEmitter.fire();
			}
		}
	}

	public handleDidChangeTokens({ ranges }: IModelTokensChangedEvent): void {
		const edits = ranges.map(r =>
			new TextEditInfo(
				toLength(r.fromLineNumber - 1, 0),
				toLength(r.toLineNumber, 0),
				toLength(r.toLineNumber - r.fromLineNumber + 1, 0)
			)
		);

		this.handleEdits(edits, true);

		if (!this.initialAstWithoutTokens) {
			this.didChangeEmitter.fire();
		}
	}

	public handleContentChanged(change: IModelContentChangedEvent) {
		const edits = TextEditInfo.fromModelContentChanges(change.changes);
		this.handleEdits(edits, false);
	}

	private handleEdits(edits: TextEditInfo[], tokenChange: boolean): void {
		// Lazily queue the edits and only apply them when the tree is accessed.
		const result = combineTextEditInfos(this.queuedTextEdits, edits);

		this.queuedTextEdits = result;
		if (this.initialAstWithoutTokens && !tokenChange) {
			this.queuedTextEditsForInitialAstWithoutTokens = combineTextEditInfos(this.queuedTextEditsForInitialAstWithoutTokens, edits);
		}
	}

	//#endregion

	private flushQueue() {
		if (this.queuedTextEdits.length > 0) {
			this.astWithTokens = this.parseDocumentFromTextBuffer(this.queuedTextEdits, this.astWithTokens, false);
			this.queuedTextEdits = [];
		}
		if (this.queuedTextEditsForInitialAstWithoutTokens.length > 0) {
			if (this.initialAstWithoutTokens) {
				this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer(this.queuedTextEditsForInitialAstWithoutTokens, this.initialAstWithoutTokens, false);
			}
			this.queuedTextEditsForInitialAstWithoutTokens = [];
		}
	}

	/**
	 * @pure (only if isPure = true)
	*/
	private parseDocumentFromTextBuffer(edits: TextEditInfo[], previousAst: AstNode | undefined, immutable: boolean): AstNode {
		// Is much faster if `isPure = false`.
		const isPure = false;
		const previousAstClone = isPure ? previousAst?.deepClone() : previousAst;
		const tokenizer = new TextBufferTokenizer(this.textModel, this.brackets);
		const result = parseDocument(tokenizer, edits, previousAstClone, immutable);
		return result;
	}

	public getBracketsInRange(range: Range, onlyColorizedBrackets: boolean): CallbackIterable<BracketInfo> {
		this.flushQueue();

		const startOffset = toLength(range.startLineNumber - 1, range.startColumn - 1);
		const endOffset = toLength(range.endLineNumber - 1, range.endColumn - 1);
		return new CallbackIterable(cb => {
			const node = this.initialAstWithoutTokens || this.astWithTokens!;
			collectBrackets(node, lengthZero, node.length, startOffset, endOffset, cb, 0, 0, new Map(), onlyColorizedBrackets);
		});
	}

	public getBracketPairsInRange(range: Range, includeMinIndentation: boolean): CallbackIterable<BracketPairWithMinIndentationInfo> {
		this.flushQueue();

		const startLength = positionToLength(range.getStartPosition());
		const endLength = positionToLength(range.getEndPosition());

		return new CallbackIterable(cb => {
			const node = this.initialAstWithoutTokens || this.astWithTokens!;
			const context = new CollectBracketPairsContext(cb, includeMinIndentation, this.textModel);
			collectBracketPairs(node, lengthZero, node.length, startLength, endLength, context, 0, new Map());
		});
	}

	public getFirstBracketAfter(position: Position): IFoundBracket | null {
		this.flushQueue();

		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		return getFirstBracketAfter(node, lengthZero, node.length, positionToLength(position));
	}

	public getFirstBracketBefore(position: Position): IFoundBracket | null {
		this.flushQueue();

		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		return getFirstBracketBefore(node, lengthZero, node.length, positionToLength(position));
	}
}

function getFirstBracketBefore(node: AstNode, nodeOffsetStart: Length, nodeOffsetEnd: Length, position: Length): IFoundBracket | null {
	if (node.kind === AstNodeKind.List || node.kind === AstNodeKind.Pair) {
		const lengths: { nodeOffsetStart: Length; nodeOffsetEnd: Length }[] = [];
		for (const child of node.children) {…}
		for (let i = lengths.length - 1; i >= 0; i--) {…}
	} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {…} else if (node.kind === AstNodeKind.Bracket) {…}
	return null;
}

function getFirstBracketAfter(node: AstNode, nodeOffsetStart: Length, nodeOffsetEnd: Length, position: Length): IFoundBracket | null {
	if (node.kind === AstNodeKind.List || node.kind === AstNodeKind.Pair) {…} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {…} else if (node.kind === AstNodeKind.Bracket) {…}
}

class CollectBracketPairsContext {
	constructor(
		public readonly push: (item: BracketPairWithMinIndentationInfo) => boolean,
		public readonly includeMinIndentation: boolean,
		public readonly textModel: ITextModel,
	) {
	}
}

