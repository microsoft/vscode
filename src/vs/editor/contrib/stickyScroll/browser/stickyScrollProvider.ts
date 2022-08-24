/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement, OutlineGroup } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Range } from 'vs/editor/common/core/range';
import { Emitter } from 'vs/base/common/event';
import { binarySearch } from 'vs/base/common/arrays';

export class StickyRange {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number
	) { }
}

export class StickyLineCandidate {
	constructor(
		public readonly startLineNumber: number,
		public readonly endLineNumber: number,
		public readonly nestingDepth: number,
	) { }
}

export class StickyLineCandidateProvider extends Disposable {
	private readonly onStickyScrollChangeEmitter = this._register(new Emitter<void>());
	public readonly onStickyScrollChange = this.onStickyScrollChangeEmitter.event;

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly _languageFeaturesService: ILanguageFeaturesService;
	private readonly _updateSoon: RunOnceScheduler;

	private _cts: CancellationTokenSource | undefined;
	private _outlineModel: StickyOutlineElement | undefined;
	private readonly _sessionStore: DisposableStore = new DisposableStore();
	private _modelVersionId: number = 0;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._editor = editor;
		this._languageFeaturesService = languageFeaturesService;
		this._updateSoon = this._register(new RunOnceScheduler(() => this.update(), 50));
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this.readConfiguration();
			}
		}));
		this.readConfiguration();
	}

	private readConfiguration() {
		const options = this._editor.getOption(EditorOption.stickyScroll);
		if (options.enabled === false) {
			this._sessionStore.clear();
			return;
		} else {
			this._sessionStore.add(this._editor.onDidChangeModel(() => this.update()));
			this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this.update()));
			this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
			this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this.update()));
			this.update();
		}
	}

	public getVersionId() {
		return this._modelVersionId;
	}

	public async update(): Promise<void> {
		this._cts?.dispose(true);
		this._cts = new CancellationTokenSource();
		await this.updateOutlineModel(this._cts.token);
		this.onStickyScrollChangeEmitter.fire();
	}

	private async updateOutlineModel(token: CancellationToken) {
		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			const modelVersionId = model.getVersionId();
			const outlineModel = await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, token) as OutlineModel;
			if (token.isCancellationRequested) {
				return;
			}
			this._outlineModel = StickyOutlineElement.fromOutlineModel(outlineModel);
			this._modelVersionId = modelVersionId;
		}
	}

	// consider the case when index = -length - 1
	private updatedIndex(index: number) {
		if (index === -1) {
			index = 0;
		} else if (index < 0) {
			index = -index - 2;
		}
		return index;
	}

	public getCandidateStickyLinesIntersectingFromOutline(range: StickyRange, outlineModel: StickyOutlineElement, result: StickyLineCandidate[], depth: number, lastStartLineNumber: number): void {
		if (outlineModel.children.length === 0) {
			return;
		}
		let lastLine = lastStartLineNumber;
		const childrenStartLines = outlineModel.children.filter(child => { return child.range?.startLineNumber !== child.range?.endLineNumber; }).map(child => child.range?.startLineNumber as number);
		console.log('childrenStartLines : ', childrenStartLines);
		console.log('range : ', range);
		console.log('start lines : ', childrenStartLines);
		console.log('b1 ', binarySearch(childrenStartLines, range.startLineNumber, (a: number, b: number) => { return a - b; }));
		console.log('b2 ', binarySearch(childrenStartLines, range.startLineNumber + depth, (a: number, b: number) => { return a - b; }));
		console.log('childrenStartLines : ', childrenStartLines);
		const indexLower = this.updatedIndex(binarySearch(childrenStartLines, range.startLineNumber, (a: number, b: number) => { return a - b; }));
		const indexUpper = this.updatedIndex(binarySearch(childrenStartLines, range.startLineNumber + depth, (a: number, b: number) => { return a - b; }));
		console.log('indexLower : ', indexLower, ' and indexUpper : ', indexUpper);
		for (let i = indexLower; i <= indexUpper; i++) {
			console.log('index i : ', i);
			const child = outlineModel.children.filter(child => { return child.range?.startLineNumber !== child.range?.endLineNumber; })[i];
			if (child.range) {
				const childStartLine = child.range.startLineNumber;
				const childEndLine = child.range.endLineNumber;
				console.log('for range : ', child.range, ' our range : ', range, ' we are outside the if condition');
				if (range.startLineNumber <= childEndLine + 1 && childStartLine - 1 <= range.endLineNumber && childStartLine !== lastLine) {
					lastLine = childStartLine;
					result.push(new StickyLineCandidate(childStartLine, childEndLine - 1, depth + 1));
					this.getCandidateStickyLinesIntersectingFromOutline(range, child, result, depth + 1, childStartLine);
				}
			} else {
				this.getCandidateStickyLinesIntersectingFromOutline(range, child, result, depth, lastStartLineNumber);
			}
		}
	}

	public getCandidateStickyLinesIntersecting(range: StickyRange): StickyLineCandidate[] {
		let stickyLineCandidates: StickyLineCandidate[] = [];
		this.getCandidateStickyLinesIntersectingFromOutline(range, this._outlineModel as StickyOutlineElement, stickyLineCandidates, 0, -1);
		console.log('stickyLineCandidates : ', stickyLineCandidates);
		const hiddenRanges: Range[] | undefined = this._editor._getViewModel()?.getHiddenAreas();
		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				stickyLineCandidates = stickyLineCandidates.filter(stickyLine => !(stickyLine.startLineNumber >= hiddenRange.startLineNumber && stickyLine.endLineNumber <= hiddenRange.endLineNumber + 1));
			}
		}
		return stickyLineCandidates;
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}

class StickyOutlineElement {
	public static fromOutlineModel(outlineModel: OutlineModel | OutlineElement | OutlineGroup): StickyOutlineElement {
		const children = [...outlineModel.children.values()].map(child =>
			StickyOutlineElement.fromOutlineModel(child)
		);
		children.sort((child1, child2) => {
			if (!child1.range || !child2.range) {
				return 1;
			} else if (child1.range.startLineNumber !== child2.range.startLineNumber) {
				return child1.range.startLineNumber - child2.range.startLineNumber;
			} else {
				return child2.range.endLineNumber - child1.range.endLineNumber;
			}
		});
		let range: StickyRange | undefined;
		if (outlineModel instanceof OutlineElement) {
			range = new StickyRange(outlineModel.symbol.selectionRange.startLineNumber, outlineModel.symbol.range.endLineNumber);
		} else {
			range = undefined;
		}
		return new StickyOutlineElement(
			range,
			children
		);
	}
	constructor(
		/**
		 * Range of line numbers spanned by the current scope
		 */
		public readonly range: StickyRange | undefined,
		/**
		 * Must be sorted by start line number
		*/
		public readonly children: readonly StickyOutlineElement[],
	) {
	}
}
