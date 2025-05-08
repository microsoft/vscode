/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../base/browser/dom.js';
import { createFastDomNode, FastDomNode } from '../../../../../base/browser/fastDomNode.js';
import { PixelRatio } from '../../../../../base/browser/pixelRatio.js';
import { IThemeService, Themable } from '../../../../../platform/theme/common/themeService.js';
import { INotebookEditorDelegate, NotebookOverviewRulerLane } from '../notebookBrowser.js';

export class NotebookOverviewRuler extends Themable {
	private readonly _domNode: FastDomNode<HTMLCanvasElement>;
	private _lanes = 3;

	constructor(readonly notebookEditor: INotebookEditorDelegate, container: HTMLElement, @IThemeService themeService: IThemeService) {
		super(themeService);
		this._domNode = createFastDomNode(document.createElement('canvas'));
		this._domNode.setPosition('relative');
		this._domNode.setLayerHinting(true);
		this._domNode.setContain('strict');

		container.appendChild(this._domNode.domNode);

		this._register(notebookEditor.onDidChangeDecorations(() => {
			this.layout();
		}));

		this._register(PixelRatio.getInstance(getWindow(this._domNode.domNode)).onDidChange(() => {
			this.layout();
		}));
	}

	layout() {
		const width = 10;
		const layoutInfo = this.notebookEditor.getLayoutInfo();
		const scrollHeight = layoutInfo.scrollHeight;
		const height = layoutInfo.height;
		const ratio = PixelRatio.getInstance(getWindow(this._domNode.domNode)).value;
		this._domNode.setWidth(width);
		this._domNode.setHeight(height);
		this._domNode.domNode.width = width * ratio;
		this._domNode.domNode.height = height * ratio;
		const ctx = this._domNode.domNode.getContext('2d')!;
		ctx.clearRect(0, 0, width * ratio, height * ratio);
		this._render(ctx, width * ratio, height * ratio, scrollHeight * ratio, ratio);
	}

	private _render(ctx: CanvasRenderingContext2D, width: number, height: number, scrollHeight: number, ratio: number) {
		const viewModel = this.notebookEditor.getViewModel();
		const fontInfo = this.notebookEditor.getLayoutInfo().fontInfo;
		const laneWidth = width / this._lanes;

		let currentFrom = 0;

		if (viewModel) {
			for (let i = 0; i < viewModel.viewCells.length; i++) {
				const viewCell = viewModel.viewCells[i];
				const textBuffer = viewCell.textBuffer;
				const decorations = viewCell.getCellDecorations();
				const cellHeight = (viewCell.layoutInfo.totalHeight / scrollHeight) * ratio * height;

				decorations.filter(decoration => decoration.overviewRuler).forEach(decoration => {
					const overviewRuler = decoration.overviewRuler!;
					const fillStyle = this.getColor(overviewRuler.color) ?? '#000000';
					const lineHeight = Math.min(fontInfo.lineHeight, (viewCell.layoutInfo.editorHeight / scrollHeight / textBuffer.getLineCount()) * ratio * height);
					const lineNumbers = overviewRuler.modelRanges.map(range => range.startLineNumber).reduce((previous: number[], current: number) => {
						if (previous.length === 0) {
							previous.push(current);
						} else {
							const last = previous[previous.length - 1];
							if (last !== current) {
								previous.push(current);
							}
						}

						return previous;
					}, [] as number[]);

					let x = 0;
					switch (overviewRuler.position) {
						case NotebookOverviewRulerLane.Left:
							x = 0;
							break;
						case NotebookOverviewRulerLane.Center:
							x = laneWidth;
							break;
						case NotebookOverviewRulerLane.Right:
							x = laneWidth * 2;
							break;
						default:
							break;
					}

					const width = overviewRuler.position === NotebookOverviewRulerLane.Full ? laneWidth * 3 : laneWidth;

					for (let i = 0; i < lineNumbers.length; i++) {
						ctx.fillStyle = fillStyle;
						const lineNumber = lineNumbers[i];
						const offset = (lineNumber - 1) * lineHeight;
						ctx.fillRect(x, currentFrom + offset, width, lineHeight);
					}

					if (overviewRuler.includeOutput) {
						ctx.fillStyle = fillStyle;
						const outputOffset = (viewCell.layoutInfo.editorHeight / scrollHeight) * ratio * height;
						const decorationHeight = (fontInfo.lineHeight / scrollHeight) * ratio * height;
						ctx.fillRect(laneWidth, currentFrom + outputOffset, laneWidth, decorationHeight);
					}
				});

				currentFrom += cellHeight;
			}

			const overviewRulerDecorations = viewModel.getOverviewRulerDecorations();

			for (let i = 0; i < overviewRulerDecorations.length; i++) {
				const decoration = overviewRulerDecorations[i];
				if (!decoration.options.overviewRuler) {
					continue;
				}
				const viewZoneInfo = this.notebookEditor.getViewZoneLayoutInfo(decoration.viewZoneId);

				if (!viewZoneInfo) {
					continue;
				}

				const fillStyle = this.getColor(decoration.options.overviewRuler.color) ?? '#000000';
				let x = 0;
				switch (decoration.options.overviewRuler.position) {
					case NotebookOverviewRulerLane.Left:
						x = 0;
						break;
					case NotebookOverviewRulerLane.Center:
						x = laneWidth;
						break;
					case NotebookOverviewRulerLane.Right:
						x = laneWidth * 2;
						break;
					default:
						break;
				}

				const width = decoration.options.overviewRuler.position === NotebookOverviewRulerLane.Full ? laneWidth * 3 : laneWidth;

				ctx.fillStyle = fillStyle;

				const viewZoneHeight = (viewZoneInfo.height / scrollHeight) * ratio * height;
				const viewZoneTop = (viewZoneInfo.top / scrollHeight) * ratio * height;

				ctx.fillRect(x, viewZoneTop, width, viewZoneHeight);
			}
		}
	}
}
