/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

let EDITOR_ID = 0;

export interface ICodeEditorWidgetOptions {…}

class ModelData {…}

export class CodeEditorWidget extends Disposable implements editorBrowser.ICodeEditor {
	public readonly onDidDispose: Event<void> = this._onDidDispose.event;
	public readonly onDidChangeModelContent: Event<IModelContentChangedEvent> = this._onDidChangeModelContent.event;
	public readonly onDidChangeModelLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeModelLanguage.event;
	public readonly onDidChangeModelLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeModelLanguageConfiguration.event;
	public readonly onDidChangeModelOptions: Event<IModelOptionsChangedEvent> = this._onDidChangeModelOptions.event;
	public readonly onDidChangeModelDecorations: Event<IModelDecorationsChangedEvent> = this._onDidChangeModelDecorations.event;
	public readonly onDidChangeModelTokens: Event<IModelTokensChangedEvent> = this._onDidChangeModelTokens.event;
	public readonly onDidChangeConfiguration: Event<ConfigurationChangedEvent> = this._onDidChangeConfiguration.event;
	public readonly onDidChangeModel: Event<editorCommon.IModelChangedEvent> = this._onDidChangeModel.event;
	public readonly onDidChangeCursorPosition: Event<ICursorPositionChangedEvent> = this._onDidChangeCursorPosition.event;
	public readonly onDidChangeCursorSelection: Event<ICursorSelectionChangedEvent> = this._onDidChangeCursorSelection.event;
	public readonly onDidAttemptReadOnlyEdit: Event<void> = this._onDidAttemptReadOnlyEdit.event;
	public readonly onDidLayoutChange: Event<EditorLayoutInfo> = this._onDidLayoutChange.event;
	public readonly onDidFocusEditorText: Event<void> = this._editorTextFocus.onDidChangeToTrue;
	public readonly onDidBlurEditorText: Event<void> = this._editorTextFocus.onDidChangeToFalse;
	public readonly onDidFocusEditorWidget: Event<void> = this._editorWidgetFocus.onDidChangeToTrue;
	public readonly onDidBlurEditorWidget: Event<void> = this._editorWidgetFocus.onDidChangeToFalse;
	public readonly onWillType = this._onWillType.event;
	public readonly onDidType = this._onDidType.event;
	public readonly onDidCompositionStart = this._onDidCompositionStart.event;
	public readonly onDidCompositionEnd = this._onDidCompositionEnd.event;
	public readonly onDidPaste = this._onDidPaste.event;
	public readonly onMouseUp: Event<editorBrowser.IEditorMouseEvent> = this._onMouseUp.event;
	public readonly onMouseDown: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDown.event;
	public readonly onMouseDrag: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrag.event;
	public readonly onMouseDrop: Event<editorBrowser.IPartialEditorMouseEvent> = this._onMouseDrop.event;
	public readonly onMouseDropCanceled: Event<void> = this._onMouseDropCanceled.event;
	public readonly onDropIntoEditor = this._onDropIntoEditor.event;
	public readonly onContextMenu: Event<editorBrowser.IEditorMouseEvent> = this._onContextMenu.event;
	public readonly onMouseMove: Event<editorBrowser.IEditorMouseEvent> = this._onMouseMove.event;
	public readonly onMouseLeave: Event<editorBrowser.IPartialEditorMouseEvent> = this._onMouseLeave.event;
	public readonly onMouseWheel: Event<IMouseWheelEvent> = this._onMouseWheel.event;
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;
	public readonly onDidContentSizeChange: Event<editorCommon.IContentSizeChangedEvent> = this._onDidContentSizeChange.event;
	public readonly onDidScrollChange: Event<editorCommon.IScrollEvent> = this._onDidScrollChange.event;
	public readonly onDidChangeViewZones: Event<void> = this._onDidChangeViewZones.event;
	public readonly onDidChangeHiddenAreas: Event<void> = this._onDidChangeHiddenAreas.event;

	public get isSimpleWidget(): boolean {…}

	public writeScreenReaderContent(reason: string): void {…}

	public getId(): string {…}

	public getEditorType(): string {…}

	public override dispose(): void {…}

	public invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {…}

	public updateOptions(newOptions: Readonly<IEditorOptions> | undefined): void {…}

	public getOptions(): IComputedEditorOptions {…}

	public getOption<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T> {…}

	public getRawOptions(): IEditorOptions {…}

	public getOverflowWidgetsDomNode(): HTMLElement | undefined {…}

	public getConfiguredWordAtPosition(position: Position): IWordAtPosition | null {…}

	public getValue(options: { preserveBOM: boolean; lineEnding: string } | null = null): string {…}

	public setValue(newValue: string): void {…}

	public getModel(): ITextModel | null {…}

	public setModel(_model: ITextModel | editorCommon.IDiffEditorModel | null = null): void {…}

	public getVisibleRanges(): Range[] {…}

	public getVisibleRangesPlusViewportAboveBelow(): Range[] {…}

	public getWhitespaces(): IEditorWhitespace[] {…}

	public getTopForLineNumber(lineNumber: number, includeViewZones: boolean = false): number {…}

	public getTopForPosition(lineNumber: number, column: number): number {…}

	public getBottomForLineNumber(lineNumber: number, includeViewZones: boolean = false): number {…}

	public setHiddenAreas(ranges: IRange[], source?: unknown): void {…}

	public getVisibleColumnFromPosition(rawPosition: IPosition): number {…}

	public getStatusbarColumn(rawPosition: IPosition): number {…}

	public getPosition(): Position | null {…}

	public setPosition(position: IPosition, source: string = 'api'): void {…}

	public revealLine(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLineInCenter(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLineNearTop(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPosition(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPositionInCenter(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPositionNearTop(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public getSelection(): Selection | null {…}

	public getSelections(): Selection[] | null {…}

	public setSelection(range: IRange, source?: string): void;
	public setSelection(editorRange: Range, source?: string): void;
	public setSelection(selection: ISelection, source?: string): void;
	public setSelection(editorSelection: Selection, source?: string): void;
	public setSelection(something: any, source: string = 'api'): void {…}

	public revealLines(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLinesNearTop(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealRange(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {…}
}

const enum BooleanEventValue {
	NotSet,
	False,
	True
}

export class BooleanEventEmitter extends Disposable {…}

/**
 * A regular event emitter that also makes sure contributions are instantiated if necessary
 */
class InteractionEmitter<T> extends Emitter<T> {…}

class EditorContextKeysManager extends Disposable {…}

export class EditorModeContext extends Disposable {…}

class CodeEditorWidgetFocusTracker extends Disposable {…}

class EditorDecorationsCollection implements editorCommon.IEditorDecorationsCollection {…}

const squigglyStart = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' enable-background='new 0 0 6 3' height='3' width='6'><g fill='`);
const squigglyEnd = encodeURIComponent(`'><polygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><polygon points='4,0 6,2 6,0.6 5.4,0'/><polygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`);

function getSquigglySVGData(color: Color) {…}

const dotdotdotStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" height="3" width="12"><g fill="`);
const dotdotdotEnd = encodeURIComponent(`"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="9" cy="1" r="1"/></g></svg>`);

function getDotDotDotSVGData(color: Color) {…}

registerThemingParticipant((theme, collector) => {…});
