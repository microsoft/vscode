/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { OutlineModel, OutlineElement } from 'vs/editor/contrib/documentSymbols/browser/outlineModel';
import { CancellationToken, CancellationTokenSource, } from 'vs/base/common/cancellation';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { SymbolKind } from 'vs/editor/common/languages';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { Range } from 'vs/editor/common/core/range';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';

class StickyScrollController extends Disposable implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly _languageFeaturesService: ILanguageFeaturesService;
	private readonly stickyScrollWidget: StickyScrollWidget;
	private readonly _updateSoon: RunOnceScheduler;
	private _cts: CancellationTokenSource | undefined;

	private readonly _sessionStore: DisposableStore = new DisposableStore();
	private _ranges: [number, number, number][] = [];
	private _rangesVersionId: number = 0;
	// private readonly _stickyLineCandidateProvider: StickyLineCandidateProvider = new StickyLineCandidateProvider();

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._editor = editor;
		this._languageFeaturesService = _languageFeaturesService;
		this.stickyScrollWidget = new StickyScrollWidget(this._editor);
		this._updateSoon = this._register(new RunOnceScheduler(() => this._update(true), 50));

		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.experimental)) {
				this.onConfigurationChange();
			}
		}));
		this.onConfigurationChange();
	}

	private onConfigurationChange() {
		const options = this._editor.getOption(EditorOption.experimental);
		if (options.stickyScroll.enabled === false) {
			this.stickyScrollWidget.emptyRootNode();
			this._editor.removeOverlayWidget(this.stickyScrollWidget);
			this._sessionStore.clear();
			return;
		} else {
			this._editor.addOverlayWidget(this.stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidChangeModel(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidScrollChange(() => this._update(false)));
			this._sessionStore.add(this._editor.onDidChangeHiddenAreas(() => this._update(true)));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
			this._sessionStore.add(this._editor.onDidChangeModelContent(() => this._updateSoon.schedule()));
			this._sessionStore.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => this._update(true)));
			const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => this._update(false)));
			}
			this._update(true);
		}
	}

	private _onDidResize() {
		const width = this._editor.getLayoutInfo().width - this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth - this._editor.getLayoutInfo().verticalScrollbarWidth;
		this.stickyScrollWidget.getDomNode().style.width = `${width}px`;
	}

	private _needsUpdate(event: IModelTokensChangedEvent) {
		const stickyLineNumbers = this.stickyScrollWidget.getCurrentLines();
		for (const stickyLineNumber of stickyLineNumbers) {
			for (const range of event.ranges) {
				if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private _onTokensChange(event: IModelTokensChangedEvent) {
		if (this._needsUpdate(event)) {
			this._update(false);
		}
	}

	private async _update(updateOutline: boolean = false): Promise<void> {
		if (updateOutline) {
			this._cts?.dispose(true);
			this._cts = new CancellationTokenSource();
			await this._updateOutlineModel(this._cts.token);
		}
		const hiddenRanges: Range[] | undefined = this._editor._getViewModel()?.getHiddenAreas();
		if (hiddenRanges) {
			for (const hiddenRange of hiddenRanges) {
				this._ranges = this._ranges.filter(range => { return !(range[0] >= hiddenRange.startLineNumber && range[1] <= hiddenRange.endLineNumber + 1); });
			}
		}
		this._renderStickyScroll();
	}

	private _findLineRanges(outlineElement: OutlineElement, depth: number) {
		if (outlineElement?.children.size) {
			let didRecursion: boolean = false;
			for (const outline of outlineElement?.children.values()) {
				const kind: SymbolKind = outline.symbol.kind;
				if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
					didRecursion = true;
					this._findLineRanges(outline, depth + 1);
				}
			}
			if (!didRecursion) {
				this._addOutlineRanges(outlineElement, depth);
			}
		} else {
			this._addOutlineRanges(outlineElement, depth);
		}
	}

	private _addOutlineRanges(outlineElement: OutlineElement, depth: number) {
		let currentStartLine: number | undefined = 0;
		let currentEndLine: number | undefined = 0;

		while (outlineElement) {
			const kind: SymbolKind = outlineElement.symbol.kind;
			if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
				currentStartLine = outlineElement?.symbol.range.startLineNumber as number;
				currentEndLine = outlineElement?.symbol.range.endLineNumber as number;
				if (currentEndLine > currentStartLine) {
					this._ranges.push([currentStartLine, currentEndLine - 1, depth]);
				} else {
					this._ranges.push([currentStartLine, currentEndLine, depth]);
				}
				depth--;
			}
			if (outlineElement.parent instanceof OutlineElement) {
				outlineElement = outlineElement.parent;
			} else {
				break;
			}
		}
	}

	private async _updateOutlineModel(token: CancellationToken) {
		if (this._editor.hasModel()) {
			const model = this._editor.getModel();
			const modelVersionId = model.getVersionId();
			const outlineModel = await OutlineModel.create(this._languageFeaturesService.documentSymbolProvider, model, token);
			if (token.isCancellationRequested) {
				return;
			}
			this._ranges = [];
			this._rangesVersionId = modelVersionId;
			for (const outline of outlineModel.children.values()) {
				if (outline instanceof OutlineElement) {
					const kind: SymbolKind = outline.symbol.kind;
					if (kind === SymbolKind.Class || kind === SymbolKind.Constructor || kind === SymbolKind.Function || kind === SymbolKind.Interface || kind === SymbolKind.Method || kind === SymbolKind.Module) {
						this._findLineRanges(outline, 1);
					} else {
						this._findLineRanges(outline, 0);
					}
				}
				this._ranges.sort(function (a, b) {
					if (a[0] !== b[0]) {
						return a[0] - b[0];
					} else if (a[1] !== b[1]) {
						return b[1] - a[1];
					} else {
						return a[2] - b[2];
					}
				});

				const startLinesConsidered: Set<number> = new Set();
				this._ranges = this._ranges.filter(arr => {
					if (!startLinesConsidered.has(arr[0])) {
						startLinesConsidered.add(arr[0]);
						return true;
					} else {
						return false;
					}
				});
			}
		}
	}

	private _getScrollWidgetState(): StickyScrollWidgetState {
		// const stickyHeaders = this.candidateProvider.getStickyHeadersIntersectingViewPort(editor.viewPortRange());
		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
		const scrollTop: number = this._editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const lineNumbers: number[] = [];
		for (const arr of this._ranges) {
			const [start, end, depth] = arr;
			if (end - start > 0) {
				const topOfElementAtDepth = (depth - 1) * lineHeight;
				const bottomOfElementAtDepth = depth * lineHeight;

				const bottomOfBeginningLine = this._editor.getBottomForLineNumber(start) - scrollTop;
				const topOfEndLine = this._editor.getTopForLineNumber(end) - scrollTop;
				const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;

				if (topOfElementAtDepth >= topOfEndLine - 1 && topOfElementAtDepth < bottomOfEndLine - 2) {
					lineNumbers.push(start);
					lastLineRelativePosition = bottomOfEndLine - bottomOfElementAtDepth;
					break;
				}
				else if (bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth < bottomOfEndLine - 1) {
					lineNumbers.push(start);
				}
			}
		}
		return new StickyScrollWidgetState(lineNumbers, lastLineRelativePosition);
	}

	private _renderStickyScroll() {

		if (!(this._editor.hasModel())) {
			return;
		}
		const model = this._editor.getModel();
		if (this._rangesVersionId !== model.getVersionId()) {
			// Old _ranges not updated yet
			return;
		}
		this.stickyScrollWidget.emptyRootNode();
		this.stickyScrollWidget.setState(this._getScrollWidgetState());
		this.stickyScrollWidget.renderRootNode();
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

