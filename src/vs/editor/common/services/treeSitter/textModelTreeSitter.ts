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
	private _injectedTreeSitterTrees: Map<string, TreeSitterParseResult> = new Map();
	private _versionId: number = 0;

	get parseResult(): ITreeSitterParseResult | undefined { return this._rootTreeSitterTree; }

	constructor(
		readonly model: ITextModel,
		private readonly _treeSitterLanguages: TreeSitterLanguages,
		parseImmediately: boolean = true,
		@ITreeSitterImporter private readonly _treeSitterImporter: ITreeSitterImporter,
		@ILogService private readonly _logService: ILogService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IFileService private readonly _fileService: IFileService
	) {
		super();
		if (parseImmediately) {
			this._register(Event.runAndSubscribe(this.model.onDidChangeLanguage, (e => this._onDidChangeLanguage(e ? e.newLanguage : this.model.getLanguageId()))));
		} else {
			this._register(this.model.onDidChangeLanguage(e => this._onDidChangeLanguage(e ? e.newLanguage : this.model.getLanguageId())));
		}
	}

	private readonly _parseSessionDisposables = this._register(new DisposableStore());
	/**
	 * Be very careful when making changes to this method as it is easy to introduce race conditions.
	 */
	private async _onDidChangeLanguage(languageId: string) {
		this.parse(languageId);
	}

	public async parse(languageId: string = this.model.getLanguageId()): Promise<ITreeSitterParseResult | undefined> {
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
		this._parseSessionDisposables.add(treeSitterTree.onDidUpdate(e => {
			if (e.ranges && (e.versionId > this._versionId)) {
				this._versionId = e.versionId;
				// check for injected languages
				// If we have injected languages, parse those ranges in the appropriate language.
				// Fire an event that includes the ranges per language
				const ranges: Record<string, RangeChange[]> = {};
				ranges[e.language] = e.ranges;
				this._onDidChangeParseResult.fire({ ranges, versionId: e.versionId, tree: e.tree });
			}
		}));
		this._parseSessionDisposables.add(this.model.onDidChangeContent(e => this._onDidChangeContent(treeSitterTree, e)));
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

	private _handleTreeUpdate(e: TreeParseUpdateEvent) {
		if (e.ranges && (e.versionId >= this._versionId)) {
			this._versionId = e.versionId;
			// kick off check for injected languages
			this._parseInjected();

			const ranges: Record<string, RangeChange[]> = {};
			ranges[e.language] = e.ranges;
			this._onDidChangeParseResult.fire({ ranges, versionId: e.versionId, tree: e.tree });
		}
	}

	private _queries: string | undefined;
	private async _ensureInjectionQueries() {
		if (!this._queries) {
			const injectionsQueriesLocation: AppResourcePath = `vs/editor/common/languages/injections/${this.model.getLanguageId()}.scm`;
			const uri = FileAccess.asFileUri(injectionsQueriesLocation);
			if (!(await this._fileService.exists(uri))) {
				this._queries = '';
			} else {
				const query = await this._fileService.readFile(uri);
				this._queries = query.value.toString();
			}
		}
		return this._queries;
	}

	private async _getQuery() {
		if (!this._query) {
			const language = await this._treeSitterLanguages.getLanguage(this.model.getLanguageId());
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

	private async _parseInjected() {
		const tree = this._rootTreeSitterTree?.tree;
		if (!tree) {
			return;
		}
		const query = await this._getQuery();
		if (!query) {
			return;
		}

		const injectionCaptures = query.captures(tree.rootNode);

		// TODO @alexr00: Use a better data structure for this
		const injections: Map<string, Parser.Range[]> = new Map();
		for (const capture of injectionCaptures) {
			const injectionLanguage = capture.setProperties ? capture.setProperties['injection.language'] : undefined;
			if (injectionLanguage) {
				const range: Parser.Range = capture.node;
				if (!injections.has(injectionLanguage)) {
					injections.set(injectionLanguage, []);
				}
				injections.get(injectionLanguage)?.push(range);
			}
		}
		for (const [languageId, ranges] of injections) {
			const language = await this._treeSitterLanguages.getLanguage(languageId);
			if (!language) {
				continue;
			}
			let treeSitterTree = this._injectedTreeSitterTrees.get(languageId);
			if (!treeSitterTree) {
				const Parser = await this._treeSitterImporter.getParserClass();
				treeSitterTree = new TreeSitterParseResult(new Parser(), languageId, language, this._logService, this._telemetryService);
				this._parseSessionDisposables.add(treeSitterTree.onDidUpdate(e => this._handleTreeUpdate(e)));
				this._injectedTreeSitterTrees.set(languageId, treeSitterTree);
			}
			treeSitterTree.ranges = ranges;
			this._onDidChangeContent(treeSitterTree, undefined);
		}
	}

	private _onDidChangeContent(treeSitterTree: TreeSitterParseResult, change: IModelContentChangedEvent | undefined) {
		return treeSitterTree.onDidChangeContent(this.model, change);
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
		private readonly _language: string,
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

	private findChangedNodes(newTree: Parser.Tree, oldTree: Parser.Tree): Parser.Node[] {
		const newCursor = newTree.walk();
		const oldCursor = oldTree.walk();

		const nodes: Parser.Node[] = [];
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
					if (c?.hasChanges) {
						indexChangedChildren.push(index);
					}
					return c?.hasChanges;
				});
				// If we have changes and we *had* an error, the whole node should be refreshed.
				if ((changedChildren.length === 0)) {
					// walk up again until we get to the first one that's named as unnamed nodes can be too granular
					while (newCursor.currentNode.parent && !newCursor.currentNode.isNamed && next) {
						next = gotoParent(newCursor, oldCursor);
					}

					const newNode = newCursor.currentNode;
					nodes.push(newNode);
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

	private findTreeChanges(newTree: Parser.Tree, changedNodes: Parser.Node[]): RangeChange[] {
		const mergedChanges: RangeChange[] = [];

		// Find the parent in the new tree of the changed node
		for (let nodeIndex = 0; nodeIndex < changedNodes.length; nodeIndex++) {
			const node = changedNodes[nodeIndex];

			if (mergedChanges.length > 0) {
				if ((node.startIndex > mergedChanges[mergedChanges.length - 1].newRangeStartOffset) && (node.endIndex < mergedChanges[mergedChanges.length - 1].newRangeEndOffset)) {
					// This node is within the previous range, skip it
					continue;
				}
			}

			const cursor = newTree.walk();
			const cursorContainersNode = () => cursor.startIndex <= node.startIndex && cursor.endIndex >= node.endIndex;

			while (cursorContainersNode()) {
				// See if we can go to a child
				let child = cursor.gotoFirstChild();
				let foundChild = false;
				while (child) {
					if (cursorContainersNode()) {
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
					if (cursor.startIndex <= node.startIndex && cursor.endIndex > node.startIndex) {
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
			const startingPosition = previousNode ? previousNode.endPosition : nodesInRange[0].startPosition;
			const startingIndex = previousNode ? previousNode.endIndex : nodesInRange[0].startIndex;
			const endingPosition = nodesInRange[nodesInRange.length - 1].endPosition;
			const endingIndex = nodesInRange[nodesInRange.length - 1].endIndex;

			const newChange = { newRange: new Range(startingPosition.row + 1, startingPosition.column + 1, endingPosition.row + 1, endingPosition.column + 1), newRangeStartOffset: startingIndex, newRangeEndOffset: endingIndex };
			if ((mergedChanges.length > 0) && (mergedChanges[mergedChanges.length - 1].newRangeEndOffset >= newChange.newRangeStartOffset)) {
				// Merge the changes
				mergedChanges[mergedChanges.length - 1].newRange = Range.fromPositions(mergedChanges[mergedChanges.length - 1].newRange.getStartPosition(), newChange.newRange.getEndPosition());
				mergedChanges[mergedChanges.length - 1].newRangeEndOffset = newChange.newRangeEndOffset;
			} else {
				mergedChanges.push(newChange);
			}
		}
		return mergedChanges;
	}

	private _onDidChangeContentQueue: LimitedQueue = new LimitedQueue();
	public onDidChangeContent(model: ITextModel, changes: IModelContentChangedEvent | undefined): void {
		const version = model.getVersionId();
		if (version === this._editVersion) {
			return;
		}

		this._applyEdits(changes?.changes ?? [], version);

		this._onDidChangeContentQueue.queue(async () => {
			if (this.isDisposed) {
				// No need to continue the queue if we are disposed
				return;
			}

			const oldTree = this._lastFullyParsed;
			let changedNodes: Parser.Node[] | undefined;
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
					ranges = this.findTreeChanges(completed, changedNodes);
				}
				this._onDidUpdate.fire({ language: this._language, ranges, versionId: version, tree: completed });
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
	set ranges(ranges: Parser.Range[]) {
		if (this._ranges && ranges.length === this._ranges.length) {
			for (let i = 0; i < ranges.length; i++) {
				if (!rangesEqual(ranges[i], this._ranges[i])) {
					this._ranges = ranges;
					return;
				}
			}
		} else {
			this._ranges = ranges;
		}
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
			this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.fullParse`, { languageId: this._language, time, passes });
		} else {
			this._telemetryService.publicLog2<{ languageId: string; time: number; passes: number }, ParseTimeClassification>(`treeSitter.incrementalParse`, { languageId: this._language, time, passes });
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
