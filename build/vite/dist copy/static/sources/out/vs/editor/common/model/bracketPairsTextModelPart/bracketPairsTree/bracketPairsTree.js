/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { BracketInfo, BracketPairWithMinIndentationInfo } from '../../../textModelBracketPairs.js';
import { TextEditInfo } from './beforeEditPositionMapper.js';
import { LanguageAgnosticBracketTokens } from './brackets.js';
import { lengthAdd, lengthGreaterThanEqual, lengthLessThan, lengthLessThanEqual, lengthsToRange, lengthZero, positionToLength, toLength } from './length.js';
import { parseDocument } from './parser.js';
import { DenseKeyProvider } from './smallImmutableSet.js';
import { FastTokenizer, TextBufferTokenizer } from './tokenizer.js';
import { CallbackIterable } from '../../../../../base/common/arrays.js';
import { combineTextEditInfos } from './combineTextEditInfos.js';
export class BracketPairsTree extends Disposable {
    didLanguageChange(languageId) {
        return this.brackets.didLanguageChange(languageId);
    }
    constructor(textModel, getLanguageConfiguration) {
        super();
        this.textModel = textModel;
        this.getLanguageConfiguration = getLanguageConfiguration;
        this.didChangeEmitter = this._register(new Emitter());
        this.denseKeyProvider = new DenseKeyProvider();
        this.brackets = new LanguageAgnosticBracketTokens(this.denseKeyProvider, this.getLanguageConfiguration);
        this.onDidChange = this.didChangeEmitter.event;
        this.queuedTextEditsForInitialAstWithoutTokens = [];
        this.queuedTextEdits = [];
        if (!textModel.tokenization.hasTokens) {
            const brackets = this.brackets.getSingleLanguageBracketTokens(this.textModel.getLanguageId());
            const tokenizer = new FastTokenizer(this.textModel.getValue(), brackets);
            this.initialAstWithoutTokens = parseDocument(tokenizer, [], undefined, true);
            this.astWithTokens = this.initialAstWithoutTokens;
        }
        else if (textModel.tokenization.backgroundTokenizationState === 2 /* BackgroundTokenizationState.Completed */) {
            // Skip the initial ast, as there is no flickering.
            // Directly create the tree with token information.
            this.initialAstWithoutTokens = undefined;
            this.astWithTokens = this.parseDocumentFromTextBuffer([], undefined, false);
        }
        else {
            // We missed some token changes already, so we cannot use the fast tokenizer + delta increments
            this.initialAstWithoutTokens = this.parseDocumentFromTextBuffer([], undefined, true);
            this.astWithTokens = this.initialAstWithoutTokens;
        }
    }
    //#region TextModel events
    handleDidChangeBackgroundTokenizationState() {
        if (this.textModel.tokenization.backgroundTokenizationState === 2 /* BackgroundTokenizationState.Completed */) {
            const wasUndefined = this.initialAstWithoutTokens === undefined;
            // Clear the initial tree as we can use the tree with token information now.
            this.initialAstWithoutTokens = undefined;
            if (!wasUndefined) {
                this.didChangeEmitter.fire();
            }
        }
    }
    handleDidChangeTokens({ ranges }) {
        const edits = ranges.map(r => new TextEditInfo(toLength(r.fromLineNumber - 1, 0), toLength(r.toLineNumber, 0), toLength(r.toLineNumber - r.fromLineNumber + 1, 0)));
        this.handleEdits(edits, true);
        if (!this.initialAstWithoutTokens) {
            this.didChangeEmitter.fire();
        }
    }
    handleContentChanged(change) {
        const edits = TextEditInfo.fromModelContentChanges(change.changes);
        this.handleEdits(edits, false);
    }
    handleEdits(edits, tokenChange) {
        // Lazily queue the edits and only apply them when the tree is accessed.
        const result = combineTextEditInfos(this.queuedTextEdits, edits);
        this.queuedTextEdits = result;
        if (this.initialAstWithoutTokens && !tokenChange) {
            this.queuedTextEditsForInitialAstWithoutTokens = combineTextEditInfos(this.queuedTextEditsForInitialAstWithoutTokens, edits);
        }
    }
    //#endregion
    flushQueue() {
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
    parseDocumentFromTextBuffer(edits, previousAst, immutable) {
        // Is much faster if `isPure = false`.
        const isPure = false;
        const previousAstClone = isPure ? previousAst?.deepClone() : previousAst;
        const tokenizer = new TextBufferTokenizer(this.textModel, this.brackets);
        const result = parseDocument(tokenizer, edits, previousAstClone, immutable);
        return result;
    }
    getBracketsInRange(range, onlyColorizedBrackets) {
        this.flushQueue();
        const startOffset = toLength(range.startLineNumber - 1, range.startColumn - 1);
        const endOffset = toLength(range.endLineNumber - 1, range.endColumn - 1);
        return new CallbackIterable(cb => {
            const node = this.initialAstWithoutTokens || this.astWithTokens;
            collectBrackets(node, lengthZero, node.length, startOffset, endOffset, cb, 0, 0, new Map(), onlyColorizedBrackets);
        });
    }
    getBracketPairsInRange(range, includeMinIndentation) {
        this.flushQueue();
        const startLength = positionToLength(range.getStartPosition());
        const endLength = positionToLength(range.getEndPosition());
        return new CallbackIterable(cb => {
            const node = this.initialAstWithoutTokens || this.astWithTokens;
            const context = new CollectBracketPairsContext(cb, includeMinIndentation, this.textModel);
            collectBracketPairs(node, lengthZero, node.length, startLength, endLength, context, 0, new Map());
        });
    }
    getFirstBracketAfter(position) {
        this.flushQueue();
        const node = this.initialAstWithoutTokens || this.astWithTokens;
        return getFirstBracketAfter(node, lengthZero, node.length, positionToLength(position));
    }
    getFirstBracketBefore(position) {
        this.flushQueue();
        const node = this.initialAstWithoutTokens || this.astWithTokens;
        return getFirstBracketBefore(node, lengthZero, node.length, positionToLength(position));
    }
}
function getFirstBracketBefore(node, nodeOffsetStart, nodeOffsetEnd, position) {
    if (node.kind === 4 /* AstNodeKind.List */ || node.kind === 2 /* AstNodeKind.Pair */) {
        const lengths = [];
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
    }
    else if (node.kind === 3 /* AstNodeKind.UnexpectedClosingBracket */) {
        return null;
    }
    else if (node.kind === 1 /* AstNodeKind.Bracket */) {
        const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
        return {
            bracketInfo: node.bracketInfo,
            range
        };
    }
    return null;
}
function getFirstBracketAfter(node, nodeOffsetStart, nodeOffsetEnd, position) {
    if (node.kind === 4 /* AstNodeKind.List */ || node.kind === 2 /* AstNodeKind.Pair */) {
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
    }
    else if (node.kind === 3 /* AstNodeKind.UnexpectedClosingBracket */) {
        return null;
    }
    else if (node.kind === 1 /* AstNodeKind.Bracket */) {
        const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
        return {
            bracketInfo: node.bracketInfo,
            range
        };
    }
    return null;
}
function collectBrackets(node, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, push, level, nestingLevelOfEqualBracketType, levelPerBracketType, onlyColorizedBrackets, parentPairIsIncomplete = false) {
    if (level > 200) {
        return true;
    }
    whileLoop: while (true) {
        switch (node.kind) {
            case 4 /* AstNodeKind.List */: {
                const childCount = node.childrenLength;
                for (let i = 0; i < childCount; i++) {
                    const child = node.getChild(i);
                    if (!child) {
                        continue;
                    }
                    nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
                    if (lengthLessThanEqual(nodeOffsetStart, endOffset) &&
                        lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
                        const childEndsAfterEnd = lengthGreaterThanEqual(nodeOffsetEnd, endOffset);
                        if (childEndsAfterEnd) {
                            // No child after this child in the requested window, don't recurse
                            node = child;
                            continue whileLoop;
                        }
                        const shouldContinue = collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, push, level, 0, levelPerBracketType, onlyColorizedBrackets);
                        if (!shouldContinue) {
                            return false;
                        }
                    }
                    nodeOffsetStart = nodeOffsetEnd;
                }
                return true;
            }
            case 2 /* AstNodeKind.Pair */: {
                const colorize = !onlyColorizedBrackets || !node.closingBracket || node.closingBracket.bracketInfo.closesColorized(node.openingBracket.bracketInfo);
                let levelPerBracket = 0;
                if (levelPerBracketType) {
                    let existing = levelPerBracketType.get(node.openingBracket.text);
                    if (existing === undefined) {
                        existing = 0;
                    }
                    levelPerBracket = existing;
                    if (colorize) {
                        existing++;
                        levelPerBracketType.set(node.openingBracket.text, existing);
                    }
                }
                const childCount = node.childrenLength;
                for (let i = 0; i < childCount; i++) {
                    const child = node.getChild(i);
                    if (!child) {
                        continue;
                    }
                    nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
                    if (lengthLessThanEqual(nodeOffsetStart, endOffset) &&
                        lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
                        const childEndsAfterEnd = lengthGreaterThanEqual(nodeOffsetEnd, endOffset);
                        if (childEndsAfterEnd && child.kind !== 1 /* AstNodeKind.Bracket */) {
                            // No child after this child in the requested window, don't recurse
                            // Don't do this for brackets because of unclosed/unopened brackets
                            node = child;
                            if (colorize) {
                                level++;
                                nestingLevelOfEqualBracketType = levelPerBracket + 1;
                            }
                            else {
                                nestingLevelOfEqualBracketType = levelPerBracket;
                            }
                            continue whileLoop;
                        }
                        if (colorize || child.kind !== 1 /* AstNodeKind.Bracket */ || !node.closingBracket) {
                            const shouldContinue = collectBrackets(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, push, colorize ? level + 1 : level, colorize ? levelPerBracket + 1 : levelPerBracket, levelPerBracketType, onlyColorizedBrackets, !node.closingBracket);
                            if (!shouldContinue) {
                                return false;
                            }
                        }
                    }
                    nodeOffsetStart = nodeOffsetEnd;
                }
                levelPerBracketType?.set(node.openingBracket.text, levelPerBracket);
                return true;
            }
            case 3 /* AstNodeKind.UnexpectedClosingBracket */: {
                const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
                return push(new BracketInfo(range, level - 1, 0, true));
            }
            case 1 /* AstNodeKind.Bracket */: {
                const range = lengthsToRange(nodeOffsetStart, nodeOffsetEnd);
                return push(new BracketInfo(range, level - 1, nestingLevelOfEqualBracketType - 1, parentPairIsIncomplete));
            }
            case 0 /* AstNodeKind.Text */:
                return true;
        }
    }
}
class CollectBracketPairsContext {
    constructor(push, includeMinIndentation, textModel) {
        this.push = push;
        this.includeMinIndentation = includeMinIndentation;
        this.textModel = textModel;
    }
}
function collectBracketPairs(node, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, context, level, levelPerBracketType) {
    if (level > 200) {
        return true;
    }
    let shouldContinue = true;
    if (node.kind === 2 /* AstNodeKind.Pair */) {
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
            minIndentation = node.computeMinIndentation(nodeOffsetStart, context.textModel);
        }
        shouldContinue = context.push(new BracketPairWithMinIndentationInfo(lengthsToRange(nodeOffsetStart, nodeOffsetEnd), lengthsToRange(nodeOffsetStart, openingBracketEnd), node.closingBracket
            ? lengthsToRange(lengthAdd(openingBracketEnd, node.child?.length || lengthZero), nodeOffsetEnd)
            : undefined, level, levelPerBracket, node, minIndentation));
        nodeOffsetStart = openingBracketEnd;
        if (shouldContinue && node.child) {
            const child = node.child;
            nodeOffsetEnd = lengthAdd(nodeOffsetStart, child.length);
            if (lengthLessThanEqual(nodeOffsetStart, endOffset) &&
                lengthGreaterThanEqual(nodeOffsetEnd, startOffset)) {
                shouldContinue = collectBracketPairs(child, nodeOffsetStart, nodeOffsetEnd, startOffset, endOffset, context, level + 1, levelPerBracketType);
                if (!shouldContinue) {
                    return false;
                }
            }
        }
        levelPerBracketType?.set(node.openingBracket.text, levelPerBracket);
    }
    else {
        let curOffset = nodeOffsetStart;
        for (const child of node.children) {
            const childOffset = curOffset;
            curOffset = lengthAdd(curOffset, child.length);
            if (lengthLessThanEqual(childOffset, endOffset) &&
                lengthLessThanEqual(startOffset, curOffset)) {
                shouldContinue = collectBracketPairs(child, childOffset, curOffset, startOffset, endOffset, context, level, levelPerBracketType);
                if (!shouldContinue) {
                    return false;
                }
            }
        }
    }
    return shouldContinue;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJhY2tldFBhaXJzVHJlZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNUcmVlL2JyYWNrZXRQYWlyc1RyZWUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUdyRSxPQUFPLEVBQUUsV0FBVyxFQUFFLGlDQUFpQyxFQUFpQixNQUFNLG1DQUFtQyxDQUFDO0FBS2xILE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUM3RCxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFDOUQsT0FBTyxFQUFVLFNBQVMsRUFBRSxzQkFBc0IsRUFBRSxjQUFjLEVBQUUsbUJBQW1CLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDckssT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGFBQWEsQ0FBQztBQUM1QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUMxRCxPQUFPLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFHcEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDeEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFHakUsTUFBTSxPQUFPLGdCQUFpQixTQUFRLFVBQVU7SUFrQnhDLGlCQUFpQixDQUFDLFVBQWtCO1FBQzFDLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxp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