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
import { Length, lengthAdd, lengthGreaterThanEqual, lengthLessThan, lengthLessThanEqual, lengthOfString, lengthsToRange, lengthZero, positionToLength, toLength } from './length';
import { parseDocument } from './parser';
import { DenseKeyProvider } from './smallImmutableSet';
import { FastTokenizer, TextBufferTokenizer } from './tokenizer';
import { BackgroundTokenizationState } from 'vs/editor/common/tokenizationTextModelPart';
import { Position } from 'vs/editor/common/core/position';

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

		if (textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Uninitialized) {
			// There are no token information yet
			const brackets = this.brackets.getSingleLanguageBracketTokens(this.textModel.getLanguageId());
			const tokenizer = new FastTokenizer(this.textModel.getValue(), brackets);
			this.initialAstWithoutTokens = parseDocument(tokenizer, [], undefined, true);
			this.astWithTokens = this.initialAstWithoutTokens;
		} else if (textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.Completed) {
			// Skip the initial ast, as there is no flickering.
			// Directly create the tree with token information.
			this.initialAstWithoutTokens = undefined;
			this.astWithTokens = this.parseDocumentFromTextBuffer([], undefined, false);
		} else if (textModel.tokenization.backgroundTokenizationState === BackgroundTokenizationState.InProgress) {
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
		this.astWithTokens = this.parseDocumentFromTextBuffer(edits, this.astWithTokens, false);
		if (!this.initialAstWithoutTokens) {
			this.didChangeEmitter.fire();
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

	//#endregion

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
		collectBrackets(node, lengthZero, node.length, startOffset, endOffset, result, 0, new Map());
		return result;
	}

	public getBracketPairsInRange(range: Range, includeMinIndentation: boolean): BracketPairWithMinIndentationInfo[] {
		const result = new Array<BracketPairWithMinIndentationInfo>();

		const startLength = positionToLength(range.getStartPosition());
		const endLength = positionToLength(range.getEndPosition());

		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		const context = new CollectBracketPairsContext(result, includeMinIndentation, this.textModel);
		collectBracketPairs(node, lengthZero, node.length, startLength, endLength, context, 0, new Map());

		return result;
	}

	public getFirstBracketAfter(position: Position): IFoundBracket | null {
		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		return getFirstBracketAfter(node, lengthZero, node.length, positionToLength(position));
	}

	public getFirstBracketBefore(position: Position): IFoundBracket | null {
		const node = this.initialAstWithoutTokens || this.astWithTokens!;
		return getFirstBracketBefore(node, lengthZero, node.length, positionToLength(position));
	}
}

function getFirstBracketBefore(node: AstNode, nodeOffsetStart: Length, nodeOffsetEnd: Length, position: Length): IFoundBracket | null {
	if (node.kind === AstNodeKind.List || node.kind === AstNodeKind.Pair) {
		const lengths: { nodeOffsetStart: Length; nodeOffsetEnd: Length }[] = [];
		for (const child of node.children) {
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			lengths.push({ nodeOffsetStart, nodeOffsetEnd });
			nodeOffsetStart = nodeOffsetEnd;
		}
		for (let i = lengths.length - 1; i >= 0; i--) {
			const { nodeOffsetStart, nodeOffsetEnd } = lengths[i];
			if (lengthLessThan(nodeOffsetStart, position)) {
				const result = getFirstBracketBefore(node.children[i], nodeOffsetStart, nodeOffsetEnd, position);
				if (result) {
					return result;
				}
			}
		}
		return null;
	} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
		return null;
	} else if (node.kind === AstNodeKind.Bracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		return {
			bracketInfo: node.bracketInfo,
			range
		};
	}
	return null;
}

function getFirstBracketAfter(node: AstNode, nodeOffsetStart: Length, nodeOffsetEnd: Length, position: Length): IFoundBracket | null {
	if (node.kind === AstNodeKind.List || node.kind === AstNodeKind.Pair) {
		for (const child of node.children) {
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (lengthLessThan(position, nodeOffsetEnd)) {
				const result = getFirstBracketAfter(child, nodeOffsetStart, nodeOffsetEnd, position);
				if (result) {
					return result;
				}
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
		return null;
	} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
		return null;
	} else if (node.kind === AstNodeKind.Bracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		return {
			bracketInfo: node.bracketInfo,
			range
		};
	}
	return null;
}

function collectBrackets(
	node: AstNode,
	nodeOffsetStart: Length,
	nodeOffsetEnd: Length,
	startOffset: Length,
	endOffset: Length,
	result: BracketInfo[],
	level: number,
	levelPerBracketType: Map<string, number>
): void {
	if (node.kind === AstNodeKind.List) {
		for (const child of node.children) {
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (
				lengthLessThanEqual(nodeOffsetStart, endOffset) &&
				lengthGreaterThanEqual(nodeOffsetEnd, startOffset)
			) {
				collectBrackets(
					child,
					nodeOffsetStart,
					nodeOffsetEnd,
					startOffset,
					endOffset,
					result,
					level,
					levelPerBracketType
				);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
	} else if (node.kind === AstNodeKind.Pair) {
		let levelPerBracket = 0;
		if (levelPerBracketType) {
			let existing = levelPerBracketType.get(node.openingBracket.text);
			if (existing === undefined) {
				existing = 0;
			}
			levelPerBracket = existing;
			existing++;
			levelPerBracketType.set(node.openingBracket.text, existing);
		}

		// Don't use node.children here to improve performance
		{
			const child = node.openingBracket;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (
				lengthLessThanEqual(nodeOffsetStart, endOffset) &&
				lengthGreaterThanEqual(nodeOffsetEnd, startOffset)
			) {
				const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
				result.push(
					new BracketInfo(range, level, levelPerBracket, !node.closingBracket)
				);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}

		if (node.child) {
			const child = node.child;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (
				lengthLessThanEqual(nodeOffsetStart, endOffset) &&
				lengthGreaterThanEqual(nodeOffsetEnd, startOffset)
			) {
				collectBrackets(
					child,
					nodeOffsetStart,
					nodeOffsetEnd,
					startOffset,
					endOffset,
					result,
					level + 1,
					levelPerBracketType
				);
			}
			nodeOffsetStart = nodeOffsetEnd;
		}
		if (node.closingBracket) {
			const child = node.closingBracket;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (
				lengthLessThanEqual(nodeOffsetStart, endOffset) &&
				lengthGreaterThanEqual(nodeOffsetEnd, startOffset)
			) {
				const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
				result.push(new BracketInfo(range, level, levelPerBracket, false));
			}
			nodeOffsetStart = nodeOffsetEnd;
		}

		levelPerBracketType?.set(node.openingBracket.text, levelPerBracket);
	} else if (node.kind === AstNodeKind.UnexpectedClosingBracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		result.push(new BracketInfo(range, level - 1, 0, true));
	} else if (node.kind === AstNodeKind.Bracket) {
		const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
		result.push(new BracketInfo(range, level - 1, 0, false));
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

function collectBracketPairs(
	node: AstNode,
	nodeOffsetStart: Length,
	nodeOffsetEnd: Length,
	startOffset: Length,
	endOffset: Length,
	context: CollectBracketPairsContext,
	level: number,
	levelPerBracketType: Map<string, number>
) {
	if (node.kind === AstNodeKind.Pair) {
		let levelPerBracket = 0;
		if (levelPerBracketType) {
			let existing = levelPerBracketType.get(node.openingBracket.text);
			if (existing === undefined) {
				existing = 0;
			}
			levelPerBracket = existing;
			existing++;
			levelPerBracketType.set(node.openingBracket.text, existing);
		}

		const openingBracketEnd = lengthAdd(nodeOffsetStart, node.openingBracket.length);
		let minIndentation = -1;
		if (context.includeMinIndentation) {
			minIndentation = node.computeMinIndentation(
				nodeOffsetStart,
				context.textModel
			);
		}

		context.result.push(
			new BracketPairWithMinIndentationInfo(
				lengthsToRange(nodeOffsetStart, nodeOffsetEnd),
				lengthsToRange(nodeOffsetStart, openingBracketEnd),
				node.closingBracket
					? lengthsToRange(
						lengthAdd(openingBracketEnd, node.child?.length || lengthZero),
						nodeOffsetEnd
					)
					: undefined,
				level,
				levelPerBracket,
				node,
				minIndentation
			)
		);

		nodeOffsetStart = openingBracketEnd;
		if (node.child) {
			const child = node.child;
			nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
			if (
				lengthLessThanEqual(nodeOffsetStart, endOffset) &&
				lengthGreaterThanEqual(nodeOffsetEnd, startOffset)
			) {
				collectBracketPairs(
					child,
					nodeOffsetStart,
					nodeOffsetEnd,
					startOffset,
					endOffset,
					context,
					level + 1,
					levelPerBracketType
				);
			}
		}

		levelPerBracketType?.set(node.openingBracket.text, levelPerBracket);
	} else {
		let curOffset = nodeOffsetStart;
		for (const child of node.children) {
			const childOffset = curOffset;
			curOffset = lengthAdd(curOffset, child.length);

			if (
				lengthLessThanEqual(childOffset, endOffset) &&
				lengthLessThanEqual(startOffset, curOffset)
			) {
				collectBracketPairs(
					child,
					childOffset,
					curOffset,
					startOffset,
					endOffset,
					context,
					level,
					levelPerBracketType
				);
			}
		}
	}
}

