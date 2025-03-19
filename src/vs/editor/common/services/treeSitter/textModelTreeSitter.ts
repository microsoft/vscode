/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Parser from '@vscode/tree-sitter-wasm';
import { ITreeSitterParseResult, ITextModelTreeSitter, RangeChange, TreeParseUpdateEvent, ITreeSitterImporter, ModelTreeUpdateEvent } from '../treeSitterParserService.js';
import { Disposable, DisposableStore, dispose, IDisposable } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../model.js';
import { IModelContentChange, IModelContentChangedEvent } from '../../textModelEvents.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { setTimeout0 } from '../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { CancellationToken, cancelOnDispose } from '../../../../base/common/cancellation.js';
import { Range } from '../../core/range.js';
import { LimitedQueue } from '../../../../base/common/async.js';
import { TextLength } from '../../core/textLength.js';
import { TreeSitterLanguages } from './treeSitterLanguages.js';
import { AppResourcePath, FileAccess } from '../../../../base/common/network.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { getClosestPreviousNodes, gotoNthChild, gotoParent, nextSiblingOrParentSibling } from './cursorUtils.js';

export interface TextModelTreeSitterItem {
	dispose(): void;
	textModelTreeSitter: TextModelTreeSitter;
	disposables: DisposableStore;
}

const enum TelemetryParseType {
	Full = 'fullParse',
	Incremental = 'incrementalParse'
}

export class TextModelTreeSitter extends Disposable implements ITextModelTreeSitter {
	private _onDidChangeParseResult: Emitter<ModelTreeUpdateEvent> = this._register(new Emitter<ModelTreeUpdateEvent>());
	public readonly onDidChangeParseResult: Event<ModelTreeUpdateEvent> = this._onDidChangeParseResult.event;
	private _rootTreeSitterTree: TreeSitterParseResult | undefined;

	private _query: Parser.Query | undefined;
	// TODO: @alexr00 use a better data structure for this
	private _injectionTreeSitterTrees: Map<string, TreeSitterParseResult> = new Map();
	private _versionId: number = 0;

	get parseResult(): ITreeSitterParseResult | undefined { return this._rootTreeSitterTree; }

	constructor(
		readonly textModel: ITextModel,
		private readonly _treeSitterLanguages: TreeSitterLanguages,
		parseImmediately: boolean = true,
		@ITreeSitterImporter private readonly _treeSitterImporter: ITreeSitterImporter,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();
		if (parseImmediately) {
			this._register(Event.runAndSubscribe(this.textModel.onDidChangeLanguage, (e => this._onDidChangeLanguage(e ? e.newLanguage : this.textModel.getLanguageId()))));
		} else {
			this._register(this.textModel.onDidChangeLanguage(e => this._onDidChangeLanguage(e ? e.newLanguage : this.textModel.getLanguageId())));
		}
	}

	private readonly _parseSessionDisposables = this._register(new DisposableStore());
	private async _onDidChangeLanguage(languageId: string) {
		this.parse(languageId);
	}

	/**
	 * Be very careful when making changes to this method as it is easy to introduce race conditions.
	 */
	public async parse(languageId: string = this.textModel.getLanguageId()): Promise<ITreeSitterParseResult | undefined> {
		this._parseSessionDisposables.clear();
		this._rootTreeSitterTree = undefined;

		const token = cancelOnDispose(this._parseSessionDisposables);
		let language: Parser.Language | undefined;
		try {
			language = await this._getLanguage(languageId, token);
		} catch (e) {
			if (isCancellationError(e)) {
				return;
			}
			throw e;
		}

		const Parser = await this._treeSitterImporter.getParserClass();
		if (token.isCancellationRequested) {
			return;
		}

		const treeSitterTree = this._parseSessionDisposables.add(new TreeSitterParseResult(new Parser(), languageId, language, this._logService, this._telemetryService));
		this._rootTreeSitterTree = treeSitterTree;
		this._parseSessionDisposables.add(treeSitterTree.onDidUpdate(e => this._handleTreeUpdate(e)));
		this._parseSessionDisposables.add(this.textModel.onDidChangeContent(e => this._onDidChangeContent(treeSitterTree, [e])));
		this._onDidChangeContent(treeSitterTree, undefined);
		if (token.isCancellationRequested) {
			return;
		}

		return this._rootTreeSitterTree;
	}

	private _getLanguage(languageId: string, token: CancellationToken): Promise<Parser.Language> {
		const language = this._treeSitterLanguages.getOrInitLanguage(languageId);
		if (language) {
			return Promise.resolve(language);
		}
		const disposables: IDisposable[] = [];

		return new Promise((resolve, reject) => {
			disposables.push(this._treeSitterLanguages.onDidAddLanguage(e => {
				if (e.id === languageId) {
					dispose(disposables);
					resolve(e.language);
				}
			}));
			token.onCancellationRequested(() => {
				dispose(disposables);
				reject(new CancellationError());
			}, undefined, disposables);
		});
	}

	private async _handleTreeUpdate(e: TreeParseUpdateEvent, parentTreeResult?: ITreeSitterParseResult, parentLanguage?: string) {
		if (e.ranges && (e.versionId >= this._versionId)) {
			this._versionId = e.versionId;
			const tree = parentTreeResult ?? this._rootTreeSitterTree!;
			let injections: Map<string, Parser.Range[]> | undefined;
			if (tree.tree) {
				injections = await this._collectInjections(tree.tree);
				// kick off check for injected languages
				if (injections) {
					this._processInjections(injections, tree, parentLanguage ?? this.textModel.getLanguageId(), e.includedModelChanges);
				}
			}

			this._onDidChangeParseResult.fire({ ranges: e.ranges, versionId: e.versionId, tree: this, languageId: this.textModel.getLanguageId(), hasInjections: !!injections && injections.size > 0 });
		}
	}

	private _queries: string | undefined;
	private async _ensureInjectionQueries() {
		if (!this._queries) {
			const injectionsQueriesLocation: AppResourcePath = `vs/editor/common/languages/injections/${this.textModel.getLanguageId()}.scm`;
			const uri = FileAccess.asFileUri(injectionsQueriesLocation);
			if (!(await this._fileService.exists(uri))) {
				this._queries = '';
			} else if (this._fileService.hasProvider(uri)) {
				const query = await this._fileService.readFile(uri);
				this._queries = query.value.toString();
			} else {
				this._queries = '';
			}
		}
		return this._queries;
	}

	private async _getQuery() {
		if (!this._query) {
			const language = await this._treeSitterLanguages.getLanguage(this.textModel.getLanguageId());
			if (!language) {
				return;
			}
			const queries = await this._ensureInjectionQueries();
			if (queries === '') {
				return;
			}
			const Query = await this._treeSitterImporter.getQueryClass();
			this._query = new Query(language, queries);
		}
		return this._query;
	}

	private async _collectInjections(tree: Parser.Tree): Promise<Map<string, Parser.Range[]> | undefined> {
		const query = await this._getQuery();
		if (!query) {
			return;
		}

		if (!tree?.rootNode) {
			// need to check the root node here as `walk` will throw if not defined.
			return;
		}

		const cursor = tree.walk();
		const injections: Map<string, Parser.Range[]> = new Map();
		let hasNext = true;

		while (hasNext) {
			hasNext = await this._processNode(cursor, query, injections);
			// Yield periodically
			await new Promise<void>(resolve => setTimeout0(resolve));
		}

		return this._mergeAdjacentRanges(injections);
	}

	private _processNode(cursor: Parser.TreeCursor, query: Parser.Query, injections: Map<string, Parser.Range[]>): boolean {
		const node = cursor.currentNode;
		const nodeLineCount = node.endPosition.row - node.startPosition.row;

		// We check the node line count to avoid processing large nodes in one go as that can cause performance issues.
		if (nodeLineCount <= 1000) {
			this._processCaptures(query, node, injections);
			// Move to next sibling or up and over
			return cursor.gotoNextSibling() || this.gotoNextSiblingOfAncestor(cursor);
		} else {
			// Node is too large, go to first child or next sibling
			return cursor.gotoFirstChild() || cursor.gotoNextSibling() || this.gotoNextSiblingOfAncestor(cursor);
		}
	}

	private _processCaptures(query: Parser.Query, node: Parser.Node, injections: Map<string, Parser.Range[]>): void {
		const captures = query.captures(node);
		for (const capture of captures) {
			const injectionLanguage = capture.setProperties?.['injection.language'];
			if (injectionLanguage) {
				const range = this._createRangeFromNode(capture.node);
				if (!injections.has(injectionLanguage)) {
					injections.set(injectionLanguage, []);
				}
				injections.get(injectionLanguage)?.push(range);
			}
		}
	}

	private _createRangeFromNode(node: Parser.Node): Parser.Range {
		return {
			startIndex: node.startIndex,
			endIndex: node.endIndex,
			startPosition: { row: node.startPosition.row, column: node.startPosition.column },
			endPosition: { row: node.endPosition.row, column: node.endPosition.column }
		};
	}

	private _mergeAdjacentRanges(injections: Map<string, Parser.Range[]>): Map<string, Parser.Range[]> {
		for (const [languageId, ranges] of injections) {
			if (ranges.length <= 1) {
				continue;
			}

			const mergedRanges: Parser.Range[] = [];
			let current = ranges[0];

			for (let i = 1; i < ranges.length; i++) {
				const next = ranges[i];
				if (next.startIndex <= current.endIndex) {
					current = this._mergeRanges(current, next);
				} else {
					mergedRanges.push(current);
					current = next;
				}
			}
			mergedRanges.push(current);

			injections.set(languageId, mergedRanges);
		}

		return injections;
	}

	private _mergeRanges(current: Parser.Range, next: Parser.Range): Parser.Range {
		return {
			startIndex: current.startIndex,
			endIndex: Math.max(current.endIndex, next.endIndex),
			startPosition: current.startPosition,
			endPosition: next.endPosition.row > current.endPosition.row ?
				next.endPosition :
				current.endPosition
		};
	}

	private async _processInjections(
		injections: Map<string, Parser.Range[]>,
		parentTree: ITreeSitterParseResult,
		parentLanguage: string,
		modelChanges: IModelContentChangedEvent[] | undefined
	): Promise<void> {
		for (const [languageId, ranges] of injections) {
			const language = await this._treeSitterLanguages.getLanguage(languageId);
			if (!language) {
				continue;
			}

			const treeSitterTree = await this._getOrCreateInjectedTree(languageId, language, parentTree, parentLanguage);
			if (treeSitterTree) {
				this._onDidChangeContent(treeSitterTree, modelChanges, ranges);
			}
		}
	}

	private async _getOrCreateInjectedTree(
		languageId: string,
		language: Parser.Language,
		parentTree: ITreeSitterParseResult,
		parentLanguage: string
	): Promise<TreeSitterParseResult | undefined> {
		let treeSitterTree = this._injectionTreeSitterTrees.get(languageId);
		if (!treeSitterTree) {
			const Parser = await this._treeSitterImporter.getParserClass();
			treeSitterTree = new TreeSitterParseResult(new Parser(), languageId, language, this._logService, this._telemetryService);
			this._parseSessionDisposables.add(treeSitterTree.onDidUpdate(e => this._handleTreeUpdate(e, parentTree, parentLanguage)));
			this._injectionTreeSitterTrees.set(languageId, treeSitterTree);
		}
		return treeSitterTree;
	}

	private gotoNextSiblingOfAncestor(cursor: Parser.TreeCursor): boolean {
		while (cursor.gotoParent()) {
			if (cursor.gotoNextSibling()) {
				return true;
			}
		}
		return false;
	}

	getInjection(offset: number, parentLanguage: string): ITreeSitterParseResult | undefined {
		if (this._injectionTreeSitterTrees.size === 0) {
			return undefined;
		}
		let hasFoundParentLanguage = parentLanguage === this.textModel.getLanguageId();

		for (const [_, treeSitterTree] of this._injectionTreeSitterTrees) {
			if (treeSitterTree.tree) {
				if (hasFoundParentLanguage && treeSitterTree.ranges?.find(r => r.startIndex <= offset && r.endIndex >= offset)) {
					return treeSitterTree;
				}
				if (!hasFoundParentLanguage && treeSitterTree.languageId === parentLanguage) {
					hasFoundParentLanguage = true;
				}
			}
		}
		return undefined;
	}

	private _onDidChangeContent(treeSitterTree: TreeSitterParseResult, change: IModelContentChangedEvent[] | undefined, ranges?: Parser.Range[]) {
		treeSitterTree.onDidChangeContent(this.textModel, change, ranges);
	}
}

export class TreeSitterParseResult implements IDisposable, ITreeSitterParseResult {
	private _tree: Parser.Tree | undefined;
	private _lastFullyParsed: Parser.Tree | undefined;
	private _lastFullyParsedWithEdits: Parser.Tree | undefined;
	private readonly _onDidUpdate: Emitter<TreeParseUpdateEvent> = new Emitter<TreeParseUpdateEvent>();
	public readonly onDidUpdate: Event<TreeParseUpdateEvent> = this._onDidUpdate.event;
	private _versionId: number = 0;
	private _editVersion: number = 0;
	get versionId() {
		return this._versionId;
	}
	private _isDisposed: boolean = false;
	constructor(public readonly parser: Parser.Parser,
		public readonly languageId: string,
		public /** exposed for tests **/ readonly language: Parser.Language,
		private readonly _logService: ILogService,
		private readonly _telemetryService: ITelemetryService) {
		this.parser.setLanguage(language);
	}
	dispose(): void {
		this._isDisposed = true;
		this._onDidUpdate.dispose();
		this._tree?.delete();
		this._lastFullyParsed?.delete();
		this._lastFullyParsedWithEdits?.delete();
		this.parser?.delete();
	}
	get tree() { return this._lastFullyParsed; }
	get isDisposed() { return this._isDisposed; }

	private findChangedNodes(newTree: Parser.Tree, oldTree: Parser.Tree): Parser.Range[] {
		const newCursor = newTree.walk();
		const oldCursor = oldTree.walk();

		const nodes: Parser.Range[] = [];
		let next = true;

		do {
			if (newCursor.currentNode.hasChanges) {
				// Check if only one of the children has changes.
				// If it's only one, then we go to that child.
				// If it's more then, we need to go to each child
				// If it's none, then we've found one of our ranges
				const newChildren = newCursor.currentNode.children;
				const indexChangedChildren: number[] = [];
				const changedChildren = newChildren.filter((c, index) => {
					if (c?.hasChanges || (oldCursor.currentNode.children.length <= index)) {
						indexChangedChildren.push(index);
						return true;
					}
					return false;
				});
				// If we have changes and we *had* an error, the whole node should be refreshed.
				if ((changedChildren.length === 0) || (newCursor.currentNode.hasError !== oldCursor.currentNode.hasError)) {
					// walk up again until we get to the first one that's named as unnamed nodes can be too granular
					while (newCursor.currentNode.parent && next && !newCursor.currentNode.isNamed) {
						next = gotoParent(newCursor, oldCursor);
					}
					// Use the end position of the previous node and the start position of the current node
					const newNode = newCursor.currentNode;
					const closestPreviousNode = getClosestPreviousNodes(newCursor, newTree) ?? newNode;
					nodes.push({
						startIndex: closestPreviousNode.startIndex,
						endIndex: newNode.endIndex,
						startPosition: closestPreviousNode.startPosition,
						endPosition: newNode.endPosition
					});
					next = nextSiblingOrParentSibling(newCursor, oldCursor);
				} else if (changedChildren.length >= 1) {
					next = gotoNthChild(newCursor, oldCursor, indexChangedChildren[0]);
				}
			} else {
				next = nextSiblingOrParentSibling(newCursor, oldCursor);
			}
		} while (next);

		return nodes;
	}

	private findTreeChanges(newTree: Parser.Tree, changedNodes: Parser.Range[], newRanges: Parser.Range[]): RangeChange[] {
		let newRangeIndex = 0;
		const mergedChanges: RangeChange[] = [];

		// Find the parent in the new tree of the changed node
		for (let nodeIndex = 0; nodeIndex < changedNodes.length; nodeIndex++) {
			const node = changedNodes[nodeIndex];

			if (mergedChanges.length > 0) {
				if ((node.startIndex >= mergedChanges[mergedChanges.length - 1].newRangeStartOffset) && (node.endIndex <= mergedChanges[mergedChanges.length - 1].newRangeEndOffset)) {
					// This node is within the previous range, skip it
					continue;
				}
			}

			const cursor = newTree.walk();
			const cursorContainersNode = () => cursor.startIndex < node.startIndex && cursor.endIndex > node.endIndex;

			while (cursorContainersNode()) {
				// See if we can go to a child
				let child = cursor.gotoFirstChild();
				let foundChild = false;
				while (child) {
					if (cursorContainersNode() && cursor.currentNode.isNamed) {
						foundChild = true;
						break;
					} else {
						child = cursor.gotoNextSibling();
					}
				}
				if (!foundChild) {
					cursor.gotoParent();
					break;
				}
				if (cursor.currentNode.childCount === 0) {
					break;
				}
			}

			let nodesInRange: Parser.Node[];
			// It's possible we end up with a really large range if the parent node is big
			// Try to avoid this large range by finding several smaller nodes that together encompass the range of the changed node.
			const foundNodeSize = cursor.endIndex - cursor.startIndex;
			if (foundNodeSize > 5000) {
				// Try to find 3 consecutive nodes that together encompass the changed node.
				let child = cursor.gotoFirstChild();
				nodesInRange = [];
				while (child) {
					if (cursor.endIndex > node.startIndex) {
						// Found the starting point of our nodes
						nodesInRange.push(cursor.currentNode);
						do {
							child = cursor.gotoNextSibling();
						} while (child && (cursor.endIndex < node.endIndex));

						nodesInRange.push(cursor.currentNode);
						break;
					}
					child = cursor.gotoNextSibling();
				}
			} else {
				nodesInRange = [cursor.currentNode];
			}

			// Fill in gaps between nodes
			// Reset the cursor to the first node in the range;
			while (cursor.currentNode.id !== nodesInRange[0].id) {
				cursor.gotoPreviousSibling();
			}
			const previousNode = getClosestPreviousNodes(cursor, newTree);
			const startPosition = previousNode ? previousNode.endPosition : nodesInRange[0].startPosition;
			const startIndex = previousNode ? previousNode.endIndex : nodesInRange[0].startIndex;
			const endPosition = nodesInRange[nodesInRange.length - 1].endPosition;
			const endIndex = nodesInRange[nodesInRange.length - 1].endIndex;

			const newChange = { newRange: new Range(startPosition.row + 1, startPosition.column + 1, endPosition.row + 1, endPosition.column + 1), newRangeStartOffset: startIndex, newRangeEndOffset: endIndex };
			if ((newRangeIndex < newRanges.length) && rangesIntersect(newRanges[newRangeIndex], { startIndex, endIndex, startPosition, endPosition })) {
				// combine the new change with the range
				if (newRanges[newRangeIndex].startIndex < newChange.newRangeStartOffset) {
					newChange.newRange = newChange.newRange.setStartPosition(newRanges[newRangeIndex].startPosition.row + 1, newRanges[newRangeIndex].startPosition.column + 1);
					newChange.newRangeStartOffset = newRanges[newRangeIndex].startIndex;
				}
				if (newRanges[newRangeIndex].endIndex > newChange.newRangeEndOffset) {
					newChange.newRange = newChange.newRange.setEndPosition(newRanges[newRangeIndex].endPosition.row + 1, newRanges[newRangeIndex].endPosition.column + 1);
					newChange.newRangeEndOffset = newRanges[newRangeIndex].endIndex;
				}
				newRangeIndex++;
			} else if (newRangeIndex < newRanges.length && newRanges[newRangeIndex].endIndex < newChange.newRangeStartOffset) {
				// add the full range to the merged changes
				mergedChanges.push({
					newRange: new Range(newRanges[newRangeIndex].startPosition.row + 1, newRanges[newRangeIndex].startPosition.column + 1, newRanges[newRangeIndex].endPosition.row + 1, newRanges[newRangeIndex].endPosition.column + 1),
					newRangeStartOffset: newRanges[newRangeIndex].startIndex,
					newRangeEndOffset: newRanges[newRangeIndex].endIndex
				});
			}

			if ((mergedChanges.length > 0) && (mergedChanges[mergedChanges.length - 1].newRangeEndOffset >= newChange.newRangeStartOffset)) {
				// Merge the changes
				mergedChanges[mergedChanges.length - 1].newRange = Range.fromPositions(mergedChanges[mergedChanges.length - 1].newRange.getStartPosition(), newChange.newRange.getEndPosition());
				mergedChanges[mergedChanges.length - 1].newRangeEndOffset = newChange.newRangeEndOffset;
			} else {
				mergedChanges.push(newChange);
			}
		}
		return this._constrainRanges(mergedChanges);
	}

	private _constrainRanges(changes: RangeChange[]): RangeChange[] {
		if (!this.ranges) {
			return changes;
		}

		const constrainedChanges: RangeChange[] = [];
		let changesIndex = 0;
		let rangesIndex = 0;
		while (changesIndex < changes.length && rangesIndex < this.ranges.length) {
			const change = changes[changesIndex];
			const range = this.ranges[rangesIndex];
			if (change.newRangeEndOffset < range.startIndex) {
				// Change is before the range, move to the next change
				changesIndex++;
			} else if (change.newRangeStartOffset > range.endIndex) {
				// Change is after the range, move to the next range
				rangesIndex++;
			} else {
				// Change is within the range, constrain it
				const newRangeStartOffset = Math.max(change.newRangeStartOffset, range.startIndex);
				const newRangeEndOffset = Math.min(change.newRangeEndOffset, range.endIndex);
				const newRange = change.newRange.intersectRanges(new Range(range.startPosition.row + 1, range.startPosition.column + 1, range.endPosition.row + 1, range.endPosition.column + 1))!;
				constrainedChanges.push({
					newRange,
					newRangeEndOffset,
					newRangeStartOffset
				});
				// Remove the intersected range from the current change
				if (newRangeEndOffset < change.newRangeEndOffset) {
					change.newRange = Range.fromPositions(newRange.getEndPosition(), change.newRange.getEndPosition());
					change.newRangeStartOffset = newRangeEndOffset + 1;
				} else {
					// Move to the next change
					changesIndex++;
				}
			}
		}

		return constrainedChanges;
	}

	private _unfiredChanges: IModelContentChangedEvent[] | undefined;
	private _onDidChangeContentQueue: LimitedQueue = new LimitedQueue();
	public onDidChangeContent(model: ITextModel, changes: IModelContentChangedEvent[] | undefined, ranges?: Parser.Range[]): void {
		const version = model.getVersionId();
		if (version === this._editVersion) {
			return;
		}

		let newRanges: Parser.Range[] = [];
		if (ranges) {
			newRanges = this._setRanges(ranges);
		}

		if (changes && changes.length > 0) {
			if (this._unfiredChanges) {
				this._unfiredChanges.push(...changes);
			} else {
				this._unfiredChanges = changes;
			}
			for (const change of changes) {
				this._applyEdits(change.changes, version);
			}
		} else {
			this._applyEdits([], version);
		}

		this._onDidChangeContentQueue.queue(async () => {
			if (this.isDisposed) {
				// No need to continue the queue if we are disposed
				return;
			}

			const oldTree = this._lastFullyParsed;
			let changedNodes: Parser.Range[] | undefined;
			if (this._lastFullyParsedWithEdits && this._lastFullyParsed) {
				changedNodes = this.findChangedNodes(this._lastFullyParsedWithEdits, this._lastFullyParsed);
			}

			const completed = await this._parseAndUpdateTree(model, version);
			if (completed) {
				let ranges: RangeChange[] | undefined;
				if (!changedNodes) {
					if (this._ranges) {
						ranges = this._ranges.map(r => ({ newRange: new Range(r.startPosition.row + 1, r.startPosition.column + 1, r.endPosition.row + 1, r.endPosition.column + 1), oldRangeLength: r.endIndex - r.startIndex, newRangeStartOffset: r.startIndex, newRangeEndOffset: r.endIndex }));
					} else {
						ranges = [{ newRange: model.getFullModelRange(), newRangeStartOffset: 0, newRangeEndOffset: model.getValueLength() }];
					}
				} else if (oldTree && changedNodes) {
					ranges = this.findTreeChanges(completed, changedNodes, newRanges);
				}
				const changes = this._unfiredChanges ?? [];
				this._unfiredChanges = undefined;
				this._onDidUpdate.fire({ language: this.languageId, ranges, versionId: version, tree: completed, includedModelChanges: changes });
			}
		});
	}

	private _applyEdits(changes: IModelContentChange[], version: number) {
		for (const change of changes) {
			const originalTextLength = TextLength.ofRange(Range.lift(change.range));
			const newTextLength = TextLength.ofText(change.text);
			const summedTextLengths = change.text.length === 0 ? newTextLength : originalTextLength.add(newTextLength);
			const edit = {
				startIndex: change.rangeOffset,
				oldEndIndex: change.rangeOffset + change.rangeLength,
				newEndIndex: change.rangeOffset + change.text.length,
				startPosition: { row: change.range.startLineNumber - 1, column: change.range.startColumn - 1 },
				oldEndPosition: { row: change.range.endLineNumber - 1, column: change.range.endColumn - 1 },
				newEndPosition: { row: change.range.startLineNumber + summedTextLengths.lineCount - 1, column: summedTextLengths.lineCount ? summedTextLengths.columnCount : (change.range.endColumn + summedTextLengths.columnCount) }
			};
			this._tree?.edit(edit);
			this._lastFullyParsedWithEdits?.edit(edit);
		}
		this._editVersion = version;
	}

	private async _parseAndUpdateTree(model: ITextModel, version: number): Promise<Parser.Tree | undefined> {
		const tree = await this._parse(model);
		if (tree) {
			this._tree?.delete();
			this._tree = tree;
			this._lastFullyParsed?.delete();
			this._lastFullyParsed = tree.copy();
			this._lastFullyParsedWithEdits?.delete();
			this._lastFullyParsedWithEdits = tree.copy();
			this._versionId = version;
			return tree;
		} else if (!this._tree) {
			// No tree means this is the initial parse and there were edits
			// parse function doesn't handle this well and we can end up with an incorrect tree, so we reset
			this.parser.reset();
		}
		return undefined;
	}

	private _parse(model: ITextModel): Promise<Parser.Tree | undefined> {
		let parseType: TelemetryParseType = TelemetryParseType.Full;
		if (this.tree) {
			parseType = TelemetryParseType.Incremental;
		}
		return this._parseAndYield(model, parseType);
	}

	private async _parseAndYield(model: ITextModel, parseType: TelemetryParseType): Promise<Parser.Tree | undefined> {
		let time: number = 0;
		let passes: number = 0;
		const inProgressVersion = this._editVersion;
		let newTree: Parser.Tree | null | undefined;
		this._lastYieldTime = performance.now();

		do {
			const timer = performance.now();
			try {
				newTree = this.parser.parse((index: number, position?: Parser.Point) => this._parseCallback(model, index), this._tree, { progressCallback: this._parseProgressCallback.bind(this), includedRanges: this._ranges });
			} catch (e) {
				// parsing can fail when the timeout is reached, will resume upon next loop
			} finally {
				time += performance.now() - timer;
				passes++;
			}

			// So long as this isn't the initial parse, even if the model changes and edits are applied, the tree parsing will continue correctly after the await.
			await new Promise<void>(resolve => setTimeout0(resolve));

		} while (!model.isDisposed() && !this.isDisposed && !newTree && inProgressVersion === model.getVersionId());
		this.sendParseTimeTelemetry(parseType, time, passes);
		return (newTree && (inProgressVersion === model.getVersionId())) ? newTree : undefined;
	}

	private _lastYieldTime: number = 0;
	private _parseProgressCallback(state: Parser.ParseState) {
		const now = performance.now();
		if (now - this._lastYieldTime > 50) {
			this._lastYieldTime = now;
			return true;
		}
		return false;
	}

	private _parseCallback(textModel: ITextModel, index: number): string | undefined {
		try {
			return textModel.getTextBuffer().getNearestChunk(index);
		} catch (e) {
			this._logService.debug('Error getting chunk for tree-sitter parsing', e);
		}
		return undefined;
	}

	private _ranges: Parser.Range[] | undefined;
	private _setRanges(newRanges: Parser.Range[]): Parser.Range[] {
		const unKnownRanges: Parser.Range[] = [];
		// If we have existing ranges, find the parts of the new ranges that are not included in the existing ones
		if (this._ranges) {
			for (const newRange of newRanges) {
				let isFullyIncluded = false;

				for (let i = 0; i < this._ranges.length; i++) {
					const existingRange = this._ranges[i];

					if (rangesEqual(existingRange, newRange) || rangesIntersect(existingRange, newRange)) {
						isFullyIncluded = true;
						break;
					}
				}

				if (!isFullyIncluded) {
					unKnownRanges.push(newRange);
				}
			}
		} else {
			// No existing ranges, all new ranges are unknown
			unKnownRanges.push(...newRanges);
		}

		this._ranges = newRanges;
		return unKnownRanges;
	}

	get ranges(): Parser.Range[] | undefined {
		return this._ranges;
	}

	private sendParseTimeTelemetry(parseType: TelemetryParseType, time: number, passes: number): void {
		this._logService.debug(`Tree parsing (${parseType}) took ${time} ms and ${passes} passes.`);
		type ParseTimeClassification = {
			owner: 'alexr00';
			comment: 'Used to understand how long it takes to parse a tree-sitter tree';
			languageId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The programming language ID.' };
			time: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The ms it took to parse' };
			passes: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of passes it took to parse' };
		};
		if (parseType === TelemetryParseType.Full) {
			this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.fullParse`, { languageId: this.languageId, time, passes });
		} else {
			this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.incrementalParse`, { languageId: this.languageId, time, passes });
		}
	}
}

function rangesEqual(a: Parser.Range, b: Parser.Range) {
	return (a.startPosition.row === b.startPosition.row)
		&& (a.startPosition.column === b.startPosition.column)
		&& (a.endPosition.row === b.endPosition.row)
		&& (a.endPosition.column === b.endPosition.column)
		&& (a.startIndex === b.startIndex)
		&& (a.endIndex === b.endIndex);
}

function rangesIntersect(a: Parser.Range, b: Parser.Range) {
	return (a.startIndex <= b.startIndex && a.endIndex >= b.startIndex) ||
		(b.startIndex <= a.startIndex && b.endIndex >= a.startIndex);
}
