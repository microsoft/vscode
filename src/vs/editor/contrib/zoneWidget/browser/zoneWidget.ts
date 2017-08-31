/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./zoneWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Widget } from 'vs/base/browser/ui/widget';
import * as objects from 'vs/base/common/objects';
import * as dom from 'vs/base/browser/dom';
import { Sash, Orientation, IHorizontalSashLayoutProvider, ISashEvent } from 'vs/base/browser/ui/sash/sash';
import { Range, IRange } from 'vs/editor/common/core/range';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, IViewZone, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { Color, RGBA } from 'vs/base/common/color';
import { EditorLayoutInfo } from 'vs/editor/common/config/editorOptions';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { IdGenerator } from 'vs/base/common/idGenerator';
import { ScrollType } from 'vs/editor/common/editorCommon';

export interface IOptions {
	showFrame?: boolean;
	showArrow?: boolean;
	frameWidth?: number;
	className?: string;
	isAccessible?: boolean;
	isResizeable?: boolean;
	frameColor?: Color;
	arrowColor?: Color;
}

export interface IStyles {
	frameColor?: Color;
	arrowColor?: Color;
}

const defaultColor = new Color(new RGBA(0, 122, 204));

const defaultOptions: IOptions = {
	showArrow: true,
	showFrame: true,
	className: '',
	frameColor: defaultColor,
	arrowColor: defaultColor
};

const WIDGET_ID = 'vs.editor.contrib.zoneWidget';

export class ViewZoneDelegate implements IViewZone {

	public domNode: HTMLElement;
	public id: number;
	public afterLineNumber: number;
	public afterColumn: number;
	public heightInLines: number;

	private _onDomNodeTop: (top: number) => void;
	private _onComputedHeight: (height: number) => void;

	constructor(domNode: HTMLElement, afterLineNumber: number, afterColumn: number, heightInLines: number,
		onDomNodeTop: (top: number) => void,
		onComputedHeight: (height: number) => void
	) {
		this.domNode = domNode;
		this.afterLineNumber = afterLineNumber;
		this.afterColumn = afterColumn;
		this.heightInLines = heightInLines;
		this._onDomNodeTop = onDomNodeTop;
		this._onComputedHeight = onComputedHeight;
	}

	public onDomNodeTop(top: number): void {
		this._onDomNodeTop(top);
	}

	public onComputedHeight(height: number): void {
		this._onComputedHeight(height);
	}
}

export class OverlayWidgetDelegate implements IOverlayWidget {

	private _id: string;
	private _domNode: HTMLElement;

	constructor(id: string, domNode: HTMLElement) {
		this._id = id;
		this._domNode = domNode;
	}

	public getId(): string {
		return this._id;
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getPosition(): IOverlayWidgetPosition {
		return null;
	}
}

class Arrow {

	private static _IdGenerator = new IdGenerator('.arrow-decoration-');

	private readonly _ruleName = Arrow._IdGenerator.nextId();
	private _decorations: string[] = [];
	private _color: string;
	private _height: number;

	constructor(
		private readonly _editor: ICodeEditor
	) {
		//
	}

	dispose(): void {
		this.hide();
		dom.removeCSSRulesContainingSelector(this._ruleName);
	}

	set color(value: string) {
		if (this._color !== value) {
			this._color = value;
			this._updateStyle();
		}
	}

	set height(value: number) {
		if (this._height !== value) {
			this._height = value;
			this._updateStyle();
		}
	}

	private _updateStyle(): void {
		dom.removeCSSRulesContainingSelector(this._ruleName);
		dom.createCSSRule(
			`.monaco-editor ${this._ruleName}`,
			`border-style: solid; border-color: transparent; border-bottom-color: ${this._color}; border-width: ${this._height}px; bottom: -${this._height}px; margin-left: -${this._height}px; `
		);
	}

	show(where: IPosition): void {
		this._decorations = this._editor.deltaDecorations(
			this._decorations,
			[{ range: Range.fromPositions(where), options: { className: this._ruleName } }]
		);
	}

	hide(): void {
		this._editor.deltaDecorations(this._decorations, []);
	}
}

export abstract class ZoneWidget extends Widget implements IHorizontalSashLayoutProvider {

	private _arrow: Arrow;
	private _overlayWidget: OverlayWidgetDelegate;
	private _resizeSash: Sash;
	private _positionMarkerId: string[] = [];

	protected _viewZone: ViewZoneDelegate;
	protected _disposables: IDisposable[] = [];

	public container: HTMLElement;
	public domNode: HTMLElement;
	public editor: ICodeEditor;
	public options: IOptions;


	constructor(editor: ICodeEditor, options: IOptions = {}) {
		super();
		this.editor = editor;
		this.options = objects.clone(options);
		objects.mixin(this.options, defaultOptions, false);
		this.domNode = document.createElement('div');
		if (!this.options.isAccessible) {
			this.domNode.setAttribute('aria-hidden', 'true');
			this.domNode.setAttribute('role', 'presentation');
		}

		this._disposables.push(this.editor.onDidLayoutChange((info: EditorLayoutInfo) => {
			const width = this._getWidth(info);
			this.domNode.style.width = width + 'px';
			this._onWidth(width);
		}));
	}

	public dispose(): void {

		dispose(this._disposables);

		if (this._overlayWidget) {
			this.editor.removeOverlayWidget(this._overlayWidget);
			this._overlayWidget = null;
		}

		if (this._viewZone) {
			this.editor.changeViewZones(accessor => {
				accessor.removeZone(this._viewZone.id);
				this._viewZone = null;
			});
		}

		this.editor.deltaDecorations(this._positionMarkerId, []);
	}

	public create(): void {

		dom.addClass(this.domNode, 'zone-widget');
		dom.addClass(this.domNode, this.options.className);

		this.container = document.createElement('div');
		dom.addClass(this.container, 'zone-widget-container');
		this.domNode.appendChild(this.container);
		if (this.options.showArrow) {
			this._arrow = new Arrow(this.editor);
			this._disposables.push(this._arrow);
		}
		this._fillContainer(this.container);
		this._initSash();
		this._applyStyles();
	}

	public style(styles: IStyles): void {
		if (styles.frameColor) {
			this.options.frameColor = styles.frameColor;
		}
		if (styles.arrowColor) {
			this.options.arrowColor = styles.arrowColor;
		}
		this._applyStyles();
	}

	protected _applyStyles(): void {
		if (this.container) {
			let frameColor = this.options.frameColor.toString();
			this.container.style.borderTopColor = frameColor;
			this.container.style.borderBottomColor = frameColor;
		}
		if (this._arrow) {
			let arrowColor = this.options.arrowColor.toString();
			this._arrow.color = arrowColor;
		}
	}

	private _getWidth(info: EditorLayoutInfo = this.editor.getLayoutInfo()): number {
		return info.width - info.minimapWidth - info.verticalScrollbarWidth;
	}

	private _onViewZoneTop(top: number): void {
		this.domNode.style.top = top + 'px';
	}

	private _onViewZoneHeight(height: number): void {
		this.domNode.style.height = `${height}px`;

		let containerHeight = height - this._decoratingElementsHeight();
		this.container.style.height = `${containerHeight}px`;
		this._doLayout(containerHeight, this._getWidth());

		this._resizeSash.layout();
	}

	public get position(): Position {
		const [id] = this._positionMarkerId;
		if (id) {
			return this.editor.getModel().getDecorationRange(id).getStartPosition();
		}
		return undefined;
	}

	protected _isShowing: boolean = false;

	public show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
		const range = Range.isIRange(rangeOrPos)
			? rangeOrPos
			: new Range(rangeOrPos.lineNumber, rangeOrPos.column, rangeOrPos.lineNumber, rangeOrPos.column);

		this._isShowing = true;
		this._showImpl(range, heightInLines);
		this._isShowing = false;
		this._positionMarkerId = this.editor.deltaDecorations(this._positionMarkerId, [{ range, options: ModelDecorationOptions.EMPTY }]);
	}

	public hide(): void {
		if (this._viewZone) {
			this.editor.changeViewZones(accessor => {
				accessor.removeZone(this._viewZone.id);
			});
			this._viewZone = null;
		}
		if (this._overlayWidget) {
			this.editor.removeOverlayWidget(this._overlayWidget);
			this._overlayWidget = null;
		}
		if (this._arrow) {
			this._arrow.hide();
		}
	}

	private _decoratingElementsHeight(): number {
		let lineHeight = this.editor.getConfiguration().lineHeight;
		let result = 0;

		if (this.options.showArrow) {
			let arrowHeight = Math.round(lineHeight / 3);
			result += 2 * arrowHeight;
		}

		if (this.options.showFrame) {
			let frameThickness = Math.round(lineHeight / 9);
			result += 2 * frameThickness;
		}

		return result;
	}

	private _showImpl(where: IRange, heightInLines: number): void {
		const position = {
			lineNumber: where.startLineNumber,
			column: where.startColumn
		};

		const width = this._getWidth();
		this.domNode.style.width = `${width}px`;

		// Render the widget as zone (rendering) and widget (lifecycle)
		const viewZoneDomNode = document.createElement('div');
		viewZoneDomNode.style.overflow = 'hidden';
		const lineHeight = this.editor.getConfiguration().lineHeight;

		// adjust heightInLines to viewport
		const maxHeightInLines = (this.editor.getLayoutInfo().height / lineHeight) * .8;
		if (heightInLines >= maxHeightInLines) {
			heightInLines = maxHeightInLines;
		}

		let arrowHeight = 0;
		let frameThickness = 0;

		// Render the arrow one 1/3 of an editor line height
		if (this.options.showArrow) {
			arrowHeight = Math.round(lineHeight / 3);
			this._arrow.height = arrowHeight;
			this._arrow.show(position);
		}

		// Render the frame as 1/9 of an editor line height
		if (this.options.showFrame) {
			frameThickness = Math.round(lineHeight / 9);
		}

		// insert zone widget
		this.editor.changeViewZones((accessor: IViewZoneChangeAccessor) => {
			if (this._viewZone) {
				accessor.removeZone(this._viewZone.id);
			}
			if (this._overlayWidget) {
				this.editor.removeOverlayWidget(this._overlayWidget);
				this._overlayWidget = null;
			}
			this.domNode.style.top = '-1000px';
			this._viewZone = new ViewZoneDelegate(
				viewZoneDomNode,
				position.lineNumber,
				position.column,
				heightInLines,
				(top: number) => this._onViewZoneTop(top),
				(height: number) => this._onViewZoneHeight(height)
			);
			this._viewZone.id = accessor.addZone(this._viewZone);
			this._overlayWidget = new OverlayWidgetDelegate(WIDGET_ID + this._viewZone.id, this.domNode);
			this.editor.addOverlayWidget(this._overlayWidget);
		});

		if (this.options.showFrame) {
			const width = this.options.frameWidth ? this.options.frameWidth : frameThickness;
			this.container.style.borderTopWidth = width + 'px';
			this.container.style.borderBottomWidth = width + 'px';
		}

		let containerHeight = heightInLines * lineHeight - this._decoratingElementsHeight();
		this.container.style.top = arrowHeight + 'px';
		this.container.style.height = containerHeight + 'px';
		this.container.style.overflow = 'hidden';


		this._doLayout(containerHeight, width);

		this.editor.setSelection(where);

		// Reveal the line above or below the zone widget, to get the zone widget in the viewport
		const revealLineNumber = Math.min(this.editor.getModel().getLineCount(), Math.max(1, where.endLineNumber + 1));
		this.editor.revealLine(revealLineNumber, ScrollType.Smooth);
	}

	protected setCssClass(className: string, classToReplace?: string): void {
		if (classToReplace) {
			this.container.classList.remove(classToReplace);
		}

		dom.addClass(this.container, className);

	}

	protected abstract _fillContainer(container: HTMLElement): void;

	protected _onWidth(widthInPixel: number): void {
		// implement in subclass
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		// implement in subclass
	}

	protected _relayout(newHeightInLines: number): void {
		if (this._viewZone.heightInLines !== newHeightInLines) {
			this.editor.changeViewZones(accessor => {
				this._viewZone.heightInLines = newHeightInLines;
				accessor.layoutZone(this._viewZone.id);
			});
		}
	}

	// --- sash

	private _initSash(): void {
		this._resizeSash = new Sash(this.domNode, this, { orientation: Orientation.HORIZONTAL });

		if (!this.options.isResizeable) {
			this._resizeSash.hide();
			this._resizeSash.disable();
		}

		let data: { startY: number; heightInLines: number; };
		this._disposables.push(this._resizeSash.addListener('start', (e: ISashEvent) => {
			if (this._viewZone) {
				data = {
					startY: e.startY,
					heightInLines: this._viewZone.heightInLines,
				};
			}
		}));

		this._disposables.push(this._resizeSash.addListener('end', () => {
			data = undefined;
		}));

		this._disposables.push(this._resizeSash.addListener('change', (evt: ISashEvent) => {
			if (data) {
				let lineDelta = (evt.currentY - data.startY) / this.editor.getConfiguration().lineHeight;
				let roundedLineDelta = lineDelta < 0 ? Math.ceil(lineDelta) : Math.floor(lineDelta);
				let newHeightInLines = data.heightInLines + roundedLineDelta;

				if (newHeightInLines > 5 && newHeightInLines < 35) {
					this._relayout(newHeightInLines);
				}
			}
		}));
	}

	getHorizontalSashLeft() {
		return 0;
	}

	getHorizontalSashTop() {
		return parseInt(this.domNode.style.height) - (this._decoratingElementsHeight() / 2);
	}

	getHorizontalSashWidth() {
		const layoutInfo = this.editor.getLayoutInfo();
		return layoutInfo.width - layoutInfo.minimapWidth;
	}
}
