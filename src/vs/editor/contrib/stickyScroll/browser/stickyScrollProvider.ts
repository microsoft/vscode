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
	private readonly editor: ICodeEditor;
	private readonly languageFeaturesService: ILanguageFeaturesService;
	private readonly updateSoon: RunOnceScheduler;

	private cts: CancellationTokenSource | undefined;
	private outlineModel: StickyOutlineElement | undefined;
	private readonly sessionStore: DisposableStore = new DisposableStore();
	private modelVersionId: number = 0;

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this.editor = editor;
		this.languageFeaturesService = _languageFeaturesService;
		this.updateSoon = this._register(new RunOnceScheduler(() => this.update(), 50));
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
			this.sessionStore.add(this.editor.onDidChangeModel(() => this.update()));
			this.sessionStore.add(this.editor.onDidChangeHiddenAreas(() => this.update()));
			this.sessionStore.add(this.editor.onDidChangeModelContent(() => this.updateSoon.schedule()));
			this.sessionStore.add(this.languageFeaturesService.documentSymbolProvider.onDidChange(() => this.update()));
			this.update();
		}
	}

	public getVersionId() {
		return this.modelVersionId;
	}

	private async update(): Promise<void> {
		this.cts?.dispose(true);
		this.cts = new CancellationTokenSource();
		await this.updateOutlineModel(this.cts.token);
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
			this.outlineModel = StickyOutlineElement.fromOutlineModel(outlineModel);
			this.modelVersionId = modelVersionId;
		}
	}

	public getCandidateStickyLinesIntersectingFromOutline(range: StickyRange, outlineModel: StickyOutlineElement, result: StickyLineCandidate[], depth: number, lastStartLineNumber: number): void {
		let lastLine = lastStartLineNumber;
		for (const child of outlineModel.children) {
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
		this.getCandidateStickyLinesIntersectingFromOutline(range, this.outlineModel as StickyOutlineElement, stickyLineCandidates, 0, -1);
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
