/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { IHorizontalSashLayoutProvider, ISashEvent, Orientation, Sash, SashState } from '../../../../base/browser/ui/sash/sash.js';
import { Color, RGBA } from '../../../../base/common/color.js';
import { IdGenerator } from '../../../../base/common/idGenerator.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import * as objects from '../../../../base/common/objects.js';
import './zoneWidget.css';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, IViewZone, IViewZoneChangeAccessor } from '../../../browser/editorBrowser.js';
import { EditorLayoutInfo, EditorOption } from '../../../common/config/editorOptions.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { IEditorDecorationsCollection, ScrollType } from '../../../common/editorCommon.js';
import { TrackedRangeStickiness } from '../../../common/model.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';

export interface IOptions {
	showFrame?: boolean;
	showArrow?: boolean;
	frameWidth?: number;
	className?: string;
	isAccessible?: boolean;
	isResizeable?: boolean;
	frameColor?: Color | string;
	arrowColor?: Color;
	keepEditorSelection?: boolean;
	ordinal?: number;
	showInHiddenAreas?: boolean;
}

export interface IStyles {
	frameColor?: Color | string | null;
	arrowColor?: Color | null;
}

const defaultColor = new Color(new RGBA(0, 122, 204));

const defaultOptions: IOptions = {
	showArrow: true,
	showFrame: true,
	className: '',
	frameColor: defaultColor,
	arrowColor: defaultColor,
	keepEditorSelection: false
};

const WIDGET_ID = 'vs.editor.contrib.zoneWidget';

class ViewZoneDelegate implements IViewZone {

	domNode: HTMLElement;
	id: string = ''; // A valid zone id should be greater than 0
	afterLineNumber: number;
	afterColumn: number;
	heightInLines: number;
	readonly showInHiddenAreas: boolean | undefined;
	readonly ordinal: number | undefined;

	private readonly _onDomNodeTop: (top: number) => void;
	private readonly _onComputedHeight: (height: number) => void;

	constructor(domNode: HTMLElement, afterLineNumber: number, afterColumn: number, heightInLines: number,
		onDomNodeTop: (top: number) => void,
		onComputedHeight: (height: number) => void,
		showInHiddenAreas: boolean | undefined,
		ordinal: number | undefined
	) {
		this.domNode = domNode;
		this.afterLineNumber = afterLineNumber;
		this.afterColumn = afterColumn;
		this.heightInLines = heightInLines;
		this.showInHiddenAreas = showInHiddenAreas;
		this.ordinal = ordinal;
		this._onDomNodeTop = onDomNodeTop;
		this._onComputedHeight = onComputedHeight;
	}

	onDomNodeTop(top: number): void {
		this._onDomNodeTop(top);
	}

	onComputedHeight(height: number): void {
		this._onComputedHeight(height);
	}
}

export class OverlayWidgetDelegate implements IOverlayWidget {

	private readonly _id: string;
	private readonly _domNode: HTMLElement;

	constructor(id: string, domNode: HTMLElement) {
		this._id = id;
		this._domNode = domNode;
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return null;
	}
}

class Arrow {

	private static readonly _IdGenerator = new IdGenerator('.arrow-decoration-');

	private readonly _ruleName = Arrow._IdGenerator.nextId();
	private readonly _decorations: IEditorDecorationsCollection;
	private _color: string | null = null;
	private _height: number = -1;

	constructor(
		private readonly _editor: ICodeEditor
	) {
		this._decorations = this._editor.createDecorationsCollection();
	}

	dispose(): void {
		this.hide();
		domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
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
		domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
		domStylesheetsJs.createCSSRule(
			`.monaco-editor ${this._ruleName}`,
			`border-style: solid; border-color: transparent; border-bottom-color: ${this._color}; border-width: ${this._height}px; bottom: -${this._height}px !important; margin-left: -${this._height}px; `
		);
	}

	show(where: IPosition): void {

		if (where.column === 1) {
			// the arrow isn't pretty at column 1 and we need to push it out a little
			where = { lineNumber: where.lineNumber, column: 2 };
		}

		this._decorations.set([{
			range: Range.fromPositions(where),
			options: {
				description: 'zone-widget-arrow',
				className: this._ruleName,
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
			}
		}]);
	}

	hide(): void {
		this._decorations.clear();
	}
}

export abstract class ZoneWidget implements IHorizontalSashLayoutProvider {

	private _arrow: Arrow | null = null;
	private _overlayWidget: OverlayWidgetDelegate | null = null;
	private _resizeSash: Sash | null = null;
	private _isSashResizeHeight: boolean = false;
	private readonly _positionMarkerId: IEditorDecorationsCollection;

	protected _viewZone: ViewZoneDelegate | null = null;
	protected readonly _disposables = new DisposableStore();

	container: HTMLElement | null = null;
	domNode: HTMLElement;
	editor: ICodeEditor;
	options: IOptions;


	constructor(editor: ICodeEditor, options: IOptions = {}) {
		this.editor = editor;
		this._positionMarkerId = this.editor.createDecorationsCollection();
		this.options = objects.deepClone(options);
		objects.mixin(this.options, defaultOptions, false);
		this.domNode = document.createElement('div');
		if (!this.options.isAccessible) {
			this.domNode.setAttribute('aria-hidden', 'true');
			this.domNode.setAttribute('role', 'presentation');
		}

		this._disposables.add(this.editor.onDidLayoutChange((info: EditorLayoutInfo) => {
			const width = this._getWidth(info);
			this.domNode.style.width = width + 'px';
			this.domNode.style.left = this._getLeft(info) + 'px';
			this._onWidth(width);
		}));
	}

	dispose(): void {
		if (this._overlayWidget) {
			this.editor.removeOverlayWidget(this._overlayWidget);
			this._overlayWidget = null;
		}

		if (this._viewZone) {
			this.editor.changeViewZones(accessor => {
				if (this._viewZone) {
					accessor.removeZone(this._viewZone.id);
				}
				this._viewZone = null;
			});
		}

		this._positionMarkerId.clear();

		this._disposables.dispose();
	}

	create(): void {

		this.domNode.classList.add('zone-widget');
		if (this.options.className) {
			this.domNode.classList.add(this.options.className);
		}

		this.container = document.createElement('div');
		this.container.classList.add('zone-widget-container');
		this.domNode.appendChild(this.container);
		if (this.options.showArrow) {
			this._arrow = new Arrow(this.editor);
			this._disposables.add(this._arrow);
		}
		this._fillContainer(this.container);
		this._initSash();
		this._applyStyles();
	}

	style(styles: IStyles): void {
		if (styles.frameColor) {
			this.options.frameColor = styles.frameColor;
		}
		if (styles.arrowColor) {
			this.options.arrowColor = styles.arrowColor;
		}
		this._applyStyles();
	}

	protected _applyStyles(): void {
		if (this.container && this.options.frameColor) {
			const frameColor = this.options.frameColor.toString();
			this.container.style.borderTopColor = frameColor;
			this.container.style.borderBottomColor = frameColor;
		}
		if (this._arrow && this.options.arrowColor) {
			const arrowColor = this.options.arrowColor.toString();
			this._arrow.color = arrowColor;
		}
	}

	protected _getWidth(info: EditorLayoutInfo): number {
		return info.width - info.minimap.minimapWidth - info.verticalScrollbarWidth;
	}

	private _getLeft(info: EditorLayoutInfo): number {
		// If minimap is to the left, we move beyond it
		if (info.minimap.minimapWidth > 0 && info.minimap.minimapLeft === 0) {
			return info.minimap.minimapWidth;
		}
		return 0;
	}

	private _onViewZoneTop(top: number): void {
		this.domNode.style.top = top + 'px';
	}

	private _onViewZoneHeight(height: number): void {
		this.domNode.style.height = `${height}px`;

		if (this.container) {
			const containerHeight = height - this._decoratingElementsHeight();
			this.container.style.height = `${containerHeight}px`;
			const layoutInfo = this.editor.getLayoutInfo();
			this._doLayout(containerHeight, this._getWidth(layoutInfo));
		}

		this._resizeSash?.layout();
	}

	get position(): Position | undefined {
		const range = this._positionMarkerId.getRange(0);
		if (!range) {
			return undefined;
		}
		return range.getStartPosition();
	}

	hasFocus() {
		return this.domNode.contains(dom.getActiveElement());
	}

	protected _isShowing: boolean = false;

	show(rangeOrPos: IRange | IPosition, heightInLines: number): void {
		const range = Range.isIRange(rangeOrPos) ? Range.lift(rangeOrPos) : Range.fromPositions(rangeOrPos);
		this._isShowing = true;
		this._showImpl(range, heightInLines);
		this._isShowing = false;
		this._positionMarkerId.set([{ range, options: ModelDecorationOptions.EMPTY }]);
	}

	updatePositionAndHeight(rangeOrPos: IRange | IPosition, heightInLines?: number): void {
		if (this._viewZone) {
			rangeOrPos = Range.isIRange(rangeOrPos) ? Range.getStartPosition(rangeOrPos) : rangeOrPos;
			this._viewZone.afterLineNumber = rangeOrPos.lineNumber;
			this._viewZone.afterColumn = rangeOrPos.column;
			this._viewZone.heightInLines = heightInLines ?? this._viewZone.heightInLines;

			this.editor.changeViewZones(accessor => {
				accessor.layoutZone(this._viewZone!.id);
			});
			this._positionMarkerId.set([{
				range: Range.isIRange(rangeOrPos) ? rangeOrPos : Range.fromPositions(rangeOrPos),
				options: ModelDecorationOptions.EMPTY
			}]);
			this._updateSashEnablement();
		}
	}

	hide(): void {
		if (this._viewZone) {
			this.editor.changeViewZones(accessor => {
				if (this._viewZone) {
					accessor.removeZone(this._viewZone.id);
				}
			});
			this._viewZone = null;
		}
		if (this._overlayWidget) {
			this.editor.removeOverlayWidget(this._overlayWidget);
			this._overlayWidget = null;
		}
		this._arrow?.hide();
		this._positionMarkerId.clear();
		this._isSashResizeHeight = false;
	}

	protected _decoratingElementsHeight(): number {
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		let result = 0;

		if (this.options.showArrow) {
			const arrowHeight = Math.round(lineHeight / 3);
			result += 2 * arrowHeight;
		}

		if (this.options.showFrame) {
			const frameThickness = this.options.frameWidth ?? Math.round(lineHeight / 9);
			result += 2 * frameThickness;
		}

		return result;
	}

	/** Gets the maximum widget height in lines. */
	protected _getMaximumHeightInLines(): number | undefined {
		return Math.max(12, (this.editor.getLayoutInfo().height / this.editor.getOption(EditorOption.lineHeight)) * 0.8);
	}

	private _showImpl(where: Range, heightInLines: number): void {
		const position = where.getStartPosition();
		const layoutInfo = this.editor.getLayoutInfo();
		const width = this._getWidth(layoutInfo);
		this.domNode.style.width = `${width}px`;
		this.domNode.style.left = this._getLeft(layoutInfo) + 'px';

		// Render the widget as zone (rendering) and widget (lifecycle)
		const viewZoneDomNode = document.createElement('div');
		viewZoneDomNode.style.overflow = 'hidden';
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);

		// adjust heightInLines to viewport
		const maxHeightInLines = this._getMaximumHeightInLines();
		if (maxHeightInLines !== undefined) {
			heightInLines = Math.min(heightInLines, maxHeightInLines);
		}

		let arrowHeight = 0;
		let frameThickness = 0;

		// Render the arrow one 1/3 of an editor line height
		if (this._arrow && this.options.showArrow) {
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
				(height: number) => this._onViewZoneHeight(height),
				this.options.showInHiddenAreas,
				this.options.ordinal
			);
			this._viewZone.id = accessor.addZone(this._viewZone);
			this._overlayWidget = new OverlayWidgetDelegate(WIDGET_ID + this._viewZone.id, this.domNode);
			this.editor.addOverlayWidget(this._overlayWidget);
		});
		this._updateSashEnablement();

		if (this.container && this.options.showFrame) {
			const width = this.options.frameWidth ? this.options.frameWidth : frameThickness;
			this.container.style.borderTopWidth = width + 'px';
			this.container.style.borderBottomWidth = width + 'px';
		}

		const containerHeight = heightInLines * lineHeight - this._decoratingElementsHeight();

		if (this.container) {
			this.container.style.top = arrowHeight + 'px';
			this.container.style.height = containerHeight + 'px';
			this.container.style.overflow = 'hidden';
		}

		this._doLayout(containerHeight, width);

		if (!this.options.keepEditorSelection) {
			this.editor.setSelection(where);
		}

		const model = this.editor.getModel();
		if (model) {
			const range = model.validateRange(new Range(where.startLineNumber, 1, where.endLineNumber + 1, 1));
			this.revealRange(range, range.startLineNumber === model.getLineCount());
		}
	}

	protected revealRange(range: Range, isLastLine: boolean) {
		if (isLastLine) {
			this.editor.revealLineNearTop(range.endLineNumber, ScrollType.Smooth);
		} else {
			this.editor.revealRange(range, ScrollType.Smooth);
		}
	}

	protected setCssClass(className: string, classToReplace?: string): void {
		if (!this.container) {
			return;
		}

		if (classToReplace) {
			this.container.classList.remove(classToReplace);
		}

		this.container.classList.add(className);

	}

	protected abstract _fillContainer(container: HTMLElement): void;

	protected _onWidth(widthInPixel: number): void {
		// implement in subclass
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		// implement in subclass
	}

	protected _relayout(_newHeightInLines: number, useMax?: boolean): void {
		const maxHeightInLines = this._getMaximumHeightInLines();
		const newHeightInLines = (useMax && (maxHeightInLines !== undefined)) ? Math.min(maxHeightInLines, _newHeightInLines) : _newHeightInLines;
		if (this._viewZone && this._viewZone.heightInLines !== newHeightInLines) {
			this.editor.changeViewZones(accessor => {
				if (this._viewZone) {
					this._viewZone.heightInLines = newHeightInLines;
					accessor.layoutZone(this._viewZone.id);
				}
			});
			this._updateSashEnablement();
		}
	}

	// --- sash

	private _initSash(): void {
		if (this._resizeSash) {
			return;
		}
		this._resizeSash = this._disposables.add(new Sash(this.domNode, this, { orientation: Orientation.HORIZONTAL }));

		if (!this.options.isResizeable) {
			this._resizeSash.state = SashState.Disabled;
		}

		let data: { startY: number; heightInLines: number; minLines: number; maxLines: number } | undefined;
		this._disposables.add(this._resizeSash.onDidStart((e: ISashEvent) => {
			if (this._viewZone) {
				data = {
					startY: e.startY,
					heightInLines: this._viewZone.heightInLines,
					... this._getResizeBounds()
				};
			}
		}));

		this._disposables.add(this._resizeSash.onDidEnd(() => {
			data = undefined;
		}));

		this._disposables.add(this._resizeSash.onDidChange((evt: ISashEvent) => {
			if (data) {
				const lineDelta = (evt.currentY - data.startY) / this.editor.getOption(EditorOption.lineHeight);
				const roundedLineDelta = lineDelta < 0 ? Math.ceil(lineDelta) : Math.floor(lineDelta);
				const newHeightInLines = data.heightInLines + roundedLineDelta;

				if (newHeightInLines > data.minLines && newHeightInLines < data.maxLines) {
					this._isSashResizeHeight = true;
					this._relayout(newHeightInLines);
				}
			}
		}));
	}

	private _updateSashEnablement(): void {
		if (this._resizeSash) {
			const { minLines, maxLines } = this._getResizeBounds();
			this._resizeSash.state = minLines === maxLines ? SashState.Disabled : SashState.Enabled;
		}
	}

	protected get _usesResizeHeight(): boolean {
		return this._isSashResizeHeight;
	}

	protected _getResizeBounds(): { readonly minLines: number; readonly maxLines: number } {
		return { minLines: 5, maxLines: 35 };
	}

	getHorizontalSashLeft() {
		return 0;
	}

	getHorizontalSashTop() {
		return (this.domNode.style.height === null ? 0 : parseInt(this.domNode.style.height)) - (this._decoratingElementsHeight() / 2);
	}

	getHorizontalSashWidth() {
		const layoutInfo = this.editor.getLayoutInfo();
		return layoutInfo.width - layoutInfo.minimap.minimapWidth;
	}
}
