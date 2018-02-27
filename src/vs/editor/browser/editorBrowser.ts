/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable } from 'vs/base/common/lifecycle';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { Selection } from 'vs/editor/common/core/selection';
import { Range, IRange } from 'vs/editor/common/core/range';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { OverviewRulerZone } from 'vs/editor/common/view/overviewZoneManager';
import { IModelContentChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelOptionsChangedEvent, IModelDecorationsChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { ICursorPositionChangedEvent, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ICursors, CursorConfiguration } from 'vs/editor/common/controller/cursorCommon';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { ITextModel, IIdentifiedSingleEditOperation, IModelDecoration, IModelDeltaDecoration } from 'vs/editor/common/model';

/**
 * A view zone is a full horizontal rectangle that 'pushes' text down.
 * The editor reserves space for view zones when rendering.
 */
export interface IViewZone {
	/**
	 * The line number after which this zone should appear.
	 * Use 0 to place a view zone before the first line number.
	 */
	afterLineNumber: number;
	/**
	 * The column after which this zone should appear.
	 * If not set, the maxLineColumn of `afterLineNumber` will be used.
	 */
	afterColumn?: number;
	/**
	 * Suppress mouse down events.
	 * If set, the editor will attach a mouse down listener to the view zone and .preventDefault on it.
	 * Defaults to false
	 */
	suppressMouseDown?: boolean;
	/**
	 * The height in lines of the view zone.
	 * If specified, `heightInPx` will be used instead of this.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInLines?: number;
	/**
	 * The height in px of the view zone.
	 * If this is set, the editor will give preference to it rather than `heightInLines` above.
	 * If neither `heightInPx` nor `heightInLines` is specified, a default of `heightInLines` = 1 will be chosen.
	 */
	heightInPx?: number;
	/**
	 * The dom node of the view zone
	 */
	domNode: HTMLElement;
	/**
	 * An optional dom node for the view zone that will be placed in the margin area.
	 */
	marginDomNode?: HTMLElement;
	/**
	 * Callback which gives the relative top of the view zone as it appears (taking scrolling into account).
	 */
	onDomNodeTop?: (top: number) => void;
	/**
	 * Callback which gives the height in pixels of the view zone.
	 */
	onComputedHeight?: (height: number) => void;
}
/**
 * An accessor that allows for zones to be added or removed.
 */
export interface IViewZoneChangeAccessor {
	/**
	 * Create a new view zone.
	 * @param zone Zone to create
	 * @return A unique identifier to the view zone.
	 */
	addZone(zone: IViewZone): number;
	/**
	 * Remove a zone
	 * @param id A unique identifier to the view zone, as returned by the `addZone` call.
	 */
	removeZone(id: number): void;
	/**
	 * Change a zone's position.
	 * The editor will rescan the `afterLineNumber` and `afterColumn` properties of a view zone.
	 */
	layoutZone(id: number): void;
}

/**
 * A positioning preference for rendering content widgets.
 */
export enum ContentWidgetPositionPreference {
	/**
	 * Place the content widget exactly at a position
	 */
	EXACT,
	/**
	 * Place the content widget above a position
	 */
	ABOVE,
	/**
	 * Place the content widget below a position
	 */
	BELOW
}
/**
 * A position for rendering content widgets.
 */
export interface IContentWidgetPosition {
	/**
	 * Desired position for the content widget.
	 * `preference` will also affect the placement.
	 */
	position: IPosition;
	/**
	 * Placement preference for position, in order of preference.
	 */
	preference: ContentWidgetPositionPreference[];
}
/**
 * A content widget renders inline with the text and can be easily placed 'near' an editor position.
 */
export interface IContentWidget {
	/**
	 * Render this content widget in a location where it could overflow the editor's view dom node.
	 */
	allowEditorOverflow?: boolean;

	suppressMouseDown?: boolean;
	/**
	 * Get a unique identifier of the content widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the content widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the content widget.
	 * If null is returned, the content widget will be placed off screen.
	 */
	getPosition(): IContentWidgetPosition;
}

/**
 * A positioning preference for rendering overlay widgets.
 */
export enum OverlayWidgetPositionPreference {
	/**
	 * Position the overlay widget in the top right corner
	 */
	TOP_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the bottom right corner
	 */
	BOTTOM_RIGHT_CORNER,

	/**
	 * Position the overlay widget in the top center
	 */
	TOP_CENTER
}
/**
 * A position for rendering overlay widgets.
 */
export interface IOverlayWidgetPosition {
	/**
	 * The position preference for the overlay widget.
	 */
	preference: OverlayWidgetPositionPreference;
}
/**
 * An overlay widgets renders on top of the text.
 */
export interface IOverlayWidget {
	/**
	 * Get a unique identifier of the overlay widget.
	 */
	getId(): string;
	/**
	 * Get the dom node of the overlay widget.
	 */
	getDomNode(): HTMLElement;
	/**
	 * Get the placement of the overlay widget.
	 * If null is returned, the overlay widget is responsible to place itself.
	 */
	getPosition(): IOverlayWidgetPosition;
}

/**
 * Type of hit element with the mouse in the editor.
 */
export enum MouseTargetType {
	/**
	 * Mouse is on top of an unknown element.
	 */
	UNKNOWN,
	/**
	 * Mouse is on top of the textarea used for input.
	 */
	TEXTAREA,
	/**
	 * Mouse is on top of the glyph margin
	 */
	GUTTER_GLYPH_MARGIN,
	/**
	 * Mouse is on top of the line numbers
	 */
	GUTTER_LINE_NUMBERS,
	/**
	 * Mouse is on top of the line decorations
	 */
	GUTTER_LINE_DECORATIONS,
	/**
	 * Mouse is on top of the whitespace left in the gutter by a view zone.
	 */
	GUTTER_VIEW_ZONE,
	/**
	 * Mouse is on top of text in the content.
	 */
	CONTENT_TEXT,
	/**
	 * Mouse is on top of empty space in the content (e.g. after line text or below last line)
	 */
	CONTENT_EMPTY,
	/**
	 * Mouse is on top of a view zone in the content.
	 */
	CONTENT_VIEW_ZONE,
	/**
	 * Mouse is on top of a content widget.
	 */
	CONTENT_WIDGET,
	/**
	 * Mouse is on top of the decorations overview ruler.
	 */
	OVERVIEW_RULER,
	/**
	 * Mouse is on top of a scrollbar.
	 */
	SCROLLBAR,
	/**
	 * Mouse is on top of an overlay widget.
	 */
	OVERLAY_WIDGET,
	/**
	 * Mouse is outside of the editor.
	 */
	OUTSIDE_EDITOR,
}

/**
 * Target hit with the mouse in the editor.
 */
export interface IMouseTarget {
	/**
	 * The target element
	 */
	readonly element: Element;
	/**
	 * The target type
	 */
	readonly type: MouseTargetType;
	/**
	 * The 'approximate' editor position
	 */
	readonly position: Position;
	/**
	 * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
	 */
	readonly mouseColumn: number;
	/**
	 * The 'approximate' editor range
	 */
	readonly range: Range;
	/**
	 * Some extra detail.
	 */
	readonly detail: any;
}
/**
 * A mouse event originating from the editor.
 */
export interface IEditorMouseEvent {
	readonly event: IMouseEvent;
	readonly target: IMouseTarget;
}

/**
 * An overview ruler
 * @internal
 */
export interface IOverviewRuler {
	getDomNode(): HTMLElement;
	dispose(): void;
	setZones(zones: OverviewRulerZone[]): void;
	setLayout(position: editorOptions.OverviewRulerPosition): void;
}

/**
 * A rich code editor.
 */
export interface ICodeEditor extends editorCommon.IEditor {
	/**
	 * An event emitted when the content of the current model has changed.
	 * @event
	 */
	onDidChangeModelContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the language of the current model has changed.
	 * @event
	 */
	onDidChangeModelLanguage(listener: (e: IModelLanguageChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the language configuration of the current model has changed.
	 * @event
	 */
	onDidChangeModelLanguageConfiguration(listener: (e: IModelLanguageConfigurationChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the options of the current model has changed.
	 * @event
	 */
	onDidChangeModelOptions(listener: (e: IModelOptionsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the configuration of the editor has changed. (e.g. `editor.updateOptions()`)
	 * @event
	 */
	onDidChangeConfiguration(listener: (e: editorOptions.IConfigurationChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the cursor position has changed.
	 * @event
	 */
	onDidChangeCursorPosition(listener: (e: ICursorPositionChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the cursor selection has changed.
	 * @event
	 */
	onDidChangeCursorSelection(listener: (e: ICursorSelectionChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the model of this editor has changed (e.g. `editor.setModel()`).
	 * @event
	 */
	onDidChangeModel(listener: (e: editorCommon.IModelChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the decorations of the current model have changed.
	 * @event
	 */
	onDidChangeModelDecorations(listener: (e: IModelDecorationsChangedEvent) => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor gained focus (i.e. cursor blinking).
	 * @event
	 */
	onDidFocusEditorText(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor lost focus.
	 * @event
	 */
	onDidBlurEditorText(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget gained focus.
	 * @event
	 */
	onDidFocusEditor(listener: () => void): IDisposable;
	/**
	 * An event emitted when the text inside this editor or an editor widget lost focus.
	 * @event
	 */
	onDidBlurEditor(listener: () => void): IDisposable;
	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	onWillType(listener: (text: string) => void): IDisposable;
	/**
	 * An event emitted before interpreting typed characters (on the keyboard).
	 * @event
	 * @internal
	 */
	onDidType(listener: (text: string) => void): IDisposable;
	/**
	 * An event emitted when users paste text in the editor.
	 * @event
	 * @internal
	 */
	onDidPaste(listener: (range: Range) => void): IDisposable;
	/**
	 * An event emitted on a "mouseup".
	 * @event
	 */
	onMouseUp(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "mousedown".
	 * @event
	 */
	onMouseDown(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "mousedrag".
	 * @internal
	 * @event
	 */
	onMouseDrag(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "mousedrop".
	 * @internal
	 * @event
	 */
	onMouseDrop(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "contextmenu".
	 * @event
	 */
	onContextMenu(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "mousemove".
	 * @event
	 */
	onMouseMove(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "mouseleave".
	 * @event
	 */
	onMouseLeave(listener: (e: IEditorMouseEvent) => void): IDisposable;
	/**
	 * An event emitted on a "keyup".
	 * @event
	 */
	onKeyUp(listener: (e: IKeyboardEvent) => void): IDisposable;
	/**
	 * An event emitted on a "keydown".
	 * @event
	 */
	onKeyDown(listener: (e: IKeyboardEvent) => void): IDisposable;
	/**
	 * An event emitted when the layout of the editor has changed.
	 * @event
	 */
	onDidLayoutChange(listener: (e: editorOptions.EditorLayoutInfo) => void): IDisposable;
	/**
	 * An event emitted when the scroll in the editor has changed.
	 * @event
	 */
	onDidScrollChange(listener: (e: editorCommon.IScrollEvent) => void): IDisposable;

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): editorCommon.ICodeEditorViewState;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: editorCommon.ICodeEditorViewState): void;

	/**
	 * Returns true if this editor or one of its widgets has keyboard focus.
	 */
	hasWidgetFocus(): boolean;

	/**
	 * Get a contribution of this editor.
	 * @id Unique identifier of the contribution.
	 * @return The contribution or null if contribution not found.
	 */
	getContribution<T extends editorCommon.IEditorContribution>(id: string): T;

	/**
	 * Execute `fn` with the editor's services.
	 * @internal
	 */
	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): ITextModel;

	/**
	 * Returns the current editor's configuration
	 */
	getConfiguration(): editorOptions.InternalEditorOptions;

	/**
	 * Returns the 'raw' editor's configuration (without any validation or defaults).
	 * @internal
	 */
	getRawConfiguration(): editorOptions.IEditorOptions;

	/**
	 * Get value of the current model attached to this editor.
	 * @see `ITextModel.getValue`
	 */
	getValue(options?: { preserveBOM: boolean; lineEnding: string; }): string;

	/**
	 * Set the value of the current model attached to this editor.
	 * @see `ITextModel.setValue`
	 */
	setValue(newValue: string): void;

	/**
	 * Get the scrollWidth of the editor's viewport.
	 */
	getScrollWidth(): number;
	/**
	 * Get the scrollLeft of the editor's viewport.
	 */
	getScrollLeft(): number;

	/**
	 * Get the scrollHeight of the editor's viewport.
	 */
	getScrollHeight(): number;
	/**
	 * Get the scrollTop of the editor's viewport.
	 */
	getScrollTop(): number;

	/**
	 * Change the scrollLeft of the editor's viewport.
	 */
	setScrollLeft(newScrollLeft: number): void;
	/**
	 * Change the scrollTop of the editor's viewport.
	 */
	setScrollTop(newScrollTop: number): void;
	/**
	 * Change the scroll position of the editor's viewport.
	 */
	setScrollPosition(position: editorCommon.INewScrollPosition): void;

	/**
	 * Get an action that is a contribution to this editor.
	 * @id Unique identifier of the contribution.
	 * @return The action or null if action not found.
	 */
	getAction(id: string): editorCommon.IEditorAction;

	/**
	 * Execute a command on the editor.
	 * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
	 * @param source The source of the call.
	 * @param command The command to execute
	 */
	executeCommand(source: string, command: editorCommon.ICommand): void;

	/**
	 * Push an "undo stop" in the undo-redo stack.
	 */
	pushUndoStop(): boolean;

	/**
	 * Execute edits on the editor.
	 * The edits will land on the undo-redo stack, but no "undo stop" will be pushed.
	 * @param source The source of the call.
	 * @param edits The edits to execute.
	 * @param endCursoState Cursor state after the edits were applied.
	 */
	executeEdits(source: string, edits: IIdentifiedSingleEditOperation[], endCursoState?: Selection[]): boolean;

	/**
	 * Execute multiple (concommitent) commands on the editor.
	 * @param source The source of the call.
	 * @param command The commands to execute
	 */
	executeCommands(source: string, commands: editorCommon.ICommand[]): void;

	/**
	 * @internal
	 */
	_getCursors(): ICursors;

	/**
	 * @internal
	 */
	_getCursorConfiguration(): CursorConfiguration;

	/**
	 * Get all the decorations on a line (filtering out decorations from other editors).
	 */
	getLineDecorations(lineNumber: number): IModelDecoration[];

	/**
	 * All decorations added through this call will get the ownerId of this editor.
	 * @see `ITextModel.deltaDecorations`
	 */
	deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[];

	/**
	 * @internal
	 */
	setDecorations(decorationTypeKey: string, ranges: editorCommon.IDecorationOptions[]): void;

	/**
	 * @internal
	 */
	setDecorationsFast(decorationTypeKey: string, ranges: IRange[]): void;

	/**
	 * @internal
	 */
	removeDecorations(decorationTypeKey: string): void;

	/**
	 * Get the layout info for the editor.
	 */
	getLayoutInfo(): editorOptions.EditorLayoutInfo;

	/**
	 * Returns the range that is currently centered in the view port.
	 */
	getCenteredRangeInViewport(): Range;

	/**
	 * Returns the ranges that are currently visible.
	 * Does not account for horizontal scrolling.
	 */
	getVisibleRanges(): Range[];

	/**
	 * Get the view zones.
	 * @internal
	 */
	getWhitespaces(): IEditorWhitespace[];

	/**
	 * Get the vertical position (top offset) for the line w.r.t. to the first line.
	 */
	getTopForLineNumber(lineNumber: number): number;

	/**
	 * Get the vertical position (top offset) for the position w.r.t. to the first line.
	 */
	getTopForPosition(lineNumber: number, column: number): number;

	/**
	 * Set the model ranges that will be hidden in the view.
	 * @internal
	 */
	setHiddenAreas(ranges: IRange[]): void;

	/**
	 * @internal
	 */
	getTelemetryData(): { [key: string]: any; };

	/**
	 * Returns the editor's dom node
	 */
	getDomNode(): HTMLElement;

	/**
	 * Add a content widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addContentWidget(widget: IContentWidget): void;
	/**
	 * Layout/Reposition a content widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropiately.
	 */
	layoutContentWidget(widget: IContentWidget): void;
	/**
	 * Remove a content widget.
	 */
	removeContentWidget(widget: IContentWidget): void;

	/**
	 * Add an overlay widget. Widgets must have unique ids, otherwise they will be overwritten.
	 */
	addOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Layout/Reposition an overlay widget. This is a ping to the editor to call widget.getPosition()
	 * and update appropiately.
	 */
	layoutOverlayWidget(widget: IOverlayWidget): void;
	/**
	 * Remove an overlay widget.
	 */
	removeOverlayWidget(widget: IOverlayWidget): void;

	/**
	 * Change the view zones. View zones are lost when a new model is attached to the editor.
	 */
	changeViewZones(callback: (accessor: IViewZoneChangeAccessor) => void): void;

	/**
	 * Get the horizontal position (left offset) for the column w.r.t to the beginning of the line.
	 * This method works only if the line `lineNumber` is currently rendered (in the editor's viewport).
	 * Use this method with caution.
	 */
	getOffsetForColumn(lineNumber: number, column: number): number;

	/**
	 * Force an editor render now.
	 */
	render(): void;

	/**
	 * Get the hit test target at coordinates `clientX` and `clientY`.
	 * The coordinates are relative to the top-left of the viewport.
	 *
	 * @returns Hit test target or null if the coordinates fall outside the editor or the editor has no model.
	 */
	getTargetAtClientPoint(clientX: number, clientY: number): IMouseTarget;

	/**
	 * Get the visible position for `position`.
	 * The result position takes scrolling into account and is relative to the top left corner of the editor.
	 * Explanation 1: the results of this method will change for the same `position` if the user scrolls the editor.
	 * Explanation 2: the results of this method will not change if the container of the editor gets repositioned.
	 * Warning: the results of this method are innacurate for positions that are outside the current editor viewport.
	 */
	getScrolledVisiblePosition(position: IPosition): { top: number; left: number; height: number; };

	/**
	 * Apply the same font settings as the editor to `target`.
	 */
	applyFontInfo(target: HTMLElement): void;
}

/**
 * Information about a line in the diff editor
 */
export interface IDiffLineInformation {
	readonly equivalentLineNumber: number;
}

/**
 * A rich diff editor.
 */
export interface IDiffEditor extends editorCommon.IEditor {

	/**
	 * Returns whether the diff editor is ignoring trim whitespace or not.
	 * @internal
	 */
	readonly ignoreTrimWhitespace: boolean;
	/**
	 * Returns whether the diff editor is rendering side by side or not.
	 * @internal
	 */
	readonly renderSideBySide: boolean;
	/**
	 * Returns whether the diff editor is rendering +/- indicators or not.
	 * @internal
	 */
	readonly renderIndicators: boolean;

	/**
	 * @see ICodeEditor.getDomNode
	 */
	getDomNode(): HTMLElement;

	/**
	 * An event emitted when the diff information computed by this diff editor has been updated.
	 * @event
	 */
	onDidUpdateDiff(listener: () => void): IDisposable;

	/**
	 * Saves current view state of the editor in a serializable object.
	 */
	saveViewState(): editorCommon.IDiffEditorViewState;

	/**
	 * Restores the view state of the editor from a serializable object generated by `saveViewState`.
	 */
	restoreViewState(state: editorCommon.IDiffEditorViewState): void;

	/**
	 * Type the getModel() of IEditor.
	 */
	getModel(): editorCommon.IDiffEditorModel;

	/**
	 * Get the `original` editor.
	 */
	getOriginalEditor(): ICodeEditor;

	/**
	 * Get the `modified` editor.
	 */
	getModifiedEditor(): ICodeEditor;

	/**
	 * Get the computed diff information.
	 */
	getLineChanges(): editorCommon.ILineChange[];

	/**
	 * Get information based on computed diff about a line number from the original model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForOriginal(lineNumber: number): IDiffLineInformation;

	/**
	 * Get information based on computed diff about a line number from the modified model.
	 * If the diff computation is not finished or the model is missing, will return null.
	 */
	getDiffLineInformationForModified(lineNumber: number): IDiffLineInformation;
}

/**
 *@internal
 */
export function isCodeEditor(thing: any): thing is ICodeEditor {
	if (thing && typeof (<ICodeEditor>thing).getEditorType === 'function') {
		return (<ICodeEditor>thing).getEditorType() === editorCommon.EditorType.ICodeEditor;
	} else {
		return false;
	}
}

/**
 *@internal
 */
export function isDiffEditor(thing: any): thing is IDiffEditor {
	if (thing && typeof (<IDiffEditor>thing).getEditorType === 'function') {
		return (<IDiffEditor>thing).getEditorType() === editorCommon.EditorType.IDiffEditor;
	} else {
		return false;
	}
}
