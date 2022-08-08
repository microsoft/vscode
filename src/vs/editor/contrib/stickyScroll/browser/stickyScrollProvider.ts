/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement, OutlineGroup } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Range } from 'vs/editor/common/core/range';
import { Emitter } from 'vs/base/common/event';

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
	private readonly editor: ICodeEditor;
	private readonly languageFeaturesService: ILanguageFeaturesService;
	private readonly updateSoon: RunOnceScheduler;

	private cts: CancellationTokenSource | undefined;
	private outlineModel: OutlineModel | undefined;
	private readonly sessionStore: DisposableStore = new DisposableStore();
	private modelVersionId: number = 0;
	private startLinesConsidered: Set<number> = new Set();

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this.editor = editor;
		this.languageFeaturesService = _languageFeaturesService;
		this.updateSoon = this._register(new RunOnceScheduler(() => this.update(true), 50));
		this._register(this.editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.experimental)) {
				this.readConfiguration();
			}
		}));
		this.readConfiguration();
	}

	private readConfiguration() {
		const options = this.editor.getOption(EditorOption.experimental);
		if (options.stickyScroll.enabled === false) {
			this.sessionStore.clear();
			return;
		} else {
			this.sessionStore.add(this.editor.onDidChangeModel(() => this.update(true)));
			this.sessionStore.add(this.editor.onDidScrollChange(() => this.update(false)));
			this.sessionStore.add(this.editor.onDidChangeHiddenAreas(() => this.update(true)));
			this.sessionStore.add(this.editor.onDidChangeModelContent(() => this.updateSoon.schedule()));
			this.sessionStore.add(this.languageFeaturesService.documentSymbolProvider.onDidChange(() => this.update(true)));
			const lineNumberOption = this.editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this.sessionStore.add(this.editor.onDidChangeCursorPosition(() => this.update(false)));
			}
			this.update(true);
		}
	}

	public getVersionId() {
		return this.modelVersionId;
	}

	private async update(updateOutline: boolean = false): Promise<void> {
		if (updateOutline) {
			this.cts?.dispose(true);
			this.cts = new CancellationTokenSource();
			await this.updateOutlineModel(this.cts.token);
		}
		this.onStickyScrollChangeEmitter.fire();
	}

	private async updateOutlineModel(token: CancellationToken) {
		if (this.editor.hasModel()) {
			const model = this.editor.getModel();
			const modelVersionId = model.getVersionId();
			const outlineModel = await OutlineModel.create(this.languageFeaturesService.documentSymbolProvider, model, token) as OutlineModel;
			if (token.isCancellationRequested) {
				return;
			}
			this.outlineModel = this.sortOutline(outlineModel) as OutlineModel;
			this.modelVersionId = modelVersionId;
		}
	}

	private sortOutline(model: OutlineModel | OutlineElement | OutlineGroup): OutlineModel | OutlineElement | OutlineGroup {

		const outlineElementChildren = new Map([...model.children].filter(child => child[1] instanceof OutlineElement));
		const outlineGroupChildren = new Map([...model.children].filter(child => child[1] instanceof OutlineGroup));

		const sortedChildren = new Map([...outlineElementChildren].sort((child1, child2) => (child1[1] as OutlineElement).symbol.range.startLineNumber - (child2[1] as OutlineElement).symbol.range.startLineNumber));
		const updatedChildrenMap = new Map([...sortedChildren, ...outlineGroupChildren]);
		const updatedOutline = model;
		updatedOutline.children = updatedChildrenMap;

		for (const [_definitionString, child] of model.children) {
			const updatedChild = this.sortOutline(child) as OutlineElement | OutlineGroup;
			updatedOutline.children.set(_definitionString, updatedChild);
		}
		return updatedOutline;
	}

	public getCandidateStickyLinesIntersectingFromOutline(range: Range, outlineModel: OutlineModel | OutlineElement | OutlineGroup, stickyLineCandidates: StickyLineCandidate[], depth: number): void {
		for (const [_definitionString, child] of outlineModel.children) {
			if (child instanceof OutlineElement) {
				const childStartLine = child.symbol.range.startLineNumber;
				const childEndLine = child.symbol.range.endLineNumber;
				if (range.startLineNumber <= childEndLine + 1 && childStartLine - 1 <= range.endLineNumber && !this.startLinesConsidered.has(childStartLine)) {
					this.startLinesConsidered.add(childStartLine);
					stickyLineCandidates.push(new StickyLineCandidate(childStartLine, childEndLine - 1, depth + 1));
					this.getCandidateStickyLinesIntersectingFromOutline(range, child, stickyLineCandidates, depth + 1);
				}
			} else if (child instanceof OutlineGroup) {
				this.getCandidateStickyLinesIntersectingFromOutline(range, child, stickyLineCandidates, depth);
			}
		}
	}

	public getCandidateStickyLinesIntersecting(range: Range): StickyLineCandidate[] {

		this.startLinesConsidered.clear();
		let stickyLineCandidates: StickyLineCandidate[] = [];
		if (range) {
			this.getCandidateStickyLinesIntersectingFromOutline(range, this.outlineModel as OutlineModel, stickyLineCandidates, 0);
		}
		const hiddenRanges: Range[] | undefined = this.editor._getViewModel()?.getHiddenAreas();
		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				stickyLineCandidates = stickyLineCandidates.filter(stickyLine => !(stickyLine.startLineNumber >= hiddenRange.startLineNumber && stickyLine.endLineNumber <= hiddenRange.endLineNumber + 1));
			}
		}
		return stickyLineCandidates;
	}

	override dispose(): void {
		super.dispose();
		this.sessionStore.dispose();
	}
}
