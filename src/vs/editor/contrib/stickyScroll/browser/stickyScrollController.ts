/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';
import { StickyLineCandidateProvider, StickyRange } from './stickyScrollProvider';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class StickyScrollController extends Disposable implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly _stickyScrollWidget: StickyScrollWidget;
	private readonly _stickyLineCandidateProvider: StickyLineCandidateProvider;
	private readonly _sessionStore: DisposableStore = new DisposableStore();
	private _widgetState: StickyScrollWidgetState;

	constructor(
		_editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService _instaService: IInstantiationService,
	) {
		super();
		this._editor = _editor;
		this._stickyScrollWidget = new StickyScrollWidget(this._editor, _languageFeaturesService, _instaService);
		this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, _languageFeaturesService);
		this._widgetState = new StickyScrollWidgetState([], 0);

		this._register(this._stickyScrollWidget);
		this._register(this._stickyLineCandidateProvider);
		this._register(this._editor.onDidChangeConfiguration(e => {
			if (e.hasChanged(EditorOption.stickyScroll)) {
				this.readConfiguration();
			}
		}));
		this.readConfiguration();
	}

	public get stickyScrollCandidateProvider() {
		return this._stickyLineCandidateProvider;
	}

	public get stickyScrollWidgetState() {
		return this._widgetState;
	}

	private readConfiguration() {
		const options = this._editor.getOption(EditorOption.stickyScroll);
		if (options.enabled === false) {
			this._editor.removeOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.clear();
			return;
		} else {
			this._editor.addOverlayWidget(this._stickyScrollWidget);
			this._sessionStore.add(this._editor.onDidScrollChange(() => this.renderStickyScroll()));
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this.onDidResize()));
			this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this.onTokensChange(e)));
			this._sessionStore.add(this._stickyLineCandidateProvider.onStickyScrollChange(() => this.renderStickyScroll()));
			const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this._sessionStore.add(this._editor.onDidChangeCursorPosition(() => this.renderStickyScroll()));
			}
		}
	}

	private needsUpdate(event: IModelTokensChangedEvent) {
		const stickyLineNumbers = this._stickyScrollWidget.getCurrentLines();
		for (const stickyLineNumber of stickyLineNumbers) {
			for (const range of event.ranges) {
				if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
					return true;
				}
			}
		}
		return false;
	}

	private onTokensChange(event: IModelTokensChangedEvent) {
		if (this.needsUpdate(event)) {
			this.renderStickyScroll();
		}
	}

	private onDidResize() {
		const width = this._editor.getLayoutInfo().width - this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth - this._editor.getLayoutInfo().verticalScrollbarWidth;
		this._stickyScrollWidget.getDomNode().style.width = `${width}px`;
	}

	private renderStickyScroll() {
		if (!(this._editor.hasModel())) {
			return;
		}
		const model = this._editor.getModel();
		if (this._stickyLineCandidateProvider.getVersionId() !== model.getVersionId()) {
			// Old _ranges not updated yet
			return;
		}
		this._widgetState = this.getScrollWidgetState();
		this._stickyScrollWidget.setState(this._widgetState);
	}

	public getScrollWidgetState(): StickyScrollWidgetState {
		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
		const maxNumberStickyLines = this._editor.getOption(EditorOption.stickyScroll).maxLineCount;
		const scrollTop: number = this._editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const lineNumbers: number[] = [];
		const arrayVisibleRanges = this._editor.getVisibleRanges();
		if (arrayVisibleRanges.length !== 0) {
			const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
			const candidateRanges = this._stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
			for (const range of candidateRanges) {
				const start = range.startLineNumber;
				const end = range.endLineNumber;
				const depth = range.nestingDepth;
				if (end - start > 0) {
					const topOfElementAtDepth = (depth - 1) * lineHeight;
					const bottomOfElementAtDepth = depth * lineHeight;

					const bottomOfBeginningLine = this._editor.getBottomForLineNumber(start) - scrollTop;
					const topOfEndLine = this._editor.getTopForLineNumber(end) - scrollTop;
					const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;

					if (topOfElementAtDepth > topOfEndLine && topOfElementAtDepth <= bottomOfEndLine) {
						lineNumbers.push(start);
						lastLineRelativePosition = bottomOfEndLine - bottomOfElementAtDepth;
						break;
					}
					else if (bottomOfElementAtDepth > bottomOfBeginningLine && bottomOfElementAtDepth <= bottomOfEndLine) {
						lineNumbers.push(start);
					}
					if (lineNumbers.length === maxNumberStickyLines) {
						break;
					}
				}
			}
		}
		return new StickyScrollWidgetState(lineNumbers, lastLineRelativePosition);
	}

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}
