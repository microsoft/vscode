
export class CodeEditorWidget extends Disposable implements editorBrowser.ICodeEditor {

	public revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLineNearTop(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	private _revealLine(lineNumber: number, revealType: VerticalRevealType, scrollType: editorCommon.ScrollType): void {…}

	public revealPosition(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPositionInCenter(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealPositionNearTop(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	private _revealPosition(position: IPosition, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {…}

	public getSelection(): Selection | null {…}

	public getSelections(): Selection[] | null {…}

	public setSelection(range: IRange, source?: string): void;
	public setSelection(editorRange: Range, source?: string): void;
	public setSelection(selection: ISelection, source?: string): void;
	public setSelection(editorSelection: Selection, source?: string): void;
	public setSelection(something: any, source: string = 'api'): void {…}

	private _setSelectionImpl(sel: ISelection, source: string): void {…}

	public revealLines(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealLinesNearTop(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	private _revealLines(startLineNumber: number, endLineNumber: number, verticalType: VerticalRevealType, scrollType: editorCommon.ScrollType): void {…}

	public revealRange(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {…}

	public revealRangeInCenter(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealRangeInCenterIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealRangeNearTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealRangeNearTopIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	public revealRangeAtTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {…}

	private _revealRange(range: IRange, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {…}

	public setSelections(ranges: readonly ISelection[], source: string = 'api', reason = CursorChangeReason.NotSet): void {…}

	public getContentWidth(): number {…}

	public getScrollWidth(): number {…}
	public getScrollLeft(): number {…}

	public getContentHeight(): number {…}

	public getScrollHeight(): number {…}
	public getScrollTop(): number {…}

	public setScrollLeft(newScrollLeft: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Immediate): void {…}
	public setScrollTop(newScrollTop: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Immediate): void {
		this._modelData.viewModel.viewLayout.setScrollPosition({
			scrollTop: newScrollTop
		}, scrollType);
	}
	public setScrollPosition(position: editorCommon.INewScrollPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Immediate): void {
		if (!this._modelData) {…}
		this._modelData.viewModel.viewLayout.setScrollPosition(position, scrollType);
	}
	public hasPendingScrollAnimation(): boolean {
		if (!this._modelData) {…}
		return this._modelData.viewModel.viewLayout.hasPendingScrollAnimation();
	}

	public saveViewState(): editorCommon.ICodeEditorViewState | null {
		if (!this._modelData) {…}
		const contributionsState = this._contributions.saveViewState();
		const cursorState = this._modelData.viewModel.saveCursorState();
		const viewState = this._modelData.viewModel.saveState();
		return {
			cursorState: cursorState,
			viewState: viewState,
			contributionsState: contributionsState
		};
	}

	public restoreViewState(s: editorCommon.IEditorViewState | null): void {
		if (!this._modelData || !this._modelData.hasRealView) {…}
		const codeEditorState = s as editorCommon.ICodeEditorViewState | null;
		if (codeEditorState && codeEditorState.cursorState && codeEditorState.viewState) {…}
	}

	public onVisible(): void {
		this._modelData?.view.refreshFocusState();
	}

	public onHide(): void {
		this._modelData?.view.refreshFocusState();
		this._focusTracker.refreshState();
	}

	public getContribution<T extends editorCommon.IEditorContribution>(id: string): T | null {
		return this._contributions.get(id) as T | null;
	}

	public getActions(): editorCommon.IEditorAction[] {
		return Array.from(this._actions.values());
	}

	public getSupportedActions(): editorCommon.IEditorAction[] {
		let result = this.getActions();

		result = result.filter(action => action.isSupported());

		return result;
	}

	public getAction(id: string): editorCommon.IEditorAction | null {
		return this._actions.get(id) || null;
	}

	public trigger(source: string | null | undefined, handlerId: string, payload: any): void {
		payload = payload || {};

		switch (handlerId) {
			case editorCommon.Handler.CompositionStart:
				this._startComposition();
				return;
			case editorCommon.Handler.CompositionEnd:
				this._endComposition(source);
				return;
			case editorCommon.Handler.Type: {
				const args = <Partial<editorCommon.TypePayload>>payload;
				this._type(source, args.text || '');
				return;
			}
			case editorCommon.Handler.ReplacePreviousChar: {
				const args = <Partial<editorCommon.ReplacePreviousCharPayload>>payload;
				this._compositionType(source, args.text || '', args.replaceCharCnt || 0, 0, 0);
				return;
			}
			case editorCommon.Handler.CompositionType: {
				const args = <Partial<editorCommon.CompositionTypePayload>>payload;
				this._compositionType(source, args.text || '', args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0);
				return;
			}
			case editorCommon.Handler.Paste: {
				const args = <Partial<editorCommon.PastePayload>>payload;
				this._paste(source, args.text || '', args.pasteOnNewLine || false, args.multicursorText || null, args.mode || null);
				return;
			}
			case editorCommon.Handler.Cut:
				this._cut(source);
				return;
		}

		const action = this.getAction(handlerId);
		if (action) {
			Promise.resolve(action.run(payload)).then(undefined, onUnexpectedError);
			return;
		}

		if (!this._modelData) {
			return;
		}

		if (this._triggerEditorCommand(source, handlerId, payload)) {
			return;
		}

		this._triggerCommand(handlerId, payload);
	}

	protected _triggerCommand(handlerId: string, payload: any): void {
		this._commandService.executeCommand(handlerId, payload);
	}

	private _startComposition(): void {
		if (!this._modelData) {…}
		this._modelData.viewModel.startComposition();
		this._onDidCompositionStart.fire();
	}

	private _endComposition(source: string | null | undefined): void {
		if (!this._modelData) {…}
		this._modelData.viewModel.endComposition(source);
		this._onDidCompositionEnd.fire();
	}

	private _type(source: string | null | undefined, text: string): void {
		if (!this._modelData || text.length === 0) {…}
		if (source === 'keyboard') {…}
		this._modelData.viewModel.type(text, source);
		if (source === 'keyboard') {…}
	}

	private _compositionType(source: string | null | undefined, text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number): void {
		if (!this._modelData) {…}
		this._modelData.viewModel.compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source);
	}

	private _paste(source: string | null | undefined, text: string, pasteOnNewLine: boolean, multicursorText: string[] | null, mode: string | null): void {…}

	private _cut(source: string | null | undefined): void {…}

	private _triggerEditorCommand(source: string | null | undefined, handlerId: string, payload: any): boolean {…}

	public _getViewModel(): IViewModel | null {…}

	public pushUndoStop(): boolean {…}

	public popUndoStop(): boolean {…}

	public executeEdits(source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], endCursorState?: ICursorStateComputer | Selection[]): boolean {…}

	public executeCommand(source: string | null | undefined, command: editorCommon.ICommand): void {…}

	public executeCommands(source: string | null | undefined, commands: editorCommon.ICommand[]): void {…}
}

