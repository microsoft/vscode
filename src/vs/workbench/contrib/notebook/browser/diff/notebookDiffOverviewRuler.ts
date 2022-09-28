/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import * as DOM from 'vs/base/browser/dom';
import { createFastDomNode, FastDomNode } from 'vs/base/browser/fastDomNode';
import { Color } from 'vs/base/common/color';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { defaultInsertColor, defaultRemoveColor, diffInserted, diffOverviewRulerInserted, diffOverviewRulerRemoved, diffRemoved, scrollbarSliderActiveBackground, scrollbarSliderBackground, scrollbarSliderHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { IColorTheme, IThemeService, registerThemingParticipant, Themable } from 'vs/platform/theme/common/themeService';
import { DiffElementViewModelBase } from 'vs/workbench/contrib/notebook/browser/diff/diffElementViewModel';
import { NotebookDiffEditorEventDispatcher } from 'vs/workbench/contrib/notebook/browser/diff/eventDispatcher';
import { INotebookTextDiffEditor } from 'vs/workbench/contrib/notebook/browser/diff/notebookDiffEditorBrowser';

export class NotebookDiffOverviewRuler extends Themable {
	private readonly _domNode: FastDomNode<HTMLCanvasElement>;
	private readonly _overviewViewportDomElement: FastDomNode<HTMLElement>;

	private _diffElementViewModels: DiffElementViewModelBase[] = [];
	private _lanes = 2;

	private _insertColor: Color | null;
	private _insertColorHex: string | null;
	private _removeColor: Color | null;
	private _removeColorHex: string | null;

	private _disposables: DisposableStore;
	private _renderAnimationFrame: IDisposable | null;

	constructor(readonly notebookEditor: INotebookTextDiffEditor, readonly width: number, container: HTMLElement, @IThemeService themeService: IThemeService) {
		super(themeService);
		this._insertColor = null;
		this._removeColor = null;
		this._insertColorHex = null;
		this._removeColorHex = null;
		this._disposables = this._register(new DisposableStore());
		this._renderAnimationFrame = null;
		this._domNode = createFastDomNode(document.createElement('canvas'));
		this._domNode.setPosition('relative');
		this._domNode.setLayerHinting(true);
		this._domNode.setContain('strict');

		container.appendChild(this._domNode.domNode);

		this._overviewViewportDomElement = createFastDomNode(document.createElement('div'));
		this._overviewViewportDomElement.setClassName('diffViewport');
		this._overviewViewportDomElement.setPosition('absolute');
		this._overviewViewportDomElement.setWidth(width);
		container.appendChild(this._overviewViewportDomElement.domNode);

		this._register(browser.PixelRatio.onDidChange(() => {
			this._scheduleRender();
		}));

		this._register(this.themeService.onDidColorThemeChange(e => {
			const colorChanged = this.applyColors(e);
			if (colorChanged) {
				this._scheduleRender();
			}
		}));
		this.applyColors(this.themeService.getColorTheme());

		this._register(this.notebookEditor.onDidScroll(() => {
			this._renderOverviewViewport();
		}));

		this._register(DOM.addStandardDisposableListener(container, DOM.EventType.POINTER_DOWN, (e) => {
			this.notebookEditor.delegateVerticalScrollbarPointerDown(e);
		}));
	}

	private applyColors(theme: IColorTheme): boolean {
		const newInsertColor = theme.getColor(diffOverviewRulerInserted) || (theme.getColor(diffInserted) || defaultInsertColor).transparent(2);
		const newRemoveColor = theme.getColor(diffOverviewRulerRemoved) || (theme.getColor(diffRemoved) || defaultRemoveColor).transparent(2);
		const hasChanges = !newInsertColor.equals(this._insertColor) || !newRemoveColor.equals(this._removeColor);
		this._insertColor = newInsertColor;
		this._removeColor = newRemoveColor;
		if (this._insertColor) {
			this._insertColorHex = Color.Format.CSS.formatHexA(this._insertColor);
		}

		if (this._removeColor) {
			this._removeColorHex = Color.Format.CSS.formatHexA(this._removeColor);
		}

		return hasChanges;
	}

	layout() {
		this._layoutNow();
	}

	updateViewModels(elements: DiffElementViewModelBase[], eventDispatcher: NotebookDiffEditorEventDispatcher | undefined) {
		this._disposables.clear();

		this._diffElementViewModels = elements;

		if (eventDispatcher) {
			this._disposables.add(eventDispatcher.onDidChangeLayout(() => {
				this._scheduleRender();
			}));

			this._disposables.add(eventDispatcher.onDidChangeCellLayout(() => {
				this._scheduleRender();
			}));
		}

		this._scheduleRender();
	}

	private _scheduleRender(): void {
		if (this._renderAnimationFrame === null) {
			this._renderAnimationFrame = DOM.runAtThisOrScheduleAtNextAnimationFrame(this._onRenderScheduled.bind(this), 100);
		}
	}

	private _onRenderScheduled(): void {
		this._renderAnimationFrame = null;
		this._layoutNow();
	}

	private _layoutNow() {
		const layoutInfo = this.notebookEditor.getLayoutInfo();
		const height = layoutInfo.height;
		const scrollHeight = layoutInfo.scrollHeight;
		const ratio = browser.PixelRatio.value;
		this._domNode.setWidth(this.width);
		this._domNode.setHeight(height);
		this._domNode.domNode.width = this.width * ratio;
		this._domNode.domNode.height = height * ratio;
		const ctx = this._domNode.domNode.getContext('2d')!;
		ctx.clearRect(0, 0, this.width * ratio, height * ratio);
		this._renderCanvas(ctx, this.width * ratio, height * ratio, scrollHeight * ratio, ratio);
		this._renderOverviewViewport();
	}

	private _renderOverviewViewport(): void {
		const layout = this._computeOverviewViewport();
		if (!layout) {
			this._overviewViewportDomElement.setTop(0);
			this._overviewViewportDomElement.setHeight(0);
		} else {
			this._overviewViewportDomElement.setTop(layout.top);
			this._overviewViewportDomElement.setHeight(layout.height);
		}
	}

	private _computeOverviewViewport(): { height: number; top: number } | null {
		const layoutInfo = this.notebookEditor.getLayoutInfo();
		if (!layoutInfo) {
			return null;
		}

		const scrollTop = this.notebookEditor.getScrollTop();
		const scrollHeight = this.notebookEditor.getScrollHeight();

		const computedAvailableSize = Math.max(0, layoutInfo.height);
		const computedRepresentableSize = Math.max(0, computedAvailableSize - 2 * 0);
		const computedRatio = scrollHeight > 0 ? (computedRepresentableSize / scrollHeight) : 0;

		const computedSliderSize = Math.max(0, Math.floor(layoutInfo.height * computedRatio));
		const computedSliderPosition = Math.floor(scrollTop * computedRatio);

		return {
			height: computedSliderSize,
			top: computedSliderPosition
		};
	}

	private _renderCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, scrollHeight: number, ratio: number) {
		if (!this._insertColorHex || !this._removeColorHex) {
			// no op when colors are not yet known
			return;
		}

		const laneWidth = width / this._lanes;
		let currentFrom = 0;
		for (let i = 0; i < this._diffElementViewModels.length; i++) {
			const element = this._diffElementViewModels[i];

			const cellHeight = (element.layoutInfo.totalHeight / scrollHeight) * ratio * height;

			switch (element.type) {
				case 'insert':
					ctx.fillStyle = this._insertColorHex;
					ctx.fillRect(laneWidth, currentFrom, laneWidth, cellHeight);
					break;
				case 'delete':
					ctx.fillStyle = this._removeColorHex;
					ctx.fillRect(0, currentFrom, laneWidth, cellHeight);
					break;
				case 'unchanged':
					break;
				case 'modified':
					ctx.fillStyle = this._removeColorHex;
					ctx.fillRect(0, currentFrom, laneWidth, cellHeight);
					ctx.fillStyle = this._insertColorHex;
					ctx.fillRect(laneWidth, currentFrom, laneWidth, cellHeight);
					break;
			}

			currentFrom += cellHeight;
		}
	}

	override dispose() {
		if (this._renderAnimationFrame !== null) {
			this._renderAnimationFrame.dispose();
			this._renderAnimationFrame = null;
		}

		super.dispose();
	}
}

registerThemingParticipant((theme, collector) => {
	const scrollbarSliderBackgroundColor = theme.getColor(scrollbarSliderBackground);
	if (scrollbarSliderBackgroundColor) {
		collector.addRule(`
			.notebook-text-diff-editor .diffViewport {
				background: ${scrollbarSliderBackgroundColor};
			}
		`);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(scrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(`
			.notebook-text-diff-editor .diffViewport:hover {
				background: ${scrollbarSliderHoverBackgroundColor};
			}
		`);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(scrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(`
			.notebook-text-diff-editor .diffViewport:active {
				background: ${scrollbarSliderActiveBackgroundColor};
			}
		`);
	}
});
