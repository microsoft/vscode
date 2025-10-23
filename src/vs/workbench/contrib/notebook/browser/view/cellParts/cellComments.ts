/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce } from '../../../../../../base/common/arrays.js';
import { DisposableMap, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import * as languages from '../../../../../../editor/common/languages.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { ICommentService, INotebookCommentInfo } from '../../../../comments/browser/commentService.js';
import { CommentThreadWidget } from '../../../../comments/browser/commentThreadWidget.js';
import { ICellViewModel, INotebookEditorDelegate } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';
import { ICellRange } from '../../../common/notebookRange.js';

export class CellComments extends CellContentPart {
	// keyed by threadId
	private readonly _commentThreadWidgets: DisposableMap<string, { widget: CommentThreadWidget<ICellRange>; dispose: () => void }>;
	private currentElement: ICellViewModel | undefined;

	constructor(
		private readonly notebookEditor: INotebookEditorDelegate,
		private readonly container: HTMLElement,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService private readonly themeService: IThemeService,
		@ICommentService private readonly commentService: ICommentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
		this.container.classList.add('review-widget');

		this._register(this._commentThreadWidgets = new DisposableMap<string, { widget: CommentThreadWidget<ICellRange>; dispose: () => void }>());

		this._register(this.themeService.onDidColorThemeChange(this._applyTheme, this));
		// TODO @rebornix onDidChangeLayout (font change)
		// this._register(this.notebookEditor.onDidchangeLa)
		this._applyTheme();
	}

	private async initialize(element: ICellViewModel) {
		if (this.currentElement === element) {
			return;
		}

		this.currentElement = element;
		await this._updateThread();
	}

	private async _createCommentTheadWidget(owner: string, commentThread: languages.CommentThread<ICellRange>) {
		const widgetDisposables = new DisposableStore();
		const widget = this.instantiationService.createInstance(
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
			{},
			undefined,
			{
				actionRunner: () => {
				},
				collapse: async () => { return true; }
			}
		) as unknown as CommentThreadWidget<ICellRange>;
		widgetDisposables.add(widget);
		this._commentThreadWidgets.set(commentThread.threadId, { widget, dispose: () => widgetDisposables.dispose() });

		const layoutInfo = this.notebookEditor.getLayoutInfo();

		await widget.display(layoutInfo.fontInfo.lineHeight, true);
		this._applyTheme();

		widgetDisposables.add(widget.onDidResize(() => {
			if (this.currentElement) {
				this.currentElement.commentHeight = this._calculateCommentThreadHeight(widget.getDimensions().height);
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
		const infos = await this._getCommentThreadsForCell(this.currentElement);
		const widgetsToDelete = new Set(this._commentThreadWidgets.keys());
		const layoutInfo = this.currentElement.layoutInfo;
		this.container.style.top = `${layoutInfo.commentOffset}px`;
		for (const info of infos) {
			if (!info) { continue; }
			for (const thread of info.threads) {
				widgetsToDelete.delete(thread.threadId);
				const widget = this._commentThreadWidgets.get(thread.threadId)?.widget;
				if (widget) {
					await widget.updateCommentThread(thread);
				} else {
					await this._createCommentTheadWidget(info.uniqueOwner, thread);
				}
			}
		}
		for (const threadId of widgetsToDelete) {
			this._commentThreadWidgets.deleteAndDispose(threadId);
		}
		this._updateHeight();

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

	private _updateHeight() {
		if (!this.currentElement) {
			return;
		}
		let height = 0;
		for (const { widget } of this._commentThreadWidgets.values()) {
			height += this._calculateCommentThreadHeight(widget.getDimensions().height);
		}
		this.currentElement.commentHeight = height;
	}

	private async _getCommentThreadsForCell(element: ICellViewModel): Promise<(INotebookCommentInfo | null)[]> {
		if (this.notebookEditor.hasModel()) {
			return coalesce(await this.commentService.getNotebookComments(element.uri));
		}

		return [];
	}

	private _applyTheme() {
		const theme = this.themeService.getColorTheme();
		const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
		for (const { widget } of this._commentThreadWidgets.values()) {
			widget.applyTheme(theme, fontInfo);
		}
	}

	override didRenderCell(element: ICellViewModel): void {
		this.initialize(element);
		this._bindListeners();
	}

	override prepareLayout(): void {
		this._updateHeight();
	}

	override updateInternalLayoutNow(element: ICellViewModel): void {
		if (this.currentElement) {
			this.container.style.top = `${element.layoutInfo.commentOffset}px`;
		}
	}
}

