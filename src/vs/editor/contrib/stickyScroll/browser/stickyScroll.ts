/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption, RenderLineNumbersType } from 'vs/editor/common/config/editorOptions';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';
import { StickyLineCandidateProvider, StickyRange } from './stickyScrollProvider';
import { IModelTokensChangedEvent } from 'vs/editor/common/textModelEvents';

class StickyScrollController extends Disposable implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly editor: ICodeEditor;
	private readonly stickyScrollWidget: StickyScrollWidget;
	private readonly stickyLineCandidateProvider: StickyLineCandidateProvider;
	private readonly sessionStore: DisposableStore = new DisposableStore();

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this.editor = editor;
		this.stickyScrollWidget = new StickyScrollWidget(this.editor);
		this.stickyLineCandidateProvider = new StickyLineCandidateProvider(this.editor, _languageFeaturesService);

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
			this.editor.removeOverlayWidget(this.stickyScrollWidget);
			this.sessionStore.clear();
			return;
		} else {
			this.editor.addOverlayWidget(this.stickyScrollWidget);
			this.sessionStore.add(this.editor.onDidScrollChange(() => this.renderStickyScroll()));
			this.sessionStore.add(this.editor.onDidLayoutChange(() => this.onDidResize()));
			this.sessionStore.add(this.editor.onDidChangeModelTokens((e) => this.onTokensChange(e)));
			this.sessionStore.add(this.stickyLineCandidateProvider.onStickyScrollChange(() => this.renderStickyScroll()));
			const lineNumberOption = this.editor.getOption(EditorOption.lineNumbers);
			if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
				this.sessionStore.add(this.editor.onDidChangeCursorPosition(() => this.renderStickyScroll()));
			}
		}
	}

	private needsUpdate(event: IModelTokensChangedEvent) {
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

	private onTokensChange(event: IModelTokensChangedEvent) {
		if (this.needsUpdate(event)) {
			this.renderStickyScroll();
		}
	}

	private onDidResize() {
		const width = this.editor.getLayoutInfo().width - this.editor.getLayoutInfo().minimap.minimapCanvasOuterWidth - this.editor.getLayoutInfo().verticalScrollbarWidth;
		this.stickyScrollWidget.getDomNode().style.width = `${width}px`;
	}

	private renderStickyScroll() {
		if (!(this.editor.hasModel())) {
			return;
		}
		const model = this.editor.getModel();
		if (this.stickyLineCandidateProvider.getVersionId() !== model.getVersionId()) {
			// Old _ranges not updated yet
			return;
		}
		this.stickyScrollWidget.setState(this.getScrollWidgetState());
	}

	private getScrollWidgetState(): StickyScrollWidgetState {
		const lineHeight: number = this.editor.getOption(EditorOption.lineHeight);
		const maxNumberStickyLines = this.editor.getOption(EditorOption.experimental).stickyScroll.maxLineCount;
		const scrollTop: number = this.editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const lineNumbers: number[] = [];
		const arrayVisibleRanges = this.editor.getVisibleRanges();
		if (arrayVisibleRanges.length !== 0) {
			const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
			const candidateRanges = this.stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
			for (const range of candidateRanges) {
				const start = range.startLineNumber;
				const end = range.endLineNumber;
				const depth = range.nestingDepth;
				if (end - start > 0) {
					const topOfElementAtDepth = (depth - 1) * lineHeight;
					const bottomOfElementAtDepth = depth * lineHeight;

					const bottomOfBeginningLine = this.editor.getBottomForLineNumber(start) - scrollTop;
					const topOfEndLine = this.editor.getTopForLineNumber(end) - scrollTop;
					const bottomOfEndLine = this.editor.getBottomForLineNumber(end) - scrollTop;

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
		this.sessionStore.dispose();
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

