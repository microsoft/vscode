/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { StickyScrollWidget, StickyScrollWidgetState } from './stickyScrollWidget';
import { StickyLineCandidateProvider } from './stickyScrollProvider';

class StickyScrollController extends Disposable implements IEditorContribution {

	static readonly ID = 'store.contrib.stickyScrollController';
	private readonly _editor: ICodeEditor;
	private readonly stickyScrollWidget: StickyScrollWidget;
	private readonly _stickyLineCandidateProvider: StickyLineCandidateProvider;
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		this._editor = editor;
		this.stickyScrollWidget = new StickyScrollWidget(this._editor);
		this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, this.stickyScrollWidget, _languageFeaturesService);

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
			this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
			this._sessionStore.add(this._stickyLineCandidateProvider.onStickyScrollChange(() => this._renderStickyScroll()));
		}
	}

	private _onDidResize() {
		const width = this._editor.getLayoutInfo().width - this._editor.getLayoutInfo().minimap.minimapCanvasOuterWidth - this._editor.getLayoutInfo().verticalScrollbarWidth;
		this.stickyScrollWidget.getDomNode().style.width = `${width}px`;
	}

	private _renderStickyScroll() {

		if (!(this._editor.hasModel())) {
			return;
		}
		const model = this._editor.getModel();
		if (this._stickyLineCandidateProvider.getRangesVersionId() !== model.getVersionId()) {
			// Old _ranges not updated yet
			return;
		}
		this.stickyScrollWidget.emptyRootNode();
		this.stickyScrollWidget.setState(this._getScrollWidgetState());
		this.stickyScrollWidget.renderRootNode();
	}

	private _getScrollWidgetState(): StickyScrollWidgetState {
		const lineHeight: number = this._editor.getOption(EditorOption.lineHeight);
		const scrollTop: number = this._editor.getScrollTop();
		let lastLineRelativePosition: number = 0;
		const lineNumbers: number[] = [];
		const ranges = this._stickyLineCandidateProvider.getPotentialStickyRanges(this._editor.getVisibleRanges()[0].startLineNumber + this.stickyScrollWidget.codeLineCount - 1);
		for (const range of ranges) {
			const start = range.startLineNumber;
			const end = range.endLineNumber;
			const depth = range.nestingDepth;
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

	override dispose(): void {
		super.dispose();
		this._sessionStore.dispose();
	}
}

registerEditorContribution(StickyScrollController.ID, StickyScrollController);

