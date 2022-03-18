/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import * as languages from 'vs/editor/common/languages';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CommentThreadWidget } from 'vs/workbench/contrib/comments/browser/commentThreadWidget';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { coalesce } from 'vs/base/common/arrays';
import { peekViewBorder, peekViewResultsBackground } from 'vs/editor/contrib/peekView/browser/peekView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';

export class CellComments extends CellPart {
	private _initialized: boolean = false;
	private _commentThreadWidget: CommentThreadWidget<ICellRange> | null = null;
	private currentElement: CodeCellViewModel | undefined;
	private readonly commentTheadDisposables = this._register(new DisposableStore());

	constructor(
		private readonly notebookEditor: INotebookEditorDelegate,
		private readonly container: HTMLElement,

		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommentService private readonly commentService: ICommentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.container.classList.add('review-widget');

		this._register(this.themeService.onDidColorThemeChange(this._applyTheme, this));
		// TODO @rebornix onDidChangeLayout (font change)
		// this._register(this.notebookEditor.onDidchangeLa)
		this._applyTheme();
	}

	private async initialize(element: ICellViewModel) {
		if (this._initialized) {
			return;
		}

		this._initialized = true;
		const info = await this._getCommentThreadForCell(element);

		if (info) {
			this._createCommentTheadWidget(info.owner, info.thread);
		}
	}

	private _createCommentTheadWidget(owner: string, commentThread: languages.CommentThread<ICellRange>) {
		this._commentThreadWidget?.dispose();
		this.commentTheadDisposables.clear();
		this._commentThreadWidget = this.instantiationService.createInstance(
			CommentThreadWidget,
			this.container,
			owner,
			this.notebookEditor.textModel!.uri,
			this.contextKeyService,
			this.instantiationService,
			commentThread,
			null,
			{
				codeBlockFontFamily: this.configurationService.getValue<IEditorOptions>('editor').fontFamily || EDITOR_FONT_DEFAULTS.fontFamily
			},
			undefined,
			{
				actionRunner: () => {
				},
				collapse: () => { }
			}
		) as unknown as CommentThreadWidget<ICellRange>;

		const layoutInfo = this.notebookEditor.getLayoutInfo();

		this._commentThreadWidget.display(layoutInfo.fontInfo.lineHeight);
		this._applyTheme();

		this.commentTheadDisposables.add(this._commentThreadWidget.onDidResize(() => {
			if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget) {
				this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget.container).height;
			}
		}));
	}

	private _bindListeners() {
		this.cellDisposables.add(this.commentService.onDidUpdateCommentThreads(async () => {
			if (this.currentElement) {
				const info = await this._getCommentThreadForCell(this.currentElement);
				if (!this._commentThreadWidget && info) {
					this._createCommentTheadWidget(info.owner, info.thread);
					const layoutInfo = (this.currentElement as CodeCellViewModel).layoutInfo;
					this.container.style.top = `${layoutInfo.outputContainerOffset + layoutInfo.outputTotalHeight}px`;

					this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget!.container).height;

					return;
				}

				if (this._commentThreadWidget) {
					if (info) {
						this._commentThreadWidget.updateCommentThread(info.thread);
						this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget.container).height;
					} else {
						this._commentThreadWidget.dispose();
						this.currentElement.commentHeight = 0;
					}
				}
			}
		}));
	}

	private async _getCommentThreadForCell(element: ICellViewModel): Promise<{ thread: languages.CommentThread<ICellRange>; owner: string } | null> {
		if (this.notebookEditor.hasModel()) {
			const commentInfos = coalesce(await this.commentService.getNotebookComments(element.uri));
			if (commentInfos.length && commentInfos[0].threads.length) {
				return { owner: commentInfos[0].owner, thread: commentInfos[0].threads[0] };
			}
		}

		return null;
	}

	private _applyTheme() {
		const theme = this.themeService.getColorTheme();
		const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
		this._commentThreadWidget?.applyTheme(theme, fontInfo);
	}

	protected override didRenderCell(element: ICellViewModel): void {
		if (element.cellKind === CellKind.Code) {
			this.currentElement = element as CodeCellViewModel;
			this.initialize(element);
			this._bindListeners();
		}

	}

	override prepareLayout(): void {
		if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget) {
			this.currentElement.commentHeight = dom.getClientArea(this._commentThreadWidget.container).height;
		}
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget) {
			const layoutInfo = (element as CodeCellViewModel).layoutInfo;
			this.container.style.top = `${layoutInfo.outputContainerOffset + layoutInfo.outputTotalHeight}px`;
		}
	}
}

registerThemingParticipant((theme, collector) => {
	const borderColor = theme.getColor(peekViewBorder);

	if (borderColor) {
		collector.addRule(`.cell-comment-container.review-widget { border-left: 1px solid ${borderColor}; border-right: 1px solid ${borderColor}; }`);
		collector.addRule(`.cell-comment-container.review-widget > .head { border-top: 1px solid ${borderColor}; }`);
		collector.addRule(`.cell-comment-container.review-widget > .body { border-bottom: 1px solid ${borderColor}; }`);
	}

	const peekViewBackground = theme.getColor(peekViewResultsBackground);
	if (peekViewBackground) {
		collector.addRule(
			`.cell-comment-container.review-widget {` +
			`	background-color: ${peekViewBackground};` +
			`}`);
	}
});
