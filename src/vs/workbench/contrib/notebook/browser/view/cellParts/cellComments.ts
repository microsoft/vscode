/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from 'vs/base/common/arrays';
import { DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { EDITOR_FONT_DEFAULTS, IEditorOptions } from 'vs/editor/common/config/editorOptions';
import * as languages from 'vs/editor/common/languages';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICommentService } from 'vs/workbench/contrib/comments/browser/commentService';
import { CommentThreadWidget } from 'vs/workbench/contrib/comments/browser/commentThreadWidget';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellContentPart } from 'vs/workbench/contrib/notebook/browser/view/cellPart';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ICellRange } from 'vs/workbench/contrib/notebook/common/notebookRange';

export class CellComments extends CellContentPart {
	private readonly _commentThreadWidget: MutableDisposable<CommentThreadWidget<ICellRange>>;
	private currentElement: CodeCellViewModel | undefined;
	private readonly _commentThreadDisposables = this._register(new DisposableStore());

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

		this._register(this._commentThreadWidget = new MutableDisposable<CommentThreadWidget<ICellRange>>());

		this._register(this.themeService.onDidColorThemeChange(this._applyTheme, this));
		// TODO @rebornix onDidChangeLayout (font change)
		// this._register(this.notebookEditor.onDidchangeLa)
		this._applyTheme();
	}

	private async initialize(element: ICellViewModel) {
		if (this.currentElement === element) {
			return;
		}

		this.currentElement = element as CodeCellViewModel;
		await this._updateThread();
	}

	private async _createCommentTheadWidget(owner: string, commentThread: languages.CommentThread<ICellRange>) {
		this._commentThreadDisposables.clear();
		this._commentThreadWidget.value = this.instantiationService.createInstance(
			CommentThreadWidget,
			this.container,
			this.notebookEditor,
			owner,
			this.notebookEditor.textModel!.uri,
			this.contextKeyService,
			this.instantiationService,
			commentThread,
			undefined,
			undefined,
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

		await this._commentThreadWidget.value.display(layoutInfo.fontInfo.lineHeight, true);
		this._applyTheme();

		this._commentThreadDisposables.add(this._commentThreadWidget.value.onDidResize(() => {
			if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget.value) {
				this.currentElement.commentHeight = this._calculateCommentThreadHeight(this._commentThreadWidget.value.getDimensions().height);
			}
		}));
	}

	private _bindListeners() {
		this.cellDisposables.add(this.commentService.onDidUpdateCommentThreads(async () => this._updateThread()));
	}

	private async _updateThread() {
		if (!this.currentElement) {
			return;
		}
		const info = await this._getCommentThreadForCell(this.currentElement);
		if (!this._commentThreadWidget.value && info) {
			await this._createCommentTheadWidget(info.owner, info.thread);
			const layoutInfo = (this.currentElement as CodeCellViewModel).layoutInfo;
			this.container.style.top = `${layoutInfo.outputContainerOffset + layoutInfo.outputTotalHeight}px`;
			this.currentElement.commentHeight = this._calculateCommentThreadHeight(this._commentThreadWidget.value!.getDimensions().height);
			return;
		}

		if (this._commentThreadWidget.value) {
			if (!info) {
				this._commentThreadDisposables.clear();
				this._commentThreadWidget.value = undefined;
				this.currentElement.commentHeight = 0;
				return;
			}
			if (this._commentThreadWidget.value.commentThread === info.thread) {
				this.currentElement.commentHeight = this._calculateCommentThreadHeight(this._commentThreadWidget.value.getDimensions().height);
				return;
			}

			await this._commentThreadWidget.value.updateCommentThread(info.thread);
			this.currentElement.commentHeight = this._calculateCommentThreadHeight(this._commentThreadWidget.value.getDimensions().height);
		}
	}

	private _calculateCommentThreadHeight(bodyHeight: number) {
		const layoutInfo = this.notebookEditor.getLayoutInfo();

		const headHeight = Math.ceil(layoutInfo.fontInfo.lineHeight * 1.2);
		const lineHeight = layoutInfo.fontInfo.lineHeight;
		const arrowHeight = Math.round(lineHeight / 3);
		const frameThickness = Math.round(lineHeight / 9) * 2;

		const computedHeight = headHeight + bodyHeight + arrowHeight + frameThickness + 8 /** margin bottom to avoid margin collapse */;
		return computedHeight;

	}

	private async _getCommentThreadForCell(element: ICellViewModel): Promise<{ thread: languages.CommentThread<ICellRange>; owner: string } | null> {
		if (this.notebookEditor.hasModel()) {
			const commentInfos = coalesce(await this.commentService.getNotebookComments(element.uri));
			if (commentInfos.length && commentInfos[0].threads.length) {
				return { owner: commentInfos[0].uniqueOwner, thread: commentInfos[0].threads[0] };
			}
		}

		return null;
	}

	private _applyTheme() {
		const theme = this.themeService.getColorTheme();
		const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
		this._commentThreadWidget.value?.applyTheme(theme, fontInfo);
	}

	override didRenderCell(element: ICellViewModel): void {
		if (element.cellKind === CellKind.Code) {
			this.initialize(element);
			this._bindListeners();
		}

	}

	override prepareLayout(): void {
		if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget.value) {
			this.currentElement.commentHeight = this._calculateCommentThreadHeight(this._commentThreadWidget.value.getDimensions().height);
		}
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		if (this.currentElement?.cellKind === CellKind.Code && this._commentThreadWidget.value) {
			const layoutInfo = (element as CodeCellViewModel).layoutInfo;
			this.container.style.top = `${layoutInfo.outputContainerOffset + layoutInfo.outputTotalHeight}px`;
		}
	}
}

