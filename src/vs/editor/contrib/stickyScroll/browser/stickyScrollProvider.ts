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
import { Iterable } from 'vs/base/common/iterator';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
import { FoldingModel } from 'vs/editor/contrib/folding/browser/foldingModel';

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
	private _providerID: string | undefined = undefined;

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
			this._sessionStore.add(this._editor.onDidChangeModel(() => {
				this._providerID = undefined;
				this.update();
			}));
			this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this.update()));
			this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
			this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
				this._providerID = undefined;
				this.update();
			}));
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
			if (outlineModel.children.size !== 0) {
				const { stickyOutlineElement, providerID } = StickyOutlineElement.fromOutlineModel(outlineModel, this._providerID);
				this._outlineModel = stickyOutlineElement;
				this._providerID = providerID;
			} else {
				const foldingController = FoldingController.get(this._editor);
				const foldingModel = await foldingController?.getFoldingModel();
				if (token.isCancellationRequested) {
					return;
				}
				if (foldingModel && foldingModel.regions.length !== 0) {
					this._outlineModel = StickyOutlineElement.fromFoldingModel(foldingModel);
				} else {
					this._outlineModel = new StickyOutlineElement(
						new StickyRange(-1, -1),
						[],
						undefined
					);
				}
			}
			this._modelVersionId = modelVersionId;
		}
	}

	private updateIndex(index: number) {
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
		const childrenStartLines: number[] = [];
		for (let i = 0; i < outlineModel.children.length; i++) {
			const child = outlineModel.children[i];
			if (child.range) {
				childrenStartLines.push(child.range.startLineNumber);
			}
		}
		const lowerBound = this.updateIndex(binarySearch(childrenStartLines, range.startLineNumber, (a: number, b: number) => { return a - b; }));
		const upperBound = this.updateIndex(binarySearch(childrenStartLines, range.startLineNumber + depth, (a: number, b: number) => { return a - b; }));
		for (let i = lowerBound; i <= upperBound; i++) {
			const child = outlineModel.children[i];
			if (!child) {
				return;
			}
			if (child.range) {
				const childStartLine = child.range.startLineNumber;
				const childEndLine = child.range.endLineNumber;
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

	private static comparator(range1: StickyRange, range2: StickyRange): number {
		if (range1.startLineNumber !== range2.startLineNumber) {
			return range1.startLineNumber - range2.startLineNumber;
		} else {
			return range2.endLineNumber - range1.endLineNumber;
		}
	}

	public static fromOutlineElement(outlineElement: OutlineElement, previousStartLine: number): StickyOutlineElement {
		const children: StickyOutlineElement[] = [];
		for (const child of outlineElement.children.values()) {
			if (child.symbol.selectionRange.startLineNumber !== child.symbol.range.endLineNumber) {
				if (child.symbol.selectionRange.startLineNumber !== previousStartLine) {
					children.push(StickyOutlineElement.fromOutlineElement(child, child.symbol.selectionRange.startLineNumber));
				} else {
					for (const subchild of child.children.values()) {
						children.push(StickyOutlineElement.fromOutlineElement(subchild, child.symbol.selectionRange.startLineNumber));
					}
				}
			}
		}
		children.sort((child1, child2) => this.comparator(child1.range!, child2.range!));
		const range = new StickyRange(outlineElement.symbol.selectionRange.startLineNumber, outlineElement.symbol.range.endLineNumber);
		return new StickyOutlineElement(range, children, undefined);
	}

	public static fromOutlineModel(outlineModel: OutlineModel, providerID: string | undefined): { stickyOutlineElement: StickyOutlineElement; providerID: string | undefined } {

		let ID: string | undefined = providerID;
		let outlineElements: Map<string, OutlineElement>;
		// When several possible outline providers
		if (Iterable.first(outlineModel.children.values()) instanceof OutlineGroup) {
			const provider = Iterable.find(outlineModel.children.values(), outlineGroupOfModel => outlineGroupOfModel.id === providerID);
			if (provider) {
				outlineElements = provider.children;
			} else {
				let tempID = '';
				let maxTotalSumOfRanges = 0;
				let optimalOutlineGroup = undefined;
				for (const [_key, outlineGroup] of outlineModel.children.entries()) {
					const totalSumRanges = StickyOutlineElement.findSumOfRangesOfGroup(outlineGroup);
					if (totalSumRanges > maxTotalSumOfRanges) {
						optimalOutlineGroup = outlineGroup;
						maxTotalSumOfRanges = totalSumRanges;
						tempID = outlineGroup.id;
					}
				}
				ID = tempID;
				outlineElements = optimalOutlineGroup!.children;
			}
		} else {
			outlineElements = outlineModel.children as Map<string, OutlineElement>;
		}
		const stickyChildren: StickyOutlineElement[] = [];
		const outlineElementsArray = Array.from(outlineElements.values()).sort((element1, element2) => {
			const range1: StickyRange = new StickyRange(element1.symbol.range.startLineNumber, element1.symbol.range.endLineNumber);
			const range2: StickyRange = new StickyRange(element2.symbol.range.startLineNumber, element2.symbol.range.endLineNumber);
			return this.comparator(range1, range2);
		});
		for (const outlineElement of outlineElementsArray) {
			stickyChildren.push(StickyOutlineElement.fromOutlineElement(outlineElement, outlineElement.symbol.selectionRange.startLineNumber));
		}
		const stickyOutlineElement = new StickyOutlineElement(undefined, stickyChildren, undefined);

		return {
			stickyOutlineElement: stickyOutlineElement,
			providerID: ID
		};
	}

	private static findSumOfRangesOfGroup(outline: OutlineGroup | OutlineElement): number {
		let res = 0;
		for (const child of outline.children.values()) {
			res += this.findSumOfRangesOfGroup(child);
		}
		if (outline instanceof OutlineElement) {
			return res + outline.symbol.range.endLineNumber - outline.symbol.selectionRange.startLineNumber;
		} else {
			return res;
		}
	}

	public static fromFoldingModel(foldingModel: FoldingModel): StickyOutlineElement {
		const regions = foldingModel.regions;
		const length = regions.length;
		let range: StickyRange | undefined;
		const stackOfParents: StickyRange[] = [];

		const stickyOutlineElement = new StickyOutlineElement(
			undefined,
			[],
			undefined
		);
		let parentStickyOutlineElement = stickyOutlineElement;

		for (let i = 0; i < length; i++) {
			range = new StickyRange(regions.getStartLineNumber(i), regions.getEndLineNumber(i) + 1);
			while (stackOfParents.length !== 0 && (range.startLineNumber < stackOfParents[stackOfParents.length - 1].startLineNumber || range.endLineNumber > stackOfParents[stackOfParents.length - 1].endLineNumber)) {
				stackOfParents.pop();
				if (parentStickyOutlineElement.parent !== undefined) {
					parentStickyOutlineElement = parentStickyOutlineElement.parent;
				}
			}
			const child = new StickyOutlineElement(
				range,
				[],
				parentStickyOutlineElement
			);
			parentStickyOutlineElement.children.push(child);
			parentStickyOutlineElement = child;
			stackOfParents.push(range);
		}
		return stickyOutlineElement;
	}

	constructor(
		/**
		 * Range of line numbers spanned by the current scope
		 */
		public readonly range: StickyRange | undefined,
		/**
		 * Must be sorted by start line number
		*/
		public readonly children: StickyOutlineElement[],
		/**
		 * Parent sticky outline element
		 */
		public readonly parent: StickyOutlineElement | undefined
	) {
	}
}
