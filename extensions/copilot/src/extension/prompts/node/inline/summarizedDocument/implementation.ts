/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { AbstractDocument } from '../../../../../platform/editing/common/abstractText';
import { OverlayNode } from '../../../../../platform/parser/node/nodes';
import { min } from '../../../../../util/common/arrays';
import { compareBy, groupAdjacentBy, numberComparator, sumBy } from '../../../../../util/vs/base/common/arrays';
import { CachedFunction } from '../../../../../util/vs/base/common/cache';
import { StringEdit, StringReplacement } from '../../../../../util/vs/editor/common/core/edits/stringEdit';
import { Position } from '../../../../../util/vs/editor/common/core/position';
import { OffsetRange } from '../../../../../util/vs/editor/common/core/ranges/offsetRange';
import { PositionOffsetTransformer } from '../../../../../util/vs/editor/common/core/text/positionToOffset';
import { TextLength } from '../../../../../util/vs/editor/common/core/text/textLength';
import { Range } from '../../../../../vscodeTypes';
import { IAstVisualization, subtractRange, toAstNode } from '../visualization';
import { ConcatenatedStringFragment, LiteralStringFragment, OriginalStringFragment, pushFragment, StringFragment } from './fragments';
import { ProjectedText } from './projectedText';

// Please avoid using vscode API types in this file!
// This makes testing and reusing much easier (e.g. for inline edits, where the original document is before the edits, which means vscode.TextDocument is not sufficient).

export interface IDocumentToSummarize<TDocument extends AbstractDocument> {
	document: TDocument;
	selection: Range | undefined; // TODO set this through a scoring function
	overlayNodeRoot: OverlayNode;
}

export interface ISummarizedDocumentSettings<TDocument extends AbstractDocument> {

	/**
	 * Custom cost function. Return `false` to make sure a node is removed
	 */
	costFnOverride?: ((node: RemovableNode, currentCost: number, document: TDocument) => number | false) | ICostFnFactory<TDocument>;

	/**
	 * If set to true, summarization tries to preserve type checking, e.g. by not removing important imports or removing used method signatures.
	 */
	tryPreserveTypeChecking?: boolean;

	/**
	 * If set to true, summarization always uses ellipsis for elisions, like in between sibling AST nodes.
	 */
	alwaysUseEllipsisForElisions?: boolean;

	/**
	 * The style for line numbers in the summarized document.
	 */
	lineNumberStyle?: SummarizedDocumentLineNumberStyle;
}

export interface ICostFnFactory<TDocument extends AbstractDocument> {
	createCostFn(doc: TDocument): (node: RemovableNode, currentCost: number) => number | false;
}

export class RemovableNode {
	constructor(
		public readonly parent: RemovableNode | undefined,
		private readonly overlayNode: OverlayNode,
		public readonly range: OffsetRange,
		public readonly children: readonly RemovableNode[],
		private readonly _document: AbstractDocument,
	) { }

	public get kind(): string {
		return this.overlayNode.kind;
	}

	public get text(): string {
		return this._document.getTextInOffsetRange(this.range);
	}
}

export class ProjectedDocument<TDocument extends AbstractDocument = AbstractDocument> extends ProjectedText {
	constructor(
		public readonly baseDocument: TDocument,
		edits: StringEdit,
	) {
		super(baseDocument.getText(), edits);
	}

	getLanguageId(this: ProjectedDocument<AbstractDocument & { languageId: string }>): string {
		return this.baseDocument.languageId;
	}
}

export interface IProjectedDocumentDebugInfo extends ProjectedText {
	getVisualization?(): IAstVisualization;
}

export function summarizeDocumentsSyncImpl<TDocument extends AbstractDocument>(
	charLimit: number,
	settings: ISummarizedDocumentSettings<TDocument>,
	docs: IDocumentToSummarize<TDocument>[],
): ProjectedDocument<TDocument>[] {

	const rootMarkedNodes: SurvivingTextNode[] = [];
	const bestSummarizationResultsPerDocIdx: StringFragment[] = [];

	const allNodesWithScores: { docIdx: number; node: SurvivingTextNode; cost: number }[] = [];

	for (let i = 0; i < docs.length; i++) {
		const { document, overlayNodeRoot, selection } = docs[i];

		const text = document.getText();
		const offsetSelection = selection ? document.rangeToOffsetRange(selection) : undefined;
		const removableNodeRoot = createRemovableNodeFromOverlayNode(overlayNodeRoot, document);
		const rootTextNode = TextNode.fromRootNode(removableNodeRoot, document);
		const rootMarkedNode = SurvivingTextNode.fromNode(rootTextNode, !!settings.tryPreserveTypeChecking, !!settings.alwaysUseEllipsisForElisions, settings.lineNumberStyle ?? SummarizedDocumentLineNumberStyle.None);

		if (offsetSelection) {
			// mark all leaf nodes that intersect userSelection
			rootMarkedNode.visitAll(node => {
				if (!node.node.range.intersectsOrTouches(offsetSelection)) {
					return false;
				}
				if (node.node.children.length === 0) {
					node.markAsSurviving();
				}
				return true;
			});
		}

		rootMarkedNodes.push(rootMarkedNode);
		bestSummarizationResultsPerDocIdx.push(rootMarkedNode.getTextFragment());

		const distanceScoreToSelection = (node: TextNode) => {
			if (!offsetSelection) {
				return 0;
			}
			if (node.range.endExclusive < offsetSelection.start) {
				// this node is above
				return offsetSelection.start - node.range.endExclusive;
			}
			if (node.range.start > offsetSelection.endExclusive) {
				// this node is below
				return 3 * (node.range.start - offsetSelection.endExclusive); // we will punish code that is below
			}
			// this node is intersecting
			return 0;
		};

		const scopeDistanceDown: CachedFunction<TextNode, number> = new CachedFunction(node => {
			if (!offsetSelection) {
				return 0;
			}
			if (node.children.length === 0) {
				return node.range.intersectsOrTouches(offsetSelection) ? 0 : Number.MAX_SAFE_INTEGER;
			} else {
				return min(node.children.map(n => scopeDistanceDown.get(n))) + 1;
			}
		});
		const scopeDistance: CachedFunction<TextNode, number> = new CachedFunction(node => {
			const parentScopeDistance = node.parent ? scopeDistance.get(node.parent) : Number.MAX_SAFE_INTEGER;
			const nodeScopeDistanceDown = scopeDistanceDown.get(node);
			return Math.min(parentScopeDistance, nodeScopeDistanceDown);
		});

		const tryPreserveTypeChecking = !!settings.tryPreserveTypeChecking;
		let costFn: (node: TextNode) => number | false = node => {
			if (tryPreserveTypeChecking && node.node?.kind === 'import_statement') {
				return 0;
			}
			return 100 * scopeDistance.get(node)
				+ node.depth
				+ 10 * (distanceScoreToSelection(node) / text.length);
		};

		const costFnOverride = typeof settings.costFnOverride === 'object' ? settings.costFnOverride.createCostFn(document) : settings.costFnOverride;
		if (costFnOverride !== undefined) {
			const oldCostFn = costFn;

			costFn = (n: TextNode) => {
				const currentScore = oldCostFn(n);
				if (currentScore === false) {
					return false;
				}
				if (!n.node) {
					return currentScore;
				}
				return costFnOverride(n.node, currentScore, document);
			};
		}

		const allNodes = rootMarkedNode.getDescendantsAndSelf();

		for (const node of allNodes) {
			if (!node.node.node) {
				continue;
			}
			const cost = costFn(node.node);
			if (cost === false) {
				continue;
			}
			allNodesWithScores.push({
				docIdx: i,
				node,
				cost
			});
		}
	}

	allNodesWithScores.sort(compareBy(n => n.cost, numberComparator));


	const getLineNumberText = (lineNumber: number) => {
		return `${lineNumber}: `;
	};

	for (const { node, docIdx } of allNodesWithScores) {
		node.markAsSurviving();

		// total length of all nodes
		let totalLength = sumBy(rootMarkedNodes, c => c.getTextFragment().length);
		if (settings.lineNumberStyle === SummarizedDocumentLineNumberStyle.Full) {
			const textLen = TextLength.sum(rootMarkedNodes, c => c.getTextFragment().textLength);
			const maxLineNumber = docs[docIdx].document.getLineCount();
			const totalLineNumberChars = textLen.lineCount * getLineNumberText(maxLineNumber).length; // This is an upper bound approximation.
			totalLength += totalLineNumberChars;
		}
		if (totalLength > charLimit) {
			break;
		}

		bestSummarizationResultsPerDocIdx[docIdx] = rootMarkedNodes[docIdx].getTextFragment();
	}

	const result: ProjectedDocument<TDocument>[] = [];

	for (let i = 0; i < bestSummarizationResultsPerDocIdx.length; i++) {
		const bestSummarizationResult = bestSummarizationResultsPerDocIdx[i];
		const { document } = docs[i];
		let e = bestSummarizationResult.toEditFromOriginal(document.getText().length);

		if (settings.lineNumberStyle === SummarizedDocumentLineNumberStyle.Full) {
			const summarizedDoc = e.apply(document.getText());
			const t = new PositionOffsetTransformer(summarizedDoc);
			const lineNumberReplacements: StringReplacement[] = [];
			const lineCount = t.textLength.lineCount;
			for (let curLine = 1; curLine <= lineCount; curLine++) {
				const offset = t.getOffset(new Position(curLine, 1));
				const offsetBefore = e.applyInverseToOffset(offset);
				const pos = document.getPositionAtOffset(offsetBefore);
				lineNumberReplacements.push(new StringReplacement(OffsetRange.emptyAt(offset), getLineNumberText(pos.line + 1)));
			}
			e = e.compose(new StringEdit(lineNumberReplacements));
		}

		const projectedDoc = new ProjectedDocument(document, e);
		const r = projectedDoc as IProjectedDocumentDebugInfo;

		const rootMarkedNode = rootMarkedNodes[i];

		r.getVisualization = () => ({
			...{ $fileExtension: 'ast.w' },
			source: {
				value: projectedDoc.originalText,
				decorations: subtractRange(
					OffsetRange.ofLength(projectedDoc.originalText.length),
					projectedDoc.edits.replacements.map(e => e.replaceRange),
				).map(r => ({
					range: [r.start, r.endExclusive],
					color: 'lime',
				}))
			},
			root: toAstNode(rootMarkedNode, n => ({
				label: (n.node.node?.kind || 'unknown') + ` (${allNodesWithScores.find(nws => nws.node === n)?.cost})`,
				range: n.node.range,
				children: n.childNodes,
				isMarked: n['_surviving'],
			}))
		});

		result.push(projectedDoc);
	}

	return result;
}

function createRemovableNodeFromOverlayNode(node: OverlayNode, document: AbstractDocument, parent: RemovableNode | undefined = undefined): RemovableNode {
	const range = new OffsetRange(node.startIndex, node.endIndex);
	const children: RemovableNode[] = [];
	const result = new RemovableNode(parent, node, range, children, document);
	for (const n of node.children) {
		children.push(createRemovableNodeFromOverlayNode(n, document, result));
	}
	return result;
}

/**
 * A dense representation of the text in a document.
 * Based on overlay nodes.
 *
 * **Dense**: every character is contained by some leaf node.
*/
class TextNode {
	public static fromRootNode(node: RemovableNode, document: AbstractDocument): TextNode {
		const fullRange = new OffsetRange(0, document.length);
		if (node.range.equals(fullRange)) {
			return TextNode.fromNode(node, document);
		}

		// The root node does not cover the entire document!
		// So we have to create a virtual root that actually does cover the entire document.

		const startGap = new OffsetRange(0, node.range.start);
		const endGap = new OffsetRange(node.range.endExclusive, document.length);

		const children: TextNode[] = [];
		const rootNode = new TextNode(undefined, fullRange, children, 0, null, document);

		if (!startGap.isEmpty) {
			children.push(new TextNode(undefined, startGap, [], 0, rootNode, document));
		}
		children.push(TextNode.fromNode(node, document, 1, null));
		if (!endGap.isEmpty) {
			children.push(new TextNode(undefined, endGap, [], 0, rootNode, document));
		}
		return rootNode;
	}

	private static fromNode(node: RemovableNode, document: AbstractDocument, depth = 0, parent: TextNode | null = null): TextNode {
		const children: TextNode[] = [];
		const result = new TextNode(node, node.range, children, depth, parent, document);
		if (node.children.length > 0) {
			let lastEnd = node.range.start;
			for (const n of node.children) {
				const gap = new OffsetRange(lastEnd, n.range.start);
				if (!gap.isEmpty) {
					children.push(new TextNode(undefined, gap, [], depth, result, document));
				}
				children.push(TextNode.fromNode(n, document, depth + 1, result));
				lastEnd = n.range.endExclusive;
			}
			const gap = new OffsetRange(lastEnd, node.range.endExclusive);
			if (!gap.isEmpty) {
				children.push(new TextNode(undefined, gap, [], depth, result, document));
			}
		}
		return result;
	}

	constructor(
		public readonly node: RemovableNode | undefined,
		public readonly range: OffsetRange,
		public readonly children: readonly TextNode[],
		public readonly depth: number,
		public readonly parent: TextNode | null,
		public readonly document: AbstractDocument,
	) { }

	getLeadingWs(): string {
		return getLeadingWs(this.document.getText(), this.range);
	}

	getIndentation(): string {
		let indentation = this.getLeadingWs();
		const lastNewLineIdx = indentation.lastIndexOf('\n');
		if (lastNewLineIdx !== -1) {
			indentation = indentation.substring(lastNewLineIdx + 1);
		}
		return indentation;
	}

	getTrailingWs(): string {
		return getTrailingWs(this.document.getText(), this.range);
	}
}

function getLeadingWs(str: string, range: OffsetRange): string {
	const val = range.substring(str);
	const trimmed = val.length - val.trimStart().length;
	const ws = val.substring(0, trimmed);
	return ws;
}

function getTrailingWs(str: string, range: OffsetRange): string {
	const val = range.substring(str);
	const trimmed = val.length - val.trimEnd().length;
	const ws = val.substring(val.length - trimmed);
	return ws;
}

export enum SummarizedDocumentLineNumberStyle {
	None,
	OmittedRanges,
	Full,
}

class SurvivingTextNode {
	public static fromNode(node: TextNode, tryPreserveTypeChecking: boolean, alwaysUseEllipsisForElisions: boolean, lineNumberStyle: SummarizedDocumentLineNumberStyle): SurvivingTextNode {
		return SurvivingTextNode.fromNodeParent(node, null, tryPreserveTypeChecking, alwaysUseEllipsisForElisions, lineNumberStyle);
	}

	private static fromNodeParent(node: TextNode, parent: SurvivingTextNode | null, tryPreserveTypeChecking: boolean, alwaysUseEllipsisForElisions: boolean, lineNumberStyle: SummarizedDocumentLineNumberStyle): SurvivingTextNode {
		const children: SurvivingTextNode[] = [];
		const result = new SurvivingTextNode(node, parent, children, tryPreserveTypeChecking, alwaysUseEllipsisForElisions, lineNumberStyle);
		for (const child of node.children) {
			const childNode = SurvivingTextNode.fromNodeParent(child, result, tryPreserveTypeChecking, alwaysUseEllipsisForElisions, lineNumberStyle);
			children.push(childNode);
		}
		return result;
	}

	private _surviving = false;

	constructor(
		public readonly node: TextNode,
		public readonly parent: SurvivingTextNode | null,
		public readonly childNodes: readonly SurvivingTextNode[],
		private readonly _tryPreserveTypeChecking: boolean,
		private readonly _alwaysUseEllipsisForElisions: boolean,
		private readonly _lineNumberStyle: SummarizedDocumentLineNumberStyle,
	) {
	}

	visitAll(fn: (node: SurvivingTextNode) => boolean): void {
		if (!fn(this)) { return; }
		for (const child of this.childNodes) {
			child.visitAll(fn);
		}
	}

	markAsSurviving(): void {
		if (this._surviving) { return; }
		this._surviving = true;
		if (this.parent) {
			this.parent.markAsSurviving();
		}
		this.invalidate();
	}

	private _textFragment: StringFragment | null = null;

	private invalidate(): void {
		if (!this._textFragment) { return; }
		this._textFragment = null;
		if (this.parent) {
			this.parent.invalidate();
		}
	}

	getTextFragment(): StringFragment {
		if (!this._textFragment) {
			this._textFragment = this._computeSummarization();
		}
		return this._textFragment;
	}

	private _computeSummarization(): StringFragment {
		if (this.childNodes.length === 0 && (this._surviving || !this.node.node)) {
			return new OriginalStringFragment(this.node.range, this.node.document.getText());
		}
		if (!this._surviving) {
			return new LiteralStringFragment('');
		}

		const groups = Array.from(groupAdjacentBy(this.childNodes.map(n => ({ node: n, fragment: n.getTextFragment() })), (f1, f2) => (f1.fragment.length === 0) === (f2.fragment.length === 0)));

		const getOmittedMessage = (omittedRange: OffsetRange): string => {
			if (this._lineNumberStyle === SummarizedDocumentLineNumberStyle.OmittedRanges) {
				const range = this.node.document.getPositionOffsetTransformer().getRange(omittedRange);
				if (range.startLineNumber !== range.endLineNumber) {
					return `/* Lines ${range.startLineNumber}-${range.endLineNumber} omitted */`;
				}
				return `/* Line ${range.startLineNumber} omitted */`;
			}
			return this._tryPreserveTypeChecking ? '/* ... */' : '…';
		};

		for (let i = 0; i < groups.length; i++) {
			// in one group, all elements either are all empty or non-empty. Also, no group is empty.
			const g = groups[i];
			const isEmpty = g[0].fragment.length === 0;

			if (isEmpty && i > 0 && i < groups.length - 1) {
				// All our fragments are empty.
				const prev = groups[i - 1].at(-1)!; // Non-empty before us
				const next = groups[i + 1].at(0)!; // Non-empty after us

				const fullRange = g.at(0)!.node.node.range.join(g.at(-1)!.node.node.range);

				if (prev.fragment instanceof OriginalStringFragment && next.fragment instanceof OriginalStringFragment) {
					const startTrimmed = prev.fragment.trimEnd();
					const endTrimmed = next.fragment.trimStart();
					if (startTrimmed.endsWith('{') && endTrimmed.startsWith('}')) {
						groups[i - 1][groups[i - 1].length - 1].fragment = startTrimmed;
						g.length = 1;

						g[0].fragment = new LiteralStringFragment(getOmittedMessage(fullRange));
						groups[i + 1][0].fragment = endTrimmed;
						continue;
					}
				}

				if (this._alwaysUseEllipsisForElisions || this._lineNumberStyle === SummarizedDocumentLineNumberStyle.OmittedRanges) {
					const indentation = g.at(0)!.node.node.getIndentation();
					const end = g.at(-1)!.node.node.getTrailingWs();
					g.length = 1;
					g[0].fragment = new LiteralStringFragment(indentation + getOmittedMessage(fullRange) + end);
				}
			}
		}

		const result: StringFragment[] = [];
		for (const group of groups) {
			for (const g of group) {
				pushFragment(result, g.fragment);
			}
		}

		return ConcatenatedStringFragment.from(result);
	}

	getDescendantsAndSelf(): SurvivingTextNode[] {
		const result: SurvivingTextNode[] = [];
		this._getDescendantsAndSelf(result);
		return result;
	}

	private _getDescendantsAndSelf(result: SurvivingTextNode[]): void {
		result.push(this);
		for (const child of this.childNodes) {
			child._getDescendantsAndSelf(result);
		}
	}
}
