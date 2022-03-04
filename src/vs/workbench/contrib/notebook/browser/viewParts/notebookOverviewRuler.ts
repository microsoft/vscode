/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';
import { createFastDomNode, FastDomNode } from 'vs/base/browser/fastDomNode';
import { IThemeService, Themable } from 'vs/platform/theme/common/themeService';
import { INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export class NotebookOverviewRuler extends Themable {
	private readonly _domNode: FastDomNode<HTMLCanvasElement>;
	private _lanes = 3;

	constructor(readonly notebookEditor: INotebookEditorDelegate, container: HTMLElement, @IThemeService themeService: IThemeService) {
		super(themeService);

		container.style.position = 'absolute';
		container.style.zIndex = '10';
		container.style.right = '0px';

		this._domNode = createFastDomNode(document.createElement('canvas'));
		this._domNode.setPosition('relative');
		this._domNode.setLayerHinting(true);
		this._domNode.setContain('strict');

		container.appendChild(this._domNode.domNode);

		this._register(notebookEditor.onDidChangeDecorations(() => {
			this.layout();
		}));

		this._register(browser.PixelRatio.onDidChange(() => {
			this.layout();
		}));
	}

	layout() {
		const width = 10;
		const layoutInfo = this.notebookEditor.getLayoutInfo();
		const scrollHeight = layoutInfo.scrollHeight;
		const height = layoutInfo.height;
		const ratio = browser.PixelRatio.value;
		this._domNode.setWidth(width);
		this._domNode.setHeight(height);
		this._domNode.domNode.width = width * ratio;
		this._domNode.domNode.height = height * ratio;
		const ctx = this._domNode.domNode.getContext('2d')!;
		ctx.clearRect(0, 0, width * ratio, height * ratio);
		this._render(ctx, width * ratio, height * ratio, scrollHeight * ratio, ratio);
	}

	private _render(ctx: CanvasRenderingContext2D, width: number, height: number, scrollHeight: number, ratio: number) {
		const viewModel = this.notebookEditor._getViewModel();
		const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
		const laneWidth = width / this._lanes;

		let currentFrom = 0;

		if (viewModel) {
			for (let i = 0; i < viewModel.viewCells.length; i++) {
				const viewCell = viewModel.viewCells[i];
				const decorations = viewCell.getCellDecorations();
				const cellHeight = (viewCell.layoutInfo.totalHeight / scrollHeight) * ratio * height;

				const decoration = decorations.find(decoration => decoration.overviewRuler);
				if (decoration && decoration.overviewRuler) {
					const overviewRuler = decoration.overviewRuler;

					if (overviewRuler.includeModel) {
						ctx.fillStyle = this.getColor(overviewRuler.color)?.toString() || '#000000';
						const decorationHeight = (fontInfo.lineHeight / scrollHeight) * ratio * height;
						ctx.fillRect(laneWidth, currentFrom, laneWidth, decorationHeight);
					}

					if (overviewRuler.includeOutput) {
						ctx.fillStyle = this.getColor(overviewRuler.color)?.toString() || '#000000';
						const outputOffset = (viewCell.layoutInfo.editorHeight / scrollHeight) * ratio * height;
						const decorationHeight = (fontInfo.lineHeight / scrollHeight) * ratio * height;
						ctx.fillRect(laneWidth, currentFrom + outputOffset, laneWidth, decorationHeight);
					}
				}

				currentFrom += cellHeight;
			}
		}
	}
}
