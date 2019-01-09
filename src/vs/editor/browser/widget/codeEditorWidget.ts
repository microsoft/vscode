/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editor';
import 'vs/css!./media/tokens';
import * as nls from 'vs/nls';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { Color } from 'vs/base/common/color';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { hash } from 'vs/base/common/hash';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { Configuration } from 'vs/editor/browser/config/configuration';
import { CoreEditorCommand } from 'vs/editor/browser/controller/coreCommands';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { EditorExtensionsRegistry, IEditorContributionCtor } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICommandDelegate } from 'vs/editor/browser/view/viewController';
import { IContentWidgetData, IOverlayWidgetData, View } from 'vs/editor/browser/view/viewImpl';
import { ViewOutgoingEvents } from 'vs/editor/browser/view/viewOutgoingEvents';
import * as editorOptions from 'vs/editor/common/config/editorOptions';
import { Cursor, CursorStateChangedEvent } from 'vs/editor/common/controller/cursor';
import { CursorColumns, ICursors } from 'vs/editor/common/controller/cursorCommon';
import { ICursorPositionChangedEvent, ICursorSelectionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { ISelection, Selection } from 'vs/editor/common/core/selection';
import { InternalEditorAction } from 'vs/editor/common/editorAction';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { EndOfLinePreference, IIdentifiedSingleEditOperation, IModelDecoration, IModelDecorationOptions, IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel } from 'vs/editor/common/model';
import { ClassName } from 'vs/editor/common/model/intervalTree';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelContentChangedEvent, IModelDecorationsChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelOptionsChangedEvent } from 'vs/editor/common/model/textModelEvents';
import * as modes from 'vs/editor/common/modes';
import { editorErrorBorder, editorErrorForeground, editorHintBorder, editorHintForeground, editorInfoBorder, editorInfoForeground, editorUnnecessaryCodeBorder, editorUnnecessaryCodeOpacity, editorWarningBorder, editorWarningForeground } from 'vs/editor/common/view/editorColorRegistry';
import { VerticalRevealType } from 'vs/editor/common/view/viewEvents';
import { IEditorWhitespace } from 'vs/editor/common/viewLayout/whitespaceComputer';
import { ViewModel } from 'vs/editor/common/viewModel/viewModelImpl';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';

let EDITOR_ID = 0;

const SHOW_UNUSED_ENABLED_CLASS = 'showUnused';

export interface ICodeEditorWidgetOptions {
	/**
	 * Is this a simple widget (not a real code editor) ?
	 * Defaults to false.
	 */
	isSimpleWidget?: boolean;

	/**
	 * Contributions to instantiate.
	 * Defaults to EditorExtensionsRegistry.getEditorContributions().
	 */
	contributions?: IEditorContributionCtor[];

	/**
	 * Telemetry data associated with this CodeEditorWidget.
	 * Defaults to null.
	 */
	telemetryData?: object;
}

class ModelData {
	public readonly model: ITextModel;
	public readonly viewModel: ViewModel;
	public readonly cursor: Cursor;
	public readonly view: View;
	public readonly hasRealView: boolean;
	public readonly listenersToRemove: IDisposable[];

	constructor(model: ITextModel, viewModel: ViewModel, cursor: Cursor, view: View, hasRealView: boolean, listenersToRemove: IDisposable[]) {
		this.model = model;
		this.viewModel = viewModel;
		this.cursor = cursor;
		this.view = view;
		this.hasRealView = hasRealView;
		this.listenersToRemove = listenersToRemove;
	}

	public dispose(): void {
		dispose(this.listenersToRemove);
		this.model.onBeforeDetached();
		if (this.hasRealView) {
			this.view.dispose();
		}
		this.cursor.dispose();
		this.viewModel.dispose();
	}
}

export class CodeEditorWidget extends Disposable implements editorBrowser.ICodeEditor {

	//#region Eventing
	private readonly _onDidDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly _onDidChangeModelContent: Emitter<IModelContentChangedEvent> = this._register(new Emitter<IModelContentChangedEvent>());
	public readonly onDidChangeModelContent: Event<IModelContentChangedEvent> = this._onDidChangeModelContent.event;

	private readonly _onDidChangeModelLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>());
	public readonly onDidChangeModelLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeModelLanguage.event;

	private readonly _onDidChangeModelLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
	public readonly onDidChangeModelLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeModelLanguageConfiguration.event;

	private readonly _onDidChangeModelOptions: Emitter<IModelOptionsChangedEvent> = this._register(new Emitter<IModelOptionsChangedEvent>());
	public readonly onDidChangeModelOptions: Event<IModelOptionsChangedEvent> = this._onDidChangeModelOptions.event;

	private readonly _onDidChangeModelDecorations: Emitter<IModelDecorationsChangedEvent> = this._register(new Emitter<IModelDecorationsChangedEvent>());
	public readonly onDidChangeModelDecorations: Event<IModelDecorationsChangedEvent> = this._onDidChangeModelDecorations.event;

	private readonly _onDidChangeConfiguration: Emitter<editorOptions.IConfigurationChangedEvent> = this._register(new Emitter<editorOptions.IConfigurationChangedEvent>());
	public readonly onDidChangeConfiguration: Event<editorOptions.IConfigurationChangedEvent> = this._onDidChangeConfiguration.event;

	protected readonly _onDidChangeModel: Emitter<editorCommon.IModelChangedEvent> = this._register(new Emitter<editorCommon.IModelChangedEvent>());
	public readonly onDidChangeModel: Event<editorCommon.IModelChangedEvent> = this._onDidChangeModel.event;

	private readonly _onDidChangeCursorPosition: Emitter<ICursorPositionChangedEvent> = this._register(new Emitter<ICursorPositionChangedEvent>());
	public readonly onDidChangeCursorPosition: Event<ICursorPositionChangedEvent> = this._onDidChangeCursorPosition.event;

	private readonly _onDidChangeCursorSelection: Emitter<ICursorSelectionChangedEvent> = this._register(new Emitter<ICursorSelectionChangedEvent>());
	public readonly onDidChangeCursorSelection: Event<ICursorSelectionChangedEvent> = this._onDidChangeCursorSelection.event;

	private readonly _onDidAttemptReadOnlyEdit: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidAttemptReadOnlyEdit: Event<void> = this._onDidAttemptReadOnlyEdit.event;

	private readonly _onDidLayoutChange: Emitter<editorOptions.EditorLayoutInfo> = this._register(new Emitter<editorOptions.EditorLayoutInfo>());
	public readonly onDidLayoutChange: Event<editorOptions.EditorLayoutInfo> = this._onDidLayoutChange.event;

	private _editorTextFocus: BooleanEventEmitter = this._register(new BooleanEventEmitter());
	public readonly onDidFocusEditorText: Event<void> = this._editorTextFocus.onDidChangeToTrue;
	public readonly onDidBlurEditorText: Event<void> = this._editorTextFocus.onDidChangeToFalse;

	private _editorWidgetFocus: BooleanEventEmitter = this._register(new BooleanEventEmitter());
	public readonly onDidFocusEditorWidget: Event<void> = this._editorWidgetFocus.onDidChangeToTrue;
	public readonly onDidBlurEditorWidget: Event<void> = this._editorWidgetFocus.onDidChangeToFalse;

	private readonly _onWillType: Emitter<string> = this._register(new Emitter<string>());
	public readonly onWillType = this._onWillType.event;

	private readonly _onDidType: Emitter<string> = this._register(new Emitter<string>());
	public readonly onDidType = this._onDidType.event;

	private readonly _onCompositionStart: Emitter<void> = this._register(new Emitter<void>());
	public readonly onCompositionStart = this._onCompositionStart.event;

	private readonly _onCompositionEnd: Emitter<void> = this._register(new Emitter<void>());
	public readonly onCompositionEnd = this._onCompositionEnd.event;

	private readonly _onDidPaste: Emitter<Range> = this._register(new Emitter<Range>());
	public readonly onDidPaste = this._onDidPaste.event;

	private readonly _onMouseUp: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseUp: Event<editorBrowser.IEditorMouseEvent> = this._onMouseUp.event;

	private readonly _onMouseDown: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDown: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDown.event;

	private readonly _onMouseDrag: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseDrag: Event<editorBrowser.IEditorMouseEvent> = this._onMouseDrag.event;

	private readonly _onMouseDrop: Emitter<editorBrowser.IPartialEditorMouseEvent> = this._register(new Emitter<editorBrowser.IPartialEditorMouseEvent>());
	public readonly onMouseDrop: Event<editorBrowser.IPartialEditorMouseEvent> = this._onMouseDrop.event;

	private readonly _onContextMenu: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onContextMenu: Event<editorBrowser.IEditorMouseEvent> = this._onContextMenu.event;

	private readonly _onMouseMove: Emitter<editorBrowser.IEditorMouseEvent> = this._register(new Emitter<editorBrowser.IEditorMouseEvent>());
	public readonly onMouseMove: Event<editorBrowser.IEditorMouseEvent> = this._onMouseMove.event;

	private readonly _onMouseLeave: Emitter<editorBrowser.IPartialEditorMouseEvent> = this._register(new Emitter<editorBrowser.IPartialEditorMouseEvent>());
	public readonly onMouseLeave: Event<editorBrowser.IPartialEditorMouseEvent> = this._onMouseLeave.event;

	private readonly _onKeyUp: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyUp: Event<IKeyboardEvent> = this._onKeyUp.event;

	private readonly _onKeyDown: Emitter<IKeyboardEvent> = this._register(new Emitter<IKeyboardEvent>());
	public readonly onKeyDown: Event<IKeyboardEvent> = this._onKeyDown.event;

	private readonly _onDidScrollChange: Emitter<editorCommon.IScrollEvent> = this._register(new Emitter<editorCommon.IScrollEvent>());
	public readonly onDidScrollChange: Event<editorCommon.IScrollEvent> = this._onDidScrollChange.event;

	private readonly _onDidChangeViewZones: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeViewZones: Event<void> = this._onDidChangeViewZones.event;
	//#endregion

	public readonly isSimpleWidget: boolean;
	private readonly _telemetryData?: object;

	private readonly _domElement: HTMLElement;
	private readonly _id: number;
	private readonly _configuration: editorCommon.IConfiguration;

	protected readonly _contributions: { [key: string]: editorCommon.IEditorContribution; };
	protected readonly _actions: { [key: string]: editorCommon.IEditorAction; };

	// --- Members logically associated to a model
	protected _modelData: ModelData | null;

	protected readonly _instantiationService: IInstantiationService;
	protected readonly _contextKeyService: IContextKeyService;
	private readonly _notificationService: INotificationService;
	private readonly _codeEditorService: ICodeEditorService;
	private readonly _commandService: ICommandService;
	private readonly _themeService: IThemeService;

	private readonly _focusTracker: CodeEditorWidgetFocusTracker;

	private readonly _contentWidgets: { [key: string]: IContentWidgetData; };
	private readonly _overlayWidgets: { [key: string]: IOverlayWidgetData; };

	/**
	 * map from "parent" decoration type to live decoration ids.
	 */
	private _decorationTypeKeysToIds: { [decorationTypeKey: string]: string[] };
	private _decorationTypeSubtypes: { [decorationTypeKey: string]: { [subtype: string]: boolean } };

	constructor(
		domElement: HTMLElement,
		options: editorOptions.IEditorOptions,
		codeEditorWidgetOptions: ICodeEditorWidgetOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService
	) {
		super();
		this._domElement = domElement;
		this._id = (++EDITOR_ID);
		this._decorationTypeKeysToIds = {};
		this._decorationTypeSubtypes = {};
		this.isSimpleWidget = codeEditorWidgetOptions.isSimpleWidget || false;
		this._telemetryData = codeEditorWidgetOptions.telemetryData;

		options = options || {};
		this._configuration = this._register(this._createConfiguration(options));
		this._register(this._configuration.onDidChange((e) => {
			this._onDidChangeConfiguration.fire(e);

			if (e.layoutInfo) {
				this._onDidLayoutChange.fire(this._configuration.editor.layoutInfo);
			}
			if (this._configuration.editor.showUnused) {
				this._domElement.classList.add(SHOW_UNUSED_ENABLED_CLASS);
			} else {
				this._domElement.classList.remove(SHOW_UNUSED_ENABLED_CLASS);
			}
		}));

		this._contextKeyService = this._register(contextKeyService.createScoped(this._domElement));
		this._notificationService = notificationService;
		this._codeEditorService = codeEditorService;
		this._commandService = commandService;
		this._themeService = themeService;
		this._register(new EditorContextKeysManager(this, this._contextKeyService));
		this._register(new EditorModeContext(this, this._contextKeyService));

		this._instantiationService = instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService]));

		this._attachModel(null);

		this._contributions = {};
		this._actions = {};

		this._focusTracker = new CodeEditorWidgetFocusTracker(domElement);
		this._focusTracker.onChange(() => {
			this._editorWidgetFocus.setValue(this._focusTracker.hasFocus());
		});

		this._contentWidgets = {};
		this._overlayWidgets = {};

		let contributions: IEditorContributionCtor[];
		if (Array.isArray(codeEditorWidgetOptions.contributions)) {
			contributions = codeEditorWidgetOptions.contributions;
		} else {
			contributions = EditorExtensionsRegistry.getEditorContributions();
		}
		for (let i = 0, len = contributions.length; i < len; i++) {
			let ctor = contributions[i];
			try {
				let contribution = this._instantiationService.createInstance(ctor, this);
				this._contributions[contribution.getId()] = contribution;
			} catch (err) {
				onUnexpectedError(err);
			}
		}

		EditorExtensionsRegistry.getEditorActions().forEach((action) => {
			const internalAction = new InternalEditorAction(
				action.id,
				action.label,
				action.alias,
				action.precondition,
				(): Promise<void> => {
					return this._instantiationService.invokeFunction((accessor) => {
						return Promise.resolve(action.runEditorCommand(accessor, this, null));
					});
				},
				this._contextKeyService
			);
			this._actions[internalAction.id] = internalAction;
		});

		this._codeEditorService.addCodeEditor(this);
	}

	protected _createConfiguration(options: editorOptions.IEditorOptions): editorCommon.IConfiguration {
		return new Configuration(options, this._domElement);
	}

	public getId(): string {
		return this.getEditorType() + ':' + this._id;
	}

	public getEditorType(): string {
		return editorCommon.EditorType.ICodeEditor;
	}

	public dispose(): void {
		this._codeEditorService.removeCodeEditor(this);

		this._focusTracker.dispose();

		let keys = Object.keys(this._contributions);
		for (let i = 0, len = keys.length; i < len; i++) {
			let contributionId = keys[i];
			this._contributions[contributionId].dispose();
		}

		this._removeDecorationTypes();
		this._postDetachModelCleanup(this._detachModel());

		this._onDidDispose.fire();

		super.dispose();
	}

	public invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		return this._instantiationService.invokeFunction(fn);
	}

	public updateOptions(newOptions: editorOptions.IEditorOptions): void {
		this._configuration.updateOptions(newOptions);
	}

	public getConfiguration(): editorOptions.InternalEditorOptions {
		return this._configuration.editor;
	}

	public getRawConfiguration(): editorOptions.IEditorOptions {
		return this._configuration.getRawOptions();
	}

	public getValue(options: { preserveBOM: boolean; lineEnding: string; } | null = null): string {
		if (!this._modelData) {
			return '';
		}

		let preserveBOM: boolean = (options && options.preserveBOM) ? true : false;
		let eolPreference = EndOfLinePreference.TextDefined;
		if (options && options.lineEnding && options.lineEnding === '\n') {
			eolPreference = EndOfLinePreference.LF;
		} else if (options && options.lineEnding && options.lineEnding === '\r\n') {
			eolPreference = EndOfLinePreference.CRLF;
		}
		return this._modelData.model.getValue(eolPreference, preserveBOM);
	}

	public setValue(newValue: string): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.model.setValue(newValue);
	}

	public getModel(): ITextModel | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.model;
	}

	public setModel(_model: ITextModel | editorCommon.IDiffEditorModel | null = null): void {
		const model = <ITextModel | null>_model;
		if (this._modelData === null && model === null) {
			// Current model is the new model
			return;
		}
		if (this._modelData && this._modelData.model === model) {
			// Current model is the new model
			return;
		}

		let detachedModel = this._detachModel();
		this._attachModel(model);

		let e: editorCommon.IModelChangedEvent = {
			oldModelUrl: detachedModel ? detachedModel.uri : null,
			newModelUrl: model ? model.uri : null
		};

		this._removeDecorationTypes();
		this._onDidChangeModel.fire(e);
		this._postDetachModelCleanup(detachedModel);
	}

	private _removeDecorationTypes(): void {
		this._decorationTypeKeysToIds = {};
		if (this._decorationTypeSubtypes) {
			for (let decorationType in this._decorationTypeSubtypes) {
				let subTypes = this._decorationTypeSubtypes[decorationType];
				for (let subType in subTypes) {
					this._removeDecorationType(decorationType + '-' + subType);
				}
			}
			this._decorationTypeSubtypes = {};
		}
	}

	public getVisibleRanges(): Range[] {
		if (!this._modelData) {
			return [];
		}
		return this._modelData.viewModel.getVisibleRanges();
	}

	public getWhitespaces(): IEditorWhitespace[] {
		if (!this._modelData) {
			return [];
		}
		return this._modelData.viewModel.viewLayout.getWhitespaces();
	}

	private static _getVerticalOffsetForPosition(modelData: ModelData, modelLineNumber: number, modelColumn: number): number {
		let modelPosition = modelData.model.validatePosition({
			lineNumber: modelLineNumber,
			column: modelColumn
		});
		let viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		return modelData.viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
	}

	public getTopForLineNumber(lineNumber: number): number {
		if (!this._modelData) {
			return -1;
		}
		return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, 1);
	}

	public getTopForPosition(lineNumber: number, column: number): number {
		if (!this._modelData) {
			return -1;
		}
		return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, column);
	}

	public setHiddenAreas(ranges: IRange[]): void {
		if (this._modelData) {
			this._modelData.viewModel.setHiddenAreas(ranges.map(r => Range.lift(r)));
		}
	}

	public getVisibleColumnFromPosition(rawPosition: IPosition): number {
		if (!this._modelData) {
			return rawPosition.column;
		}

		let position = this._modelData.model.validatePosition(rawPosition);
		let tabSize = this._modelData.model.getOptions().tabSize;

		return CursorColumns.visibleColumnFromColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize) + 1;
	}

	public getPosition(): Position | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.cursor.getPosition();
	}

	public setPosition(position: IPosition): void {
		if (!this._modelData) {
			return;
		}
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._modelData.cursor.setSelections('api', [{
			selectionStartLineNumber: position.lineNumber,
			selectionStartColumn: position.column,
			positionLineNumber: position.lineNumber,
			positionColumn: position.column
		}]);
	}

	private _sendRevealRange(modelRange: Range, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
		if (!this._modelData) {
			return;
		}
		if (!Range.isIRange(modelRange)) {
			throw new Error('Invalid arguments');
		}
		const validatedModelRange = this._modelData.model.validateRange(modelRange);
		const viewRange = this._modelData.viewModel.coordinatesConverter.convertModelRangeToViewRange(validatedModelRange);

		this._modelData.cursor.emitCursorRevealRange(viewRange, verticalType, revealHorizontal, scrollType);
	}

	public revealLine(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLine(lineNumber, VerticalRevealType.Simple, scrollType);
	}

	public revealLineInCenter(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLine(lineNumber, VerticalRevealType.Center, scrollType);
	}

	public revealLineInCenterIfOutsideViewport(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLine(lineNumber, VerticalRevealType.CenterIfOutsideViewport, scrollType);
	}

	private _revealLine(lineNumber: number, revealType: VerticalRevealType, scrollType: editorCommon.ScrollType): void {
		if (typeof lineNumber !== 'number') {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			new Range(lineNumber, 1, lineNumber, 1),
			revealType,
			false,
			scrollType
		);
	}

	public revealPosition(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealPosition(
			position,
			VerticalRevealType.Simple,
			true,
			scrollType
		);
	}

	public revealPositionInCenter(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealPosition(
			position,
			VerticalRevealType.Center,
			true,
			scrollType
		);
	}

	public revealPositionInCenterIfOutsideViewport(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealPosition(
			position,
			VerticalRevealType.CenterIfOutsideViewport,
			true,
			scrollType
		);
	}

	private _revealPosition(position: IPosition, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			verticalType,
			revealHorizontal,
			scrollType
		);
	}

	public getSelection(): Selection | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.cursor.getSelection();
	}

	public getSelections(): Selection[] | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.cursor.getSelections();
	}

	public setSelection(range: IRange): void;
	public setSelection(editorRange: Range): void;
	public setSelection(selection: ISelection): void;
	public setSelection(editorSelection: Selection): void;
	public setSelection(something: any): void {
		let isSelection = Selection.isISelection(something);
		let isRange = Range.isIRange(something);

		if (!isSelection && !isRange) {
			throw new Error('Invalid arguments');
		}

		if (isSelection) {
			this._setSelectionImpl(<ISelection>something);
		} else if (isRange) {
			// act as if it was an IRange
			let selection: ISelection = {
				selectionStartLineNumber: something.startLineNumber,
				selectionStartColumn: something.startColumn,
				positionLineNumber: something.endLineNumber,
				positionColumn: something.endColumn
			};
			this._setSelectionImpl(selection);
		}
	}

	private _setSelectionImpl(sel: ISelection): void {
		if (!this._modelData) {
			return;
		}
		let selection = new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
		this._modelData.cursor.setSelections('api', [selection]);
	}

	public revealLines(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			VerticalRevealType.Simple,
			scrollType
		);
	}

	public revealLinesInCenter(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			VerticalRevealType.Center,
			scrollType
		);
	}

	public revealLinesInCenterIfOutsideViewport(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			VerticalRevealType.CenterIfOutsideViewport,
			scrollType
		);
	}

	private _revealLines(startLineNumber: number, endLineNumber: number, verticalType: VerticalRevealType, scrollType: editorCommon.ScrollType): void {
		if (typeof startLineNumber !== 'number' || typeof endLineNumber !== 'number') {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			new Range(startLineNumber, 1, endLineNumber, 1),
			verticalType,
			false,
			scrollType
		);
	}

	public revealRange(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter: boolean = false, revealHorizontal: boolean = true): void {
		this._revealRange(
			range,
			revealVerticalInCenter ? VerticalRevealType.Center : VerticalRevealType.Simple,
			revealHorizontal,
			scrollType
		);
	}

	public revealRangeInCenter(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealRange(
			range,
			VerticalRevealType.Center,
			true,
			scrollType
		);
	}

	public revealRangeInCenterIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealRange(
			range,
			VerticalRevealType.CenterIfOutsideViewport,
			true,
			scrollType
		);
	}

	public revealRangeAtTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealRange(
			range,
			VerticalRevealType.Top,
			true,
			scrollType
		);
	}

	private _revealRange(range: IRange, verticalType: VerticalRevealType, revealHorizontal: boolean, scrollType: editorCommon.ScrollType): void {
		if (!Range.isIRange(range)) {
			throw new Error('Invalid arguments');
		}

		this._sendRevealRange(
			Range.lift(range),
			verticalType,
			revealHorizontal,
			scrollType
		);
	}

	public setSelections(ranges: ISelection[], source: string = 'api'): void {
		if (!this._modelData) {
			return;
		}
		if (!ranges || ranges.length === 0) {
			throw new Error('Invalid arguments');
		}
		for (let i = 0, len = ranges.length; i < len; i++) {
			if (!Selection.isISelection(ranges[i])) {
				throw new Error('Invalid arguments');
			}
		}
		this._modelData.cursor.setSelections(source, ranges);
	}

	public getScrollWidth(): number {
		if (!this._modelData) {
			return -1;
		}
		return this._modelData.viewModel.viewLayout.getScrollWidth();
	}
	public getScrollLeft(): number {
		if (!this._modelData) {
			return -1;
		}
		return this._modelData.viewModel.viewLayout.getCurrentScrollLeft();
	}

	public getScrollHeight(): number {
		if (!this._modelData) {
			return -1;
		}
		return this._modelData.viewModel.viewLayout.getScrollHeight();
	}
	public getScrollTop(): number {
		if (!this._modelData) {
			return -1;
		}
		return this._modelData.viewModel.viewLayout.getCurrentScrollTop();
	}

	public setScrollLeft(newScrollLeft: number): void {
		if (!this._modelData) {
			return;
		}
		if (typeof newScrollLeft !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._modelData.viewModel.viewLayout.setScrollPositionNow({
			scrollLeft: newScrollLeft
		});
	}
	public setScrollTop(newScrollTop: number): void {
		if (!this._modelData) {
			return;
		}
		if (typeof newScrollTop !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._modelData.viewModel.viewLayout.setScrollPositionNow({
			scrollTop: newScrollTop
		});
	}
	public setScrollPosition(position: editorCommon.INewScrollPosition): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.viewLayout.setScrollPositionNow(position);
	}

	public saveViewState(): editorCommon.ICodeEditorViewState | null {
		if (!this._modelData) {
			return null;
		}
		const contributionsState: { [key: string]: any } = {};

		const keys = Object.keys(this._contributions);
		for (let i = 0, len = keys.length; i < len; i++) {
			const id = keys[i];
			const contribution = this._contributions[id];
			if (typeof contribution.saveViewState === 'function') {
				contributionsState[id] = contribution.saveViewState();
			}
		}

		const cursorState = this._modelData.cursor.saveState();
		const viewState = this._modelData.viewModel.saveState();
		return {
			cursorState: cursorState,
			viewState: viewState,
			contributionsState: contributionsState
		};
	}

	public restoreViewState(s: editorCommon.IEditorViewState | null): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		const codeEditorState = s as editorCommon.ICodeEditorViewState | null;
		if (codeEditorState && codeEditorState.cursorState && codeEditorState.viewState) {
			let cursorState = <any>codeEditorState.cursorState;
			if (Array.isArray(cursorState)) {
				this._modelData.cursor.restoreState(<editorCommon.ICursorState[]>cursorState);
			} else {
				// Backwards compatibility
				this._modelData.cursor.restoreState([<editorCommon.ICursorState>cursorState]);
			}

			let contributionsState = codeEditorState.contributionsState || {};
			let keys = Object.keys(this._contributions);
			for (let i = 0, len = keys.length; i < len; i++) {
				let id = keys[i];
				let contribution = this._contributions[id];
				if (typeof contribution.restoreViewState === 'function') {
					contribution.restoreViewState(contributionsState[id]);
				}
			}

			const reducedState = this._modelData.viewModel.reduceRestoreState(codeEditorState.viewState);
			const linesViewportData = this._modelData.viewModel.viewLayout.getLinesViewportDataAtScrollTop(reducedState.scrollTop);
			const startPosition = this._modelData.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(linesViewportData.startLineNumber, 1));
			const endPosition = this._modelData.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(linesViewportData.endLineNumber, 1));
			this._modelData.model.tokenizeViewport(startPosition.lineNumber, endPosition.lineNumber);
			this._modelData.view.restoreState(reducedState);
		}
	}

	public onVisible(): void {
	}

	public onHide(): void {
	}

	public getContribution<T extends editorCommon.IEditorContribution>(id: string): T {
		return <T>(this._contributions[id] || null);
	}

	public getActions(): editorCommon.IEditorAction[] {
		let result: editorCommon.IEditorAction[] = [];

		let keys = Object.keys(this._actions);
		for (let i = 0, len = keys.length; i < len; i++) {
			let id = keys[i];
			result.push(this._actions[id]);
		}

		return result;
	}

	public getSupportedActions(): editorCommon.IEditorAction[] {
		let result = this.getActions();

		result = result.filter(action => action.isSupported());

		return result;
	}

	public getAction(id: string): editorCommon.IEditorAction {
		return this._actions[id] || null;
	}

	public trigger(source: string, handlerId: string, payload: any): void {
		payload = payload || {};

		// Special case for typing
		if (handlerId === editorCommon.Handler.Type) {
			if (!this._modelData || typeof payload.text !== 'string' || payload.text.length === 0) {
				// nothing to do
				return;
			}
			if (source === 'keyboard') {
				this._onWillType.fire(payload.text);
			}
			this._modelData.cursor.trigger(source, handlerId, payload);
			if (source === 'keyboard') {
				this._onDidType.fire(payload.text);
			}
			return;
		}

		// Special case for pasting
		if (handlerId === editorCommon.Handler.Paste) {
			if (!this._modelData || typeof payload.text !== 'string' || payload.text.length === 0) {
				// nothing to do
				return;
			}
			const startPosition = this._modelData.cursor.getSelection().getStartPosition();
			this._modelData.cursor.trigger(source, handlerId, payload);
			const endPosition = this._modelData.cursor.getSelection().getStartPosition();
			if (source === 'keyboard') {
				this._onDidPaste.fire(
					new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column)
				);
			}
			return;
		}

		if (handlerId === editorCommon.Handler.CompositionStart) {
			this._onCompositionStart.fire();
		}
		if (handlerId === editorCommon.Handler.CompositionEnd) {
			this._onCompositionEnd.fire();
		}

		const action = this.getAction(handlerId);
		if (action) {
			Promise.resolve(action.run()).then(undefined, onUnexpectedError);
			return;
		}

		if (!this._modelData) {
			return;
		}

		if (this._triggerEditorCommand(source, handlerId, payload)) {
			return;
		}

		this._modelData.cursor.trigger(source, handlerId, payload);
	}

	private _triggerEditorCommand(source: string, handlerId: string, payload: any): boolean {
		const command = EditorExtensionsRegistry.getEditorCommand(handlerId);
		if (command) {
			payload = payload || {};
			payload.source = source;
			this._instantiationService.invokeFunction((accessor) => {
				Promise.resolve(command.runEditorCommand(accessor, this, payload)).then(undefined, onUnexpectedError);
			});
			return true;
		}

		return false;
	}

	public _getCursors(): ICursors | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.cursor;
	}

	public pushUndoStop(): boolean {
		if (!this._modelData) {
			return false;
		}
		if (this._configuration.editor.readOnly) {
			// read only editor => sorry!
			return false;
		}
		this._modelData.model.pushStackElement();
		return true;
	}

	public executeEdits(source: string, edits: IIdentifiedSingleEditOperation[], endCursorState?: Selection[]): boolean {
		if (!this._modelData) {
			return false;
		}
		if (this._configuration.editor.readOnly) {
			// read only editor => sorry!
			return false;
		}

		this._modelData.model.pushEditOperations(this._modelData.cursor.getSelections(), edits, () => {
			return endCursorState ? endCursorState : null;
		});

		if (endCursorState) {
			this._modelData.cursor.setSelections(source, endCursorState);
		}

		return true;
	}

	public executeCommand(source: string, command: editorCommon.ICommand): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.cursor.trigger(source, editorCommon.Handler.ExecuteCommand, command);
	}

	public executeCommands(source: string, commands: editorCommon.ICommand[]): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.cursor.trigger(source, editorCommon.Handler.ExecuteCommands, commands);
	}

	public changeDecorations(callback: (changeAccessor: IModelDecorationsChangeAccessor) => any): any {
		if (!this._modelData) {
			// callback will not be called
			return null;
		}
		return this._modelData.model.changeDecorations(callback, this._id);
	}

	public getLineDecorations(lineNumber: number): IModelDecoration[] | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.model.getLineDecorations(lineNumber, this._id, this._configuration.editor.readOnly);
	}

	public deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[] {
		if (!this._modelData) {
			return [];
		}

		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			return oldDecorations;
		}

		return this._modelData.model.deltaDecorations(oldDecorations, newDecorations, this._id);
	}

	public setDecorations(decorationTypeKey: string, decorationOptions: editorCommon.IDecorationOptions[]): void {

		let newDecorationsSubTypes: { [key: string]: boolean } = {};
		let oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
		this._decorationTypeSubtypes[decorationTypeKey] = newDecorationsSubTypes;

		let newModelDecorations: IModelDeltaDecoration[] = [];

		for (let decorationOption of decorationOptions) {
			let typeKey = decorationTypeKey;
			if (decorationOption.renderOptions) {
				// identify custom reder options by a hash code over all keys and values
				// For custom render options register a decoration type if necessary
				let subType = hash(decorationOption.renderOptions).toString(16);
				// The fact that `decorationTypeKey` appears in the typeKey has no influence
				// it is just a mechanism to get predictable and unique keys (repeatable for the same options and unique across clients)
				typeKey = decorationTypeKey + '-' + subType;
				if (!oldDecorationsSubTypes[subType] && !newDecorationsSubTypes[subType]) {
					// decoration type did not exist before, register new one
					this._registerDecorationType(typeKey, decorationOption.renderOptions, decorationTypeKey);
				}
				newDecorationsSubTypes[subType] = true;
			}
			let opts = this._resolveDecorationOptions(typeKey, !!decorationOption.hoverMessage);
			if (decorationOption.hoverMessage) {
				opts.hoverMessage = decorationOption.hoverMessage;
			}
			newModelDecorations.push({ range: decorationOption.range, options: opts });
		}

		// remove decoration sub types that are no longer used, deregister decoration type if necessary
		for (let subType in oldDecorationsSubTypes) {
			if (!newDecorationsSubTypes[subType]) {
				this._removeDecorationType(decorationTypeKey + '-' + subType);
			}
		}

		// update all decorations
		let oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this._decorationTypeKeysToIds[decorationTypeKey] = this.deltaDecorations(oldDecorationsIds, newModelDecorations);
	}

	public setDecorationsFast(decorationTypeKey: string, ranges: IRange[]): void {

		// remove decoration sub types that are no longer used, deregister decoration type if necessary
		let oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
		for (let subType in oldDecorationsSubTypes) {
			this._removeDecorationType(decorationTypeKey + '-' + subType);
		}
		this._decorationTypeSubtypes[decorationTypeKey] = {};

		const opts = ModelDecorationOptions.createDynamic(this._resolveDecorationOptions(decorationTypeKey, false));
		let newModelDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(ranges.length);
		for (let i = 0, len = ranges.length; i < len; i++) {
			newModelDecorations[i] = { range: ranges[i], options: opts };
		}

		// update all decorations
		let oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this._decorationTypeKeysToIds[decorationTypeKey] = this.deltaDecorations(oldDecorationsIds, newModelDecorations);
	}

	public removeDecorations(decorationTypeKey: string): void {
		// remove decorations for type and sub type
		let oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey];
		if (oldDecorationsIds) {
			this.deltaDecorations(oldDecorationsIds, []);
		}
		if (this._decorationTypeKeysToIds.hasOwnProperty(decorationTypeKey)) {
			delete this._decorationTypeKeysToIds[decorationTypeKey];
		}
		if (this._decorationTypeSubtypes.hasOwnProperty(decorationTypeKey)) {
			delete this._decorationTypeSubtypes[decorationTypeKey];
		}
	}

	public getLayoutInfo(): editorOptions.EditorLayoutInfo {
		return this._configuration.editor.layoutInfo;
	}

	public createOverviewRuler(cssClassName: string): editorBrowser.IOverviewRuler | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}
		return this._modelData.view.createOverviewRuler(cssClassName);
	}

	public getDomNode(): HTMLElement | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}
		return this._modelData.view.domNode.domNode;
	}

	public delegateVerticalScrollbarMouseDown(browserEvent: IMouseEvent): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.delegateVerticalScrollbarMouseDown(browserEvent);
	}

	public layout(dimension?: editorCommon.IDimension): void {
		this._configuration.observeReferenceElement(dimension);
		this.render();
	}

	public focus(): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.focus();
	}

	public hasTextFocus(): boolean {
		if (!this._modelData || !this._modelData.hasRealView) {
			return false;
		}
		return this._modelData.view.isFocused();
	}

	public hasWidgetFocus(): boolean {
		return this._focusTracker && this._focusTracker.hasFocus();
	}

	public addContentWidget(widget: editorBrowser.IContentWidget): void {
		let widgetData: IContentWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this._contentWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting a content widget with the same id.');
		}

		this._contentWidgets[widget.getId()] = widgetData;

		if (this._modelData && this._modelData.hasRealView) {
			this._modelData.view.addContentWidget(widgetData);
		}
	}

	public layoutContentWidget(widget: editorBrowser.IContentWidget): void {
		let widgetId = widget.getId();
		if (this._contentWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this._contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.layoutContentWidget(widgetData);
			}
		}
	}

	public removeContentWidget(widget: editorBrowser.IContentWidget): void {
		let widgetId = widget.getId();
		if (this._contentWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this._contentWidgets[widgetId];
			delete this._contentWidgets[widgetId];
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.removeContentWidget(widgetData);
			}
		}
	}

	public addOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		let widgetData: IOverlayWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this._overlayWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting an overlay widget with the same id.');
		}

		this._overlayWidgets[widget.getId()] = widgetData;

		if (this._modelData && this._modelData.hasRealView) {
			this._modelData.view.addOverlayWidget(widgetData);
		}
	}

	public layoutOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		let widgetId = widget.getId();
		if (this._overlayWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this._overlayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.layoutOverlayWidget(widgetData);
			}
		}
	}

	public removeOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		let widgetId = widget.getId();
		if (this._overlayWidgets.hasOwnProperty(widgetId)) {
			let widgetData = this._overlayWidgets[widgetId];
			delete this._overlayWidgets[widgetId];
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.removeOverlayWidget(widgetData);
			}
		}
	}

	public changeViewZones(callback: (accessor: editorBrowser.IViewZoneChangeAccessor) => void): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		let hasChanges = this._modelData.view.change(callback);
		if (hasChanges) {
			this._onDidChangeViewZones.fire();
		}
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): editorBrowser.IMouseTarget | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}
		return this._modelData.view.getTargetAtClientPoint(clientX, clientY);
	}

	public getScrolledVisiblePosition(rawPosition: IPosition): { top: number; left: number; height: number; } | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}

		let position = this._modelData.model.validatePosition(rawPosition);
		let layoutInfo = this._configuration.editor.layoutInfo;

		let top = CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, position.lineNumber, position.column) - this.getScrollTop();
		let left = this._modelData.view.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - this.getScrollLeft();

		return {
			top: top,
			left: left,
			height: this._configuration.editor.lineHeight
		};
	}

	public getOffsetForColumn(lineNumber: number, column: number): number {
		if (!this._modelData || !this._modelData.hasRealView) {
			return -1;
		}
		return this._modelData.view.getOffsetForColumn(lineNumber, column);
	}

	public render(forceRedraw: boolean = false): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.render(true, forceRedraw);
	}

	public applyFontInfo(target: HTMLElement): void {
		Configuration.applyFontInfoSlow(target, this._configuration.editor.fontInfo);
	}

	protected _attachModel(model: ITextModel | null): void {
		if (!model) {
			this._modelData = null;
			return;
		}

		const listenersToRemove: IDisposable[] = [];

		this._domElement.setAttribute('data-mode-id', model.getLanguageIdentifier().language);
		this._configuration.setIsDominatedByLongLines(model.isDominatedByLongLines());
		this._configuration.setMaxLineNumber(model.getLineCount());

		model.onBeforeAttached();

		const viewModel = new ViewModel(this._id, this._configuration, model, (callback) => dom.scheduleAtNextAnimationFrame(callback));

		listenersToRemove.push(model.onDidChangeDecorations((e) => this._onDidChangeModelDecorations.fire(e)));
		listenersToRemove.push(model.onDidChangeLanguage((e) => {
			this._domElement.setAttribute('data-mode-id', model.getLanguageIdentifier().language);
			this._onDidChangeModelLanguage.fire(e);
		}));
		listenersToRemove.push(model.onDidChangeLanguageConfiguration((e) => this._onDidChangeModelLanguageConfiguration.fire(e)));
		listenersToRemove.push(model.onDidChangeContent((e) => this._onDidChangeModelContent.fire(e)));
		listenersToRemove.push(model.onDidChangeOptions((e) => this._onDidChangeModelOptions.fire(e)));
		// Someone might destroy the model from under the editor, so prevent any exceptions by setting a null model
		listenersToRemove.push(model.onWillDispose(() => this.setModel(null)));

		const cursor = new Cursor(this._configuration, model, viewModel);

		listenersToRemove.push(cursor.onDidReachMaxCursorCount(() => {
			this._notificationService.warn(nls.localize('cursors.maximum', "The number of cursors has been limited to {0}.", Cursor.MAX_CURSOR_COUNT));
		}));

		listenersToRemove.push(cursor.onDidAttemptReadOnlyEdit(() => {
			this._onDidAttemptReadOnlyEdit.fire(undefined);
		}));

		listenersToRemove.push(cursor.onDidChange((e: CursorStateChangedEvent) => {
			let positions: Position[] = [];
			for (let i = 0, len = e.selections.length; i < len; i++) {
				positions[i] = e.selections[i].getPosition();
			}

			const e1: ICursorPositionChangedEvent = {
				position: positions[0],
				secondaryPositions: positions.slice(1),
				reason: e.reason,
				source: e.source
			};
			this._onDidChangeCursorPosition.fire(e1);

			const e2: ICursorSelectionChangedEvent = {
				selection: e.selections[0],
				secondarySelections: e.selections.slice(1),
				source: e.source,
				reason: e.reason
			};
			this._onDidChangeCursorSelection.fire(e2);
		}));

		const [view, hasRealView] = this._createView(viewModel, cursor);
		if (hasRealView) {
			this._domElement.appendChild(view.domNode.domNode);

			let keys = Object.keys(this._contentWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				let widgetId = keys[i];
				view.addContentWidget(this._contentWidgets[widgetId]);
			}

			keys = Object.keys(this._overlayWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				let widgetId = keys[i];
				view.addOverlayWidget(this._overlayWidgets[widgetId]);
			}

			view.render(false, true);
			view.domNode.domNode.setAttribute('data-uri', model.uri.toString());
		}

		this._modelData = new ModelData(model, viewModel, cursor, view, hasRealView, listenersToRemove);
	}

	protected _createView(viewModel: ViewModel, cursor: Cursor): [View, boolean] {
		let commandDelegate: ICommandDelegate;
		if (this.isSimpleWidget) {
			commandDelegate = {
				executeEditorCommand: (editorCommand: CoreEditorCommand, args: any): void => {
					editorCommand.runCoreEditorCommand(cursor, args);
				},
				paste: (source: string, text: string, pasteOnNewLine: boolean, multicursorText: string[] | null) => {
					this.trigger(source, editorCommon.Handler.Paste, { text, pasteOnNewLine, multicursorText });
				},
				type: (source: string, text: string) => {
					this.trigger(source, editorCommon.Handler.Type, { text });
				},
				replacePreviousChar: (source: string, text: string, replaceCharCnt: number) => {
					this.trigger(source, editorCommon.Handler.ReplacePreviousChar, { text, replaceCharCnt });
				},
				compositionStart: (source: string) => {
					this.trigger(source, editorCommon.Handler.CompositionStart, undefined);
				},
				compositionEnd: (source: string) => {
					this.trigger(source, editorCommon.Handler.CompositionEnd, undefined);
				},
				cut: (source: string) => {
					this.trigger(source, editorCommon.Handler.Cut, undefined);
				}
			};
		} else {
			commandDelegate = {
				executeEditorCommand: (editorCommand: CoreEditorCommand, args: any): void => {
					editorCommand.runCoreEditorCommand(cursor, args);
				},
				paste: (source: string, text: string, pasteOnNewLine: boolean, multicursorText: string[] | null) => {
					this._commandService.executeCommand(editorCommon.Handler.Paste, {
						text: text,
						pasteOnNewLine: pasteOnNewLine,
						multicursorText: multicursorText
					});
				},
				type: (source: string, text: string) => {
					this._commandService.executeCommand(editorCommon.Handler.Type, {
						text: text
					});
				},
				replacePreviousChar: (source: string, text: string, replaceCharCnt: number) => {
					this._commandService.executeCommand(editorCommon.Handler.ReplacePreviousChar, {
						text: text,
						replaceCharCnt: replaceCharCnt
					});
				},
				compositionStart: (source: string) => {
					this._commandService.executeCommand(editorCommon.Handler.CompositionStart, {});
				},
				compositionEnd: (source: string) => {
					this._commandService.executeCommand(editorCommon.Handler.CompositionEnd, {});
				},
				cut: (source: string) => {
					this._commandService.executeCommand(editorCommon.Handler.Cut, {});
				}
			};
		}

		const viewOutgoingEvents = new ViewOutgoingEvents(viewModel);
		viewOutgoingEvents.onDidGainFocus = () => {
			this._editorTextFocus.setValue(true);
			// In IE, the focus is not synchronous, so we give it a little help
			this._editorWidgetFocus.setValue(true);
		};
		viewOutgoingEvents.onDidScroll = (e) => this._onDidScrollChange.fire(e);
		viewOutgoingEvents.onDidLoseFocus = () => this._editorTextFocus.setValue(false);
		viewOutgoingEvents.onContextMenu = (e) => this._onContextMenu.fire(e);
		viewOutgoingEvents.onMouseDown = (e) => this._onMouseDown.fire(e);
		viewOutgoingEvents.onMouseUp = (e) => this._onMouseUp.fire(e);
		viewOutgoingEvents.onMouseDrag = (e) => this._onMouseDrag.fire(e);
		viewOutgoingEvents.onMouseDrop = (e) => this._onMouseDrop.fire(e);
		viewOutgoingEvents.onKeyUp = (e) => this._onKeyUp.fire(e);
		viewOutgoingEvents.onMouseMove = (e) => this._onMouseMove.fire(e);
		viewOutgoingEvents.onMouseLeave = (e) => this._onMouseLeave.fire(e);
		viewOutgoingEvents.onKeyDown = (e) => this._onKeyDown.fire(e);

		const view = new View(
			commandDelegate,
			this._configuration,
			this._themeService,
			viewModel,
			cursor,
			viewOutgoingEvents
		);

		return [view, true];
	}

	protected _postDetachModelCleanup(detachedModel: ITextModel | null): void {
		if (detachedModel) {
			detachedModel.removeAllDecorationsWithOwnerId(this._id);
		}
	}

	private _detachModel(): ITextModel | null {
		if (!this._modelData) {
			return null;
		}
		const model = this._modelData.model;
		const removeDomNode = this._modelData.hasRealView ? this._modelData.view.domNode.domNode : null;

		this._modelData.dispose();
		this._modelData = null;

		this._domElement.removeAttribute('data-mode-id');
		if (removeDomNode) {
			this._domElement.removeChild(removeDomNode);
		}

		return model;
	}

	private _registerDecorationType(key: string, options: editorCommon.IDecorationRenderOptions, parentTypeKey?: string): void {
		this._codeEditorService.registerDecorationType(key, options, parentTypeKey);
	}

	private _removeDecorationType(key: string): void {
		this._codeEditorService.removeDecorationType(key);
	}

	private _resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions {
		return this._codeEditorService.resolveDecorationOptions(typeKey, writable);
	}

	/* __GDPR__FRAGMENT__
		"EditorTelemetryData" : {}
	*/
	public getTelemetryData(): { [key: string]: any; } | undefined {
		return this._telemetryData;
	}

	public hasModel(): this is editorBrowser.IActiveCodeEditor {
		return (this._modelData !== null);
	}
}

const enum BooleanEventValue {
	NotSet,
	False,
	True
}

export class BooleanEventEmitter extends Disposable {
	private readonly _onDidChangeToTrue: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeToTrue: Event<void> = this._onDidChangeToTrue.event;

	private readonly _onDidChangeToFalse: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeToFalse: Event<void> = this._onDidChangeToFalse.event;

	private _value: BooleanEventValue;

	constructor() {
		super();
		this._value = BooleanEventValue.NotSet;
	}

	public setValue(_value: boolean) {
		let value = (_value ? BooleanEventValue.True : BooleanEventValue.False);
		if (this._value === value) {
			return;
		}
		this._value = value;
		if (this._value === BooleanEventValue.True) {
			this._onDidChangeToTrue.fire();
		} else if (this._value === BooleanEventValue.False) {
			this._onDidChangeToFalse.fire();
		}
	}
}

class EditorContextKeysManager extends Disposable {

	private _editor: CodeEditorWidget;
	private _editorFocus: IContextKey<boolean>;
	private _textInputFocus: IContextKey<boolean>;
	private _editorTextFocus: IContextKey<boolean>;
	private _editorTabMovesFocus: IContextKey<boolean>;
	private _editorReadonly: IContextKey<boolean>;
	private _hasMultipleSelections: IContextKey<boolean>;
	private _hasNonEmptySelection: IContextKey<boolean>;
	private _canUndo: IContextKey<boolean>;
	private _canRedo: IContextKey<boolean>;

	constructor(
		editor: CodeEditorWidget,
		contextKeyService: IContextKeyService
	) {
		super();

		this._editor = editor;

		contextKeyService.createKey('editorId', editor.getId());
		this._editorFocus = EditorContextKeys.focus.bindTo(contextKeyService);
		this._textInputFocus = EditorContextKeys.textInputFocus.bindTo(contextKeyService);
		this._editorTextFocus = EditorContextKeys.editorTextFocus.bindTo(contextKeyService);
		this._editorTabMovesFocus = EditorContextKeys.tabMovesFocus.bindTo(contextKeyService);
		this._editorReadonly = EditorContextKeys.readOnly.bindTo(contextKeyService);
		this._hasMultipleSelections = EditorContextKeys.hasMultipleSelections.bindTo(contextKeyService);
		this._hasNonEmptySelection = EditorContextKeys.hasNonEmptySelection.bindTo(contextKeyService);
		this._canUndo = EditorContextKeys.canUndo.bindTo(contextKeyService);
		this._canRedo = EditorContextKeys.canRedo.bindTo(contextKeyService);

		this._register(this._editor.onDidChangeConfiguration(() => this._updateFromConfig()));
		this._register(this._editor.onDidChangeCursorSelection(() => this._updateFromSelection()));
		this._register(this._editor.onDidFocusEditorWidget(() => this._updateFromFocus()));
		this._register(this._editor.onDidBlurEditorWidget(() => this._updateFromFocus()));
		this._register(this._editor.onDidFocusEditorText(() => this._updateFromFocus()));
		this._register(this._editor.onDidBlurEditorText(() => this._updateFromFocus()));
		this._register(this._editor.onDidChangeModel(() => this._updateFromModel()));
		this._register(this._editor.onDidChangeConfiguration(() => this._updateFromModel()));

		this._updateFromConfig();
		this._updateFromSelection();
		this._updateFromFocus();
		this._updateFromModel();
	}

	private _updateFromConfig(): void {
		let config = this._editor.getConfiguration();

		this._editorTabMovesFocus.set(config.tabFocusMode);
		this._editorReadonly.set(config.readOnly);
	}

	private _updateFromSelection(): void {
		let selections = this._editor.getSelections();
		if (!selections) {
			this._hasMultipleSelections.reset();
			this._hasNonEmptySelection.reset();
		} else {
			this._hasMultipleSelections.set(selections.length > 1);
			this._hasNonEmptySelection.set(selections.some(s => !s.isEmpty()));
		}
	}

	private _updateFromFocus(): void {
		this._editorFocus.set(this._editor.hasWidgetFocus() && !this._editor.isSimpleWidget);
		this._editorTextFocus.set(this._editor.hasTextFocus() && !this._editor.isSimpleWidget);
		this._textInputFocus.set(this._editor.hasTextFocus());
	}

	private _updateFromModel(): void {
		const model = this._editor.getModel();
		this._canUndo.set(Boolean(model && model.canUndo()));
		this._canRedo.set(Boolean(model && model.canRedo()));
	}
}

export class EditorModeContext extends Disposable {

	private _editor: CodeEditorWidget;

	private _langId: IContextKey<string>;
	private _hasCompletionItemProvider: IContextKey<boolean>;
	private _hasCodeActionsProvider: IContextKey<boolean>;
	private _hasCodeLensProvider: IContextKey<boolean>;
	private _hasDefinitionProvider: IContextKey<boolean>;
	private _hasDeclarationProvider: IContextKey<boolean>;
	private _hasImplementationProvider: IContextKey<boolean>;
	private _hasTypeDefinitionProvider: IContextKey<boolean>;
	private _hasHoverProvider: IContextKey<boolean>;
	private _hasDocumentHighlightProvider: IContextKey<boolean>;
	private _hasDocumentSymbolProvider: IContextKey<boolean>;
	private _hasReferenceProvider: IContextKey<boolean>;
	private _hasRenameProvider: IContextKey<boolean>;
	private _hasDocumentFormattingProvider: IContextKey<boolean>;
	private _hasDocumentSelectionFormattingProvider: IContextKey<boolean>;
	private _hasSignatureHelpProvider: IContextKey<boolean>;
	private _isInWalkThrough: IContextKey<boolean>;

	constructor(
		editor: CodeEditorWidget,
		contextKeyService: IContextKeyService
	) {
		super();
		this._editor = editor;

		this._langId = EditorContextKeys.languageId.bindTo(contextKeyService);
		this._hasCompletionItemProvider = EditorContextKeys.hasCompletionItemProvider.bindTo(contextKeyService);
		this._hasCodeActionsProvider = EditorContextKeys.hasCodeActionsProvider.bindTo(contextKeyService);
		this._hasCodeLensProvider = EditorContextKeys.hasCodeLensProvider.bindTo(contextKeyService);
		this._hasDefinitionProvider = EditorContextKeys.hasDefinitionProvider.bindTo(contextKeyService);
		this._hasDeclarationProvider = EditorContextKeys.hasDeclarationProvider.bindTo(contextKeyService);
		this._hasImplementationProvider = EditorContextKeys.hasImplementationProvider.bindTo(contextKeyService);
		this._hasTypeDefinitionProvider = EditorContextKeys.hasTypeDefinitionProvider.bindTo(contextKeyService);
		this._hasHoverProvider = EditorContextKeys.hasHoverProvider.bindTo(contextKeyService);
		this._hasDocumentHighlightProvider = EditorContextKeys.hasDocumentHighlightProvider.bindTo(contextKeyService);
		this._hasDocumentSymbolProvider = EditorContextKeys.hasDocumentSymbolProvider.bindTo(contextKeyService);
		this._hasReferenceProvider = EditorContextKeys.hasReferenceProvider.bindTo(contextKeyService);
		this._hasRenameProvider = EditorContextKeys.hasRenameProvider.bindTo(contextKeyService);
		this._hasDocumentFormattingProvider = EditorContextKeys.hasDocumentFormattingProvider.bindTo(contextKeyService);
		this._hasDocumentSelectionFormattingProvider = EditorContextKeys.hasDocumentSelectionFormattingProvider.bindTo(contextKeyService);
		this._hasSignatureHelpProvider = EditorContextKeys.hasSignatureHelpProvider.bindTo(contextKeyService);
		this._isInWalkThrough = EditorContextKeys.isInEmbeddedEditor.bindTo(contextKeyService);

		const update = () => this._update();

		// update when model/mode changes
		this._register(editor.onDidChangeModel(update));
		this._register(editor.onDidChangeModelLanguage(update));

		// update when registries change
		this._register(modes.CompletionProviderRegistry.onDidChange(update));
		this._register(modes.CodeActionProviderRegistry.onDidChange(update));
		this._register(modes.CodeLensProviderRegistry.onDidChange(update));
		this._register(modes.DefinitionProviderRegistry.onDidChange(update));
		this._register(modes.DeclarationProviderRegistry.onDidChange(update));
		this._register(modes.ImplementationProviderRegistry.onDidChange(update));
		this._register(modes.TypeDefinitionProviderRegistry.onDidChange(update));
		this._register(modes.HoverProviderRegistry.onDidChange(update));
		this._register(modes.DocumentHighlightProviderRegistry.onDidChange(update));
		this._register(modes.DocumentSymbolProviderRegistry.onDidChange(update));
		this._register(modes.ReferenceProviderRegistry.onDidChange(update));
		this._register(modes.RenameProviderRegistry.onDidChange(update));
		this._register(modes.DocumentFormattingEditProviderRegistry.onDidChange(update));
		this._register(modes.DocumentRangeFormattingEditProviderRegistry.onDidChange(update));
		this._register(modes.SignatureHelpProviderRegistry.onDidChange(update));

		update();
	}

	dispose() {
		super.dispose();
	}

	reset() {
		this._langId.reset();
		this._hasCompletionItemProvider.reset();
		this._hasCodeActionsProvider.reset();
		this._hasCodeLensProvider.reset();
		this._hasDefinitionProvider.reset();
		this._hasDeclarationProvider.reset();
		this._hasImplementationProvider.reset();
		this._hasTypeDefinitionProvider.reset();
		this._hasHoverProvider.reset();
		this._hasDocumentHighlightProvider.reset();
		this._hasDocumentSymbolProvider.reset();
		this._hasReferenceProvider.reset();
		this._hasRenameProvider.reset();
		this._hasDocumentFormattingProvider.reset();
		this._hasDocumentSelectionFormattingProvider.reset();
		this._hasSignatureHelpProvider.reset();
		this._isInWalkThrough.reset();
	}

	private _update() {
		const model = this._editor.getModel();
		if (!model) {
			this.reset();
			return;
		}
		this._langId.set(model.getLanguageIdentifier().language);
		this._hasCompletionItemProvider.set(modes.CompletionProviderRegistry.has(model));
		this._hasCodeActionsProvider.set(modes.CodeActionProviderRegistry.has(model));
		this._hasCodeLensProvider.set(modes.CodeLensProviderRegistry.has(model));
		this._hasDefinitionProvider.set(modes.DefinitionProviderRegistry.has(model));
		this._hasDeclarationProvider.set(modes.DeclarationProviderRegistry.has(model));
		this._hasImplementationProvider.set(modes.ImplementationProviderRegistry.has(model));
		this._hasTypeDefinitionProvider.set(modes.TypeDefinitionProviderRegistry.has(model));
		this._hasHoverProvider.set(modes.HoverProviderRegistry.has(model));
		this._hasDocumentHighlightProvider.set(modes.DocumentHighlightProviderRegistry.has(model));
		this._hasDocumentSymbolProvider.set(modes.DocumentSymbolProviderRegistry.has(model));
		this._hasReferenceProvider.set(modes.ReferenceProviderRegistry.has(model));
		this._hasRenameProvider.set(modes.RenameProviderRegistry.has(model));
		this._hasSignatureHelpProvider.set(modes.SignatureHelpProviderRegistry.has(model));
		this._hasDocumentFormattingProvider.set(modes.DocumentFormattingEditProviderRegistry.has(model) || modes.DocumentRangeFormattingEditProviderRegistry.has(model));
		this._hasDocumentSelectionFormattingProvider.set(modes.DocumentRangeFormattingEditProviderRegistry.has(model));
		this._isInWalkThrough.set(model.uri.scheme === Schemas.walkThroughSnippet);
	}
}

class CodeEditorWidgetFocusTracker extends Disposable {

	private _hasFocus: boolean;
	private _domFocusTracker: dom.IFocusTracker;

	private readonly _onChange: Emitter<void> = this._register(new Emitter<void>());
	public readonly onChange: Event<void> = this._onChange.event;

	constructor(domElement: HTMLElement) {
		super();

		this._hasFocus = false;
		this._domFocusTracker = this._register(dom.trackFocus(domElement));

		this._register(this._domFocusTracker.onDidFocus(() => {
			this._hasFocus = true;
			this._onChange.fire(undefined);
		}));
		this._register(this._domFocusTracker.onDidBlur(() => {
			this._hasFocus = false;
			this._onChange.fire(undefined);
		}));
	}

	public hasFocus(): boolean {
		return this._hasFocus;
	}
}

const squigglyStart = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' enable-background='new 0 0 6 3' height='3' width='6'><g fill='`);
const squigglyEnd = encodeURIComponent(`'><polygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><polygon points='4,0 6,2 6,0.6 5.4,0'/><polygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`);

function getSquigglySVGData(color: Color) {
	return squigglyStart + encodeURIComponent(color.toString()) + squigglyEnd;
}

const dotdotdotStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" height="3" width="12"><g fill="`);
const dotdotdotEnd = encodeURIComponent(`"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="9" cy="1" r="1"/></g></svg>`);

function getDotDotDotSVGData(color: Color) {
	return dotdotdotStart + encodeURIComponent(color.toString()) + dotdotdotEnd;
}

registerThemingParticipant((theme, collector) => {
	const errorBorderColor = theme.getColor(editorErrorBorder);
	if (errorBorderColor) {
		collector.addRule(`.monaco-editor .${ClassName.EditorErrorDecoration} { border-bottom: 4px double ${errorBorderColor}; }`);
	}
	const errorForeground = theme.getColor(editorErrorForeground);
	if (errorForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorErrorDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}") repeat-x bottom left; }`);
	}

	const warningBorderColor = theme.getColor(editorWarningBorder);
	if (warningBorderColor) {
		collector.addRule(`.monaco-editor .${ClassName.EditorWarningDecoration} { border-bottom: 4px double ${warningBorderColor}; }`);
	}
	const warningForeground = theme.getColor(editorWarningForeground);
	if (warningForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorWarningDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(warningForeground)}") repeat-x bottom left; }`);
	}

	const infoBorderColor = theme.getColor(editorInfoBorder);
	if (infoBorderColor) {
		collector.addRule(`.monaco-editor .${ClassName.EditorInfoDecoration} { border-bottom: 4px double ${infoBorderColor}; }`);
	}
	const infoForeground = theme.getColor(editorInfoForeground);
	if (infoForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorInfoDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(infoForeground)}") repeat-x bottom left; }`);
	}

	const hintBorderColor = theme.getColor(editorHintBorder);
	if (hintBorderColor) {
		collector.addRule(`.monaco-editor .${ClassName.EditorHintDecoration} { border-bottom: 2px dotted ${hintBorderColor}; }`);
	}
	const hintForeground = theme.getColor(editorHintForeground);
	if (hintForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorHintDecoration} { background: url("data:image/svg+xml,${getDotDotDotSVGData(hintForeground)}") no-repeat bottom left; }`);
	}

	const unnecessaryForeground = theme.getColor(editorUnnecessaryCodeOpacity);
	if (unnecessaryForeground) {
		collector.addRule(`.${SHOW_UNUSED_ENABLED_CLASS} .monaco-editor .${ClassName.EditorUnnecessaryInlineDecoration} { opacity: ${unnecessaryForeground.rgba.a}; }`);
	}

	const unnecessaryBorder = theme.getColor(editorUnnecessaryCodeBorder);
	if (unnecessaryBorder) {
		collector.addRule(`.${SHOW_UNUSED_ENABLED_CLASS} .monaco-editor .${ClassName.EditorUnnecessaryDecoration} { border-bottom: 2px dashed ${unnecessaryBorder}; }`);
	}
});
