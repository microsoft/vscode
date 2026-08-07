
export class CodeEditorWidget extends Disposable implements editorBrowser.ICodeEditor {
	public readonly onDidChangeModelOptions: Event<IModelOptionsChangedEvent> = this._onDidChangeModelOptions.event;

	private readonly _onDidChangeModelDecorations: Emitter<IModelDecorationsChangedEvent> = this._register(new Emitter<IModelDecorationsChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelDecorations: Event<IModelDecorationsChangedEvent> = this._onDidChangeModelDecorations.event;

	private readonly _onDidChangeModelTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelTokens: Event<IModelTokensChangedEvent> = this._onDidChangeModelTokens.event;

	private readonly _onDidChangeConfiguration: Emitter<ConfigurationChangedEvent> = this._register(new Emitter<ConfigurationChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeConfiguration: Event<ConfigurationChangedEvent> = this._onDidChangeConfiguration.event;

	protected readonly _onDidChangeModel: Emitter<editorCommon.IModelChangedEvent> = this._register(new Emitter<editorCommon.IModelChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModel: Event<editorCommon.IModelChangedEvent> = this._onDidChangeModel.event;

	private readonly _onDidChangeCursorPosition: Emitter<ICursorPositionChangedEvent> = this._register(new Emitter<ICursorPositionChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeCursorPosition: Event<ICursorPositionChangedEvent> = this._onDidChangeCursorPosition.event;

	private readonly _onDidChangeCursorSelection: Emitter<ICursorSelectionChangedEvent> = this._register(new Emitter<ICursorSelectionChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeCursorSelection: Event<ICursorSelectionChangedEvent> = this._onDidChangeCursorSelection.event;

	private readonly _onDidAttemptReadOnlyEdit: Emitter<void> = this._register(new InteractionEmitter<void>(this._contributions, this._deliveryQueue));
	public readonly onDidAttemptReadOnlyEdit: Event<void> = this._onDidAttemptReadOnlyEdit.event;

	private readonly _onDidLayoutChange: Emitter<EditorLayoutInfo> = this._register(new Emitter<EditorLayoutInfo>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidLayoutChange: Event<EditorLayoutInfo> = this._onDidLayoutChange.event;

	private readonly _editorTextFocus: BooleanEventEmitter = this._register(new BooleanEventEmitter({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidFocusEditorText: Event<void> = this._editorTextFocus.onDidChangeToTrue;
	public readonly onDidBlurEditorText: Event<void> = this._editorTextFocus.onDidChangeToFalse;

	private readonly _editorWidgetFocus: BooleanEventEmitter = this._register(new BooleanEventEmitter({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidFocusEditorWidget: Event<void> = this._editorWidgetFocus.onDidChangeToTrue;
	public readonly onDidBlurEditorWidget: Event<void> = this._editorWidgetFocus.onDidChangeToFalse;

	private readonly _onWillType: Emitter<string> = this._register(new InteractionEmitter<string>(this._contributions, this._deliveryQueue));
	public readonly onWillType = this._onWillType.event;

	private readonly _onDidType: Emitter<string> = this._register(new InteractionEmitter<string>(this._contributions, this._deliveryQueue));
	public readonly onDidType = this._onDidType.event;

	private readonly _onDidCompositionStart: Emitter<void> = this._register(new InteractionEmitter<void>(this._contributions, this._deliveryQueue));
	public readonly onDidCompositionStart = this._onDidCompositionStart.event;

	private readonly _onDidCompositionEnd: Emitter<void> = this._register(new InteractionEmitter<void>(this._contributions, this._deliveryQueue));
	public readonly onDidCompositionEnd = this._onDidCompositionEnd.event;

	private readonly _onDidPaste: Emitter<editorBrowser.IPasteEvent> = this._register(new InteractionEmitter<editorBrowser.IPasteEvent>(this._contributions, this._deliveryQueue));
	public readonly onDidPaste = this._onDidPaste.event;

	private readonly _onMouseUp: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseUp: Event<editorBrowser.IEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseDown: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDown.event;

	private readonly _onMouseDrag: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseDrag: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrag.event;

	private readonly _onMouseDrop: Emitter<editorBrowser.IPartialEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IPartialEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseDrop: Event<editorBrowser.IPartialEditorMouseEvent> = this._onMouseDrop.event;

	private readonly _onMouseDropCanceled: Emitter<void> = this._register(new InteractionEmitter<void>(this._contributions, this._deliveryQueue));
	public readonly onMouseDropCanceled: Event<void> = this._onMouseDropCanceled.event;

	private readonly _onDropIntoEditor = this._register(new InteractionEmitter<{ readonly position: IPosition; readonly event: DragEvent }>(this._contributions, this._deliveryQueue));
	public readonly onDropIntoEditor = this._onDropIntoEditor.event;

	private readonly _onContextMenu: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onContextMenu: Event<editorBrowser.IEditorMouseEvent> = this._onContextMenu.event;

	private readonly _onMouseMove: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseMove: Event<editorBrowser.IEditorMouseEvent> = this._onMouseMove.event;

	private readonly _onMouseLeave: Emitter<editorBrowser.IPartialEditorMouseEvent> = this._register(new InteractionEmitter<editorBrowser.IPartialEditorMouseEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseLeave: Event<editorBrowser.IPartialEditorMouseEvent> = this._onMouseLeave.event;

	private readonly _onMouseWheel: Emitter<IMouseWheelEvent> = this._register(new InteractionEmitter<IMouseWheelEvent>(this._contributions, this._deliveryQueue));
	public readonly onMouseWheel: Event<IMouseWheelEvent> = this._onMouseWheel.event;

	private readonly _onKeyUp: Emitter<IKeyboardEvent> = this._register(new InteractionEmitter<IKeyboardEvent>(this._contributions, this._deliveryQueue));
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private readonly _onKeyDown: Emitter<IKeyboardEvent> = this._register(new InteractionEmitter<IKeyboardEvent>(this._contributions, this._deliveryQueue));
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onDidContentSizeChange: Emitter<editorCommon.IContentSizeChangedEvent> = this._register(new Emitter<editorCommon.IContentSizeChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidContentSizeChange: Event<editorCommon.IContentSizeChangedEvent> = this._onDidContentSizeChange.event;

	private readonly _onDidScrollChange: Emitter<editorCommon.IScrollEvent> = this._register(new Emitter<editorCommon.IScrollEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidScrollChange: Event<editorCommon.IScrollEvent> = this._onDidScrollChange.event;

	private readonly _onDidChangeViewZones: Emitter<void> = this._register(new Emitter<void>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeViewZones: Event<void> = this._onDidChangeViewZones.event;

	private readonly _onDidChangeHiddenAreas: Emitter<void> = this._register(new Emitter<void>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeHiddenAreas: Event<void> = this._onDidChangeHiddenAreas.event;
	//#endregion

	public get isSimpleWidget(): boolean {…}

	private readonly _telemetryData?: object;

	private readonly _domElement: HTMLElement;
	private readonly _overflowWidgetsDomNode: HTMLElement | undefined;
	private readonly _id: number;
	private readonly _configuration: IEditorConfiguration;

	protected readonly _actions = new Map<string, editorCommon.IEditorAction>();

	// --- Members logically associated to a model
	protected _modelData: ModelData | null;

	protected readonly _instantiationService: IInstantiationService;
	protected readonly _contextKeyService: IContextKeyService;
	private readonly _notificationService: INotificationService;
	protected readonly _codeEditorService: ICodeEditorService;
	private readonly _commandService: ICommandService;
	private readonly _themeService: IThemeService;

	private readonly _focusTracker: CodeEditorWidgetFocusTracker;

	private _contentWidgets: { [key: string]: IContentWidgetData };
	private _overlayWidgets: { [key: string]: IOverlayWidgetData };
}

