/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./historyTree';
import * as nls from 'vs/nls';
import { IEditorContribution, IModel, IHistoryElement } from 'vs/editor/common/editorCommon';
import { HistoryEvent } from 'vs/editor/common/model/textModelEvents';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { registerEditorAction, ServicesAccessor, EditorAction, EditorCommand, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { Widget } from 'vs/base/browser/ui/widget';
import * as dom from 'vs/base/browser/dom';
import { FastDomNode, createFastDomNode } from 'vs/base/browser/fastDomNode';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IThemeService } from 'vs/platform/theme/common/themeService';


class HistoryTreeAction extends EditorAction {
	constructor() {
		super({
			id: 'editor.action.historyTree',
			label: nls.localize('historyTree', "Navigate the history tree"),
			alias: 'History Tree',
			precondition: EditorContextKeys.writable,
			menuOpts: {
				group: '1_modification',
				order: 1.10
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		let controller = HistoryTreeController.get(editor);
		if (controller) {
			controller.show();
		}
	}

}

registerEditorAction(HistoryTreeAction);

export class HistoryTreeController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.historyTree';

	public static get(editor: ICodeEditor): HistoryTreeController {
		return editor.getContribution<HistoryTreeController>(HistoryTreeController.ID);
	}

	private _editor: ICodeEditor;
	private _widget: HistoryTreeWidget;

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IThemeService themeService: IThemeService
	) {
		super();

		this._editor = editor;
		this._widget = this._register(new HistoryTreeWidget(this._editor, contextKeyService, keybindingService, themeService));
	}

	public getId(): string {
		return HistoryTreeController.ID;
	}

	public show(): void {
		this._widget.show();
	}

	public hide(): void {
		this._widget.hide();
	}
}

registerEditorContribution(HistoryTreeController);

const CONTEXT_HISTORY_TREE_WIDGET_VISIBLE = new RawContextKey<boolean>('historyTreeWidgetVisible', false);

const ageScales: [string, number][] = [
	[nls.localize('historyTree.year', "yr"), 3600 * 24 * 365],
	[nls.localize('historyTree.month', "mon"), 3600 * 24 * 30],
	[nls.localize('historyTree.week', "wk"), 3600 * 24 * 7],
	[nls.localize('historyTree.day', "dy"), 3600 * 24],
	[nls.localize('historyTree.hour', "hr"), 3600],
	[nls.localize('historyTree.minute', "min"), 60]];


interface HistoryElementPosition {
	yindex: number;
	xindex: number;
	el: IHistoryElement;
}

interface YIndex {
	index: number;
	el: IHistoryElement;
}


class HistoryTreeWidget extends Widget implements IOverlayWidget {

	private static ID = 'editor.contrib.historyTreeWidget';
	private static WIDTH = 800;
	private static HEIGHT = 600;

	private _editor: ICodeEditor;
	private _model: IModel;
	private _showDisposables: IDisposable[] = [];
	private _domNode: FastDomNode<HTMLDivElement>;
	private _lineNode: FastDomNode<HTMLCanvasElement>;
	private _markNode: FastDomNode<HTMLCanvasElement>;
	private _isVisible: boolean;
	private _isVisibleKey: IContextKey<boolean>;
	private _backgroundColor: string;
	private _lineColor: string;
	private _textColor: string;
	private _font: string;
	private _selectedIndex: number;
	private _nowIndex: number;
	private _yindicies: YIndex[];
	private _sorted: IHistoryElement[];
	private _topElement: IHistoryElement;
	private _positions: HistoryElementPosition[];
	private _textPlacement: number[];
	private _offset = {
		x: 0,
		y: 0
	};

	constructor(editor: ICodeEditor, contextKeyService: IContextKeyService, _keybindingService: IKeybindingService, private _themeService: IThemeService) {
		super();

		this._editor = editor;

		this._isVisibleKey = CONTEXT_HISTORY_TREE_WIDGET_VISIBLE.bindTo(contextKeyService);

		this._domNode = createFastDomNode(document.createElement('div'));
		this._lineNode = this.initCanvas('0');
		this._markNode = this.initCanvas('1');

		this._domNode.setWidth(HistoryTreeWidget.WIDTH);
		this._domNode.setHeight(HistoryTreeWidget.HEIGHT);

		this._domNode.setClassName('historyTreeWidget');
		this._domNode.setDisplay('none');
		this._domNode.setAttribute('role', 'tooltip');
		this._domNode.setAttribute('aria-hidden', 'true');
		this._domNode.setWidth(HistoryTreeWidget.WIDTH);
		this._domNode.setHeight(HistoryTreeWidget.HEIGHT);
		this._isVisible = false;

		this._register(this._editor.onDidLayoutChange(() => {
			if (this._isVisible) {
				this._layout();
			}
		}));

		this._editor.addOverlayWidget(this);
	}

	private initCanvas(zIndex: string) {
		const canvas = createFastDomNode(document.createElement('canvas'));

		this._domNode.domNode.appendChild(canvas.domNode);

		// canvas need to have size set on the canvas element
		canvas.domNode.width = HistoryTreeWidget.WIDTH;
		canvas.domNode.height = HistoryTreeWidget.HEIGHT;
		canvas.domNode.style.zIndex = zIndex;
		canvas.domNode.style.position = 'absolute';

		return canvas;
	}

	public dispose(): void {
		this._editor.removeOverlayWidget(this);
		super.dispose();
	}

	public getId(): string {
		return HistoryTreeWidget.ID;
	}

	public getDomNode(): HTMLElement {
		return this._domNode.domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return {
			preference: null
		};
	}

	private _age(then: number) {
		function plural(t, c) {
			if (c === 1) {
				return t;
			}
			return t + 's';
		}

		function padDate(num: number) {
			if (num < 10) {
				return `0${num}`;
			}
			return `${num}`;
		}

		const now = Date.now();
		if (then > now) {
			return nls.localize('historyTree.future', "in the future");
		}

		const delta = Math.max(1, Math.floor((now - then) / 1000));
		if (delta > ageScales[0][1] * 2) {
			const date = new Date(then);
			return nls.localize('historyTree.dateFormat', "{0} {1} {2}", date.getFullYear(), padDate(date.getMonth()), padDate(date.getDate()));
		}

		for (let [t, s] of ageScales) {
			const n = delta / s;
			if (n >= 2) {
				return nls.localize('historyTree.timeFormat', "{0} {1} ago", Math.floor(n), plural(t, n));
			}
		}

		return '<1 min ago';
	}

	/*
	* Style is read from CSS to enable customization.
	* That means that the themeService should actually be used, but
	*/
	private _readStyle() {
		const style = dom.getComputedStyle(this._domNode.domNode);
		this._backgroundColor = style.backgroundColor || '#000';
		this._lineColor = style.fill || '#FFF';
		this._textColor = style.color || '#FFF';
		this._font = style.font || '80px Arial';
	}

	private _resetCache() {
		this._selectedIndex = undefined;
		this._yindicies = undefined;
		this._sorted = undefined;
		this._topElement = undefined;
		this._nowIndex = undefined;
		this._textPlacement = undefined;
	}

	/*
	* Calculate all the position data so that redraws are cheap
	*/
	private _cache() {
		function enque(queue: IHistoryElement[], el: IHistoryElement) {
			queue.push(el);
			for (let child of el.futures) {
				enque(queue, child);
			}
		}

		function largestChildId(el: IHistoryElement) {
			let max = el.index;
			for (let future of el.futures) {
				max = Math.max(max, largestChildId(future));
			}
			return max;
		}

		const xinds: number[] = [];
		function claimXIndex(yindex: number, pastindex: number) {
			for (let k = 0; k < xinds.length; k++) {
				if (yindex <= xinds[k]) {
					xinds[k] = pastindex;
					return k;
				}
			}
			xinds.push(pastindex);
			return xinds.length - 1;
		}

		if (this._yindicies === undefined) {

			const internals = this._model.getHistory();

			this._sorted = [];
			enque(this._sorted, internals.root);
			this._sorted.sort((a, b) => a.index - b.index);

			this._yindicies = [];
			for (let i = 0; i < this._sorted.length; i++) {
				this._yindicies[this._sorted[i].index] = {
					index: i,
					el: this._sorted[i]
				};
			}
			this._topElement = this._sorted[this._sorted.length - 1];
			this._nowIndex = this._selectedIndex = internals.now.index;

			const dones: boolean[] = [];
			this._positions = [];
			this._textPlacement = [];
			const queue: IHistoryElement[] = [this._topElement];

			while (queue.length > 0) {
				let curr = queue.pop();
				const newitems: IHistoryElement[] = [];

				// not past root and not already processed)
				while (curr !== undefined && !dones[curr.index]) {
					const past = curr.past;
					const yindex = this._yindicies[curr.index].index;

					let pastindex = yindex - 1;
					if (past !== undefined) {
						pastindex = this._yindicies[past.index].index;
					}

					const xindex = claimXIndex(yindex, pastindex);

					for (let i = yindex; i > pastindex; i--) {
						this._textPlacement[i] = xindex;
					}


					this._positions[curr.index] = {
						yindex,
						xindex,
						el: curr
					};

					// enqueue other children
					if (curr.futures.length > 1) {
						let ids: number[] = [];
						for (let future of curr.futures) {
							// don't walk up completed branches
							if (!dones[future.index]) {
								ids.push(largestChildId(future));
							}
						}

						// sort so higher id comes later in the array, i.e. gets popped earlier
						ids.sort();

						// unshift so items added later gets popped later
						newitems.unshift(...ids.map(id => this._yindicies[id].el));
					}

					dones[curr.index] = true;
					curr = curr.past;
				}
				// push so the new items gets processed first (prevents lines from crossing)
				queue.push(...newitems);
			}
		}
	}

	private _calcX(xindex: number, _xoffset: number) {
		return _xoffset + 20 * xindex;
	}

	private _calcPos(bottom: number, pos: HistoryElementPosition, _offset: { x: number, y: number }) {

		const topY = bottom + _offset.y - 50 - 30 * pos.yindex;
		const middleX = this._calcX(pos.xindex, _offset.x);
		return {
			leftX: middleX - 5,
			middleX,
			rightX: middleX + 5,
			topY,
			middleY: topY + 5,
			botY: topY + 10
		};
	}

	private _updateOffset(bottom: number, right: number): void {
		const selectedPos = this._calcPos(bottom, this._positions[this._selectedIndex], this._offset);

		const margin = 20;
		// check if selected item would get off screen in Y-axis
		if (selectedPos.botY < margin) {
			// difference between calculated position and top of the screen
			this._offset.y += margin - selectedPos.botY;
		} else if (selectedPos.topY > bottom - margin) {
			// difference between calculated position and bottom of the screen
			this._offset.y -= selectedPos.topY - (bottom - margin);
		}

		// check if selected item would get off screen in X-axis
		if (selectedPos.leftX < margin) {
			// difference between calculated position and left of the screen
			this._offset.x += margin - selectedPos.leftX;
		} else if (selectedPos.rightX > right - margin - 100) {
			// difference between calculated position and right of the screen
			this._offset.x -= selectedPos.rightX - (right - margin - 100);
		}
	}

	private _draw(): void {
		this._cache();
		const lineDom = this._lineNode.domNode;
		var lineCtx = lineDom.getContext('2d');
		const markDom = this._markNode.domNode;
		var markCtx = markDom.getContext('2d');

		const bottom = lineDom.height;
		const right = lineDom.width;

		lineCtx.fillStyle = this._backgroundColor;
		lineCtx.clearRect(0, 0, right, bottom);

		markCtx.fillStyle = this._backgroundColor;
		markCtx.clearRect(0, 0, right, bottom);


		lineCtx.beginPath();
		lineCtx.font = this._font;
		lineCtx.fillStyle = this._textColor;
		lineCtx.strokeStyle = this._lineColor;
		lineCtx.textBaseline = 'middle';
		lineCtx.lineWidth = 2;

		markCtx.beginPath();
		markCtx.font = this._font;
		markCtx.fillStyle = this._textColor;
		markCtx.strokeStyle = this._lineColor;
		markCtx.textBaseline = 'middle';
		lineCtx.lineWidth = 2;

		this._updateOffset(bottom, right);

		for (let item of this._positions) {
			const pos = this._calcPos(bottom, item, this._offset);

			const curr = item.el;

			const textX = this._calcX(this._textPlacement[item.yindex], this._offset.x) + 15;

			if (curr.past === undefined) {
				markCtx.fillText(nls.localize('historyTree.original', "Original"), textX, pos.middleY);
			} else {
				markCtx.fillText(this._age(curr.timestamp), textX, pos.middleY);
			}

			if (curr.index === this._nowIndex) {
				markCtx.stroke();
				markCtx.beginPath();
				markCtx.moveTo(pos.middleX + 5, pos.middleY);
				markCtx.arc(pos.middleX, pos.middleY, 5, 0, 2 * Math.PI);
				markCtx.fill();
				markCtx.beginPath();
			} else {
				markCtx.moveTo(pos.middleX + 5, pos.middleY);
				markCtx.arc(pos.middleX, pos.middleY, 5, 0, 2 * Math.PI);
			}

			if (curr.index === this._selectedIndex) {
				markCtx.moveTo(pos.middleX - 8, pos.topY);
				markCtx.lineTo(pos.middleX - 8, pos.botY);
				markCtx.moveTo(pos.middleX + 8, pos.topY);
				markCtx.lineTo(pos.middleX + 8, pos.botY);
			}

			const past = item.el.past;
			if (past !== undefined) {
				const pastPos = this._calcPos(bottom, this._positions[past.index], this._offset);

				if (pastPos.middleX !== pos.middleX) {
					lineCtx.moveTo(pastPos.middleX, pastPos.topY - 10);
					lineCtx.lineTo(pos.middleX, pastPos.topY - 10);
				} else {
					lineCtx.moveTo(pastPos.middleX, pastPos.topY);
				}
				lineCtx.lineTo(pos.middleX, pos.botY);
			}
		}

		lineCtx.stroke();
		markCtx.stroke();
	}

	keyListener = (e: KeyboardEvent) => {
		if (this._yindicies !== undefined) {
			const selected = this._yindicies[this._selectedIndex];
			switch (e.key) {
				case 'ArrowDown':
					if (selected.index > 0) {
						this._selectedIndex--;
						this._draw();
					}
					break;

				case 'ArrowUp':
					if (selected.index < this._sorted.length - 1) {
						this._selectedIndex++;
						this._draw();
					}
					break;

				case 'Enter':
					this._model.moveTo(this._selectedIndex);
					break;
			}
		}
	}

	public show(): void {
		if (this._isVisible) {
			return;
		}
		this._isVisible = true;
		this._isVisibleKey.set(true);
		this._model = this._editor.getModel();
		this._showDisposables.push(this._model.onDidChangeHistory((e) => {
			if (e === HistoryEvent.Change) {
				this._resetCache();
				this._offset = {
					x: 0,
					y: 0
				};
			} else {
				const internals = this._model.getHistory();

				this._nowIndex = this._selectedIndex = internals.now.index;
			}
			this._draw();
		}), this._editor.onDidChangeModel(() => {
			this._resetCache();
			this.hide();
		}), this._themeService.onThemeChange(() => {
			this._readStyle();
			this._draw();
		}));

		this._domNode.domNode.addEventListener('keydown', this.keyListener);

		this._layout();
		this._readStyle();
		this._draw();
		this._domNode.domNode.tabIndex = 0;
		this._domNode.setAttribute('aria-hidden', 'false');
		this._domNode.setDisplay('block');
		this._domNode.domNode.focus();
	}


	private _layout(): void {
		let editorLayout = this._editor.getLayoutInfo();

		let top = Math.round((editorLayout.height - HistoryTreeWidget.HEIGHT) / 2);
		this._domNode.setTop(top);

		let left = Math.round((editorLayout.width - HistoryTreeWidget.WIDTH) / 2);
		this._domNode.setLeft(left);
	}

	public hide(): void {
		if (!this._isVisible) {
			return;
		}
		this._isVisible = false;
		this._isVisibleKey.set(false);
		this._model = null;
		this._showDisposables.forEach(d => d.dispose());
		this._showDisposables = [];
		this._domNode.domNode.removeEventListener('keydown', this.keyListener);
		this._domNode.domNode.tabIndex = -1;
		this._domNode.setDisplay('none');
		this._domNode.setAttribute('aria-hidden', 'true');
		this._editor.focus();
	}
}

const HistoryTreeCommand = EditorCommand.bindToContribution<HistoryTreeController>(HistoryTreeController.get);

registerEditorCommand(new HistoryTreeCommand({
	id: 'closeHistoryTree',
	precondition: CONTEXT_HISTORY_TREE_WIDGET_VISIBLE,
	handler: x => x.hide(),
	kbOpts: {
		weight: KeybindingsRegistry.WEIGHT.editorContrib(5),
		kbExpr: EditorContextKeys.focus,
		primary: KeyCode.Escape, secondary: [KeyMod.Shift | KeyCode.Escape]
	}
}));
