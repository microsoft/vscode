/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { BracketInfo, BracketPairWithMinIndentationInfo } from 'vs/editor/common/model/bracketPairs/bracketPairs';
import { BackgroundTokenizationState, TextModel } from 'vs/editor/common/model/textModel';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { ResolvedLanguageConfiguration } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { AstNode, AstNodeKind } from './ast';
import { TextEditInfo } from './beforeEditPositionMapper';
import { LanguageAgnosticBracketTokens } from './brackets';
import { Length, lengthAdd, lengthGreaterThanEqual, lengthLessThanEqual, lengthOfString, lengthsToRange, lengthZero, positionToLength, toLength } from './length';
import { parseDocument } from './parser';
import { DenseKeyProvider } from './smallImmutableSet';
import { FastTokenizer, TextBufferTokenizer } from './tokenizer';

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

	public constructor(
		private readonly textModel: TextModel,
		private readonly getLanguageConfiguration: (languageId: string) => ResolvedLanguageConfiguration
	) {
		super();

		this._register(textModel.onBackgroundTokenizationStateChanged(() => {
			if (textModel.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
				const wasUndefined = this.initialAstWithoutTokens === undefined;
				// Clear the initial tree as we can use the tree with token information now.
				this.initialAstWithoutTokens = undefined;
				if (!wasUndefined) {
					this.didChangeEmitter.fire();
				}
			}
		}));

		this._register(textModel.onDidChangeTokens(({ ranges }) => {
			const edits = ranges.map(r =>
				new TextEditInfo(
					toLength(r.fromLineNumber - 1, 0),
					toLength(r.toLineNumber, 0),
					toLength(r.toLineNumber - r.fromLineNumber + 1, 0)
				)
			);
			this.astWithTokens = this.parseDocumentFromTextBuffer(edits, this.astWithTokens, false);
			if (!this.initialAstWithoutTokens) {
				this.didChangeEmitter.fire();
			}
		}));

		if (textModel.backgroundTokenizationState === BackgroundTokenizationState.Uninitialized) {
			// There are no token information yet
			const brackets = this.brackets.getSingleLanguageBracketTokens(this.textModel.getLanguageId());
			const tokenizer = new FastTokenizer(this.textModel.getValue(), brackets);
			this.initialAstWithoutTokens = parseDocument(tokenizer, [], undefined, true);
			this.astWithTokens = this.initialAstWithoutTokens;
		} else if (textModel.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
			// Skip the initial ast, as there is no flickering.
			// Directly create the tree with token information.
			this.initialAstWithoutTokens = undefined;
			this.astWithTokens = this.parseDocumentFromTextBuffer([], undefined, false);
		} else if (textModel.backgroundTokenizationState === BackgroundTokenizationState.InProgress) {
			this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer([], undefined, true);
			this.astWithTokens = this.initialAstWithoutTokens;
		}
	}

	public handleContentChanged(change: IModelContentChangedEvent) {
		const edits = change.changes.map(c => {
			const range = Range.lift(c.range);
			return new TextEditInfo(
				positionToLength(range.getStartPosition()),
				positionToLength(range.getEndPosition()),
				lengthOfString(c.text)
			);
		}).reverse();

		this.astWithTokens = this.parseDocumentFromTextBuffer(edits, this.astWithTokens, false);
		if (this.initialAstWithoutTokens) {
			this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer(edits, this.initialAstWithoutTokens, false);
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

	public getBracketsInRange(range: Range): BracketInfo[] {
		const startOffset = toLength(range.startLineNumber - 1, range.startColumn - 1);
		const endOffset = toLength(range.endLineNumber - 1, range.endColumn - 1);
		const result = new Array<BracketInfo>();
		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		collectBrackets(node, lengthZero, node.length, startOffset, endOffset, result);
		return result;
	}

	public getBracketPairsInRange(range: Range, includeMinIndentation: boolean): BracketPairWithMinIndentationInfo[] {
		const result = new Array<BracketPairWithMinIndentationInfo>();

		const startLength = positionToLength(range.getStartPosition());
		const endLength = positionToLength(range.getEndPosition());

		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		const context = new CollectBracketPairsContext(result, includeMinIndentation, this.textModel);
		collectBracketPairs(node, lengthZero, node.length, startLength, endLength, context);

		return result;
	}
}

function collectBrackets(node: AstNode, nodeOffsetStart: Length, nodeOffsetEnd: Length, startOffset: Length, endOffset: Length, result: BracketInfo[], level: number = 0): void {
	if (node.kind === AstNodeKind.Bracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		result.push(new BracketInfo(range, level - 1, false));
	} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		result.push(new BracketInfo(range, level - 1, true));
	} else if (node.kind === AstNodeKind.List) {
		for (const child of node.children) {
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
				collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, result, level);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
	} else if (node.kind === AstNodeKind.Pair) {
		// Don't use node.children here to improve performance
		level++;

		{
			const child = node.openingBracket;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
				collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, result, level);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}

		if (node.child) {
			const child = node.child;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
				collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, result, level);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
		if (node.closingBracket) {
			const child = node.closingBracket;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (lengthLessThanEqual(nodeOffsetStart, endOffset) && lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
				collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, result, level);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
	}
}

class CollectBracketPairsContext {
	constructor(
		public readonly result: BracketPairWithMinIndentationInfo[],
		public readonly includeMinIndentation: boolean,
		public readonly textModel: ITextModel,
	) {
	}
}

function collectBracketPairs(node: AstNode, nodeOffset: Length, nodeOffsetEnd: Length, startOffset: Length, endOffset: Length, context: CollectBracketPairsContext, level: number = 0) {
	if (node.kind === AstNodeKind.Pair) {
		const openingBracketEnd = lengthAdd(nodeOffset, node.openingBracket.length);
		let minIndentation = -1;
		if (context.includeMinIndentation) {
			minIndentation = node.computeMinIndentation(nodeOffset, context.textModel);
		}

		context.result.push(new BracketPairWithMinIndentationInfo(
			lengthsToRange(nodeOffset, nodeOffsetEnd),
			lengthsToRange(nodeOffset, openingBracketEnd),
			node.closingBracket
				? lengthsToRange(lengthAdd(openingBracketEnd, node.child?.length || lengthZero), nodeOffsetEnd)
				: undefined,
			level,
			minIndentation
		));
		level++;
	}

	let curOffset = nodeOffset;
	for (const child of node.children) {
		const childOffset = curOffset;
		curOffset = lengthAdd(curOffset, child.length);

		if (lengthLessThanEqual(childOffset, endOffset) && lengthLessThanEqual(startOffset, curOffset)) {
			collectBracketPairs(child, childOffset, curOffset, startOffset, endOffset, context, level);
		}
	}
}

