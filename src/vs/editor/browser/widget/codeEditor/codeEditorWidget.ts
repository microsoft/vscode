/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../services/markerDecorations.js';
import * as dom from '../../../../base/browser/dom.js';
import { IKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { Color } from '../../../../base/common/color.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, EmitterOptions, Event, EventDeliveryQueue, createEventDeliveryQueue } from '../../../../base/common/event.js';
import { hash } from '../../../../base/common/hash.js';
import { Disposable, DisposableStore, IDisposable, dispose } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import './editor.css';
import { applyFontInfo } from '../../config/domFontInfo.js';
import { EditorConfiguration, IEditorConstructionOptions } from '../../config/editorConfiguration.js';
import { TabFocus } from '../../config/tabFocus.js';
import * as editorBrowser from '../../editorBrowser.js';
import { EditorExtensionsRegistry, IEditorContributionDescription } from '../../editorExtensions.js';
import { ICodeEditorService } from '../../services/codeEditorService.js';
import { IContentWidgetData, IGlyphMarginWidgetData, IOverlayWidgetData, View } from '../../view.js';
import { DOMLineBreaksComputerFactory } from '../../view/domLineBreaksComputer.js';
import { ICommandDelegate } from '../../view/viewController.js';
import { ViewUserInputEvents } from '../../view/viewUserInputEvents.js';
import { CodeEditorContributions } from './codeEditorContributions.js';
import { IEditorConfiguration } from '../../../common/config/editorConfiguration.js';
import { ConfigurationChangedEvent, EditorLayoutInfo, EditorOption, FindComputedEditorOptionValueById, IComputedEditorOptions, IEditorOptions, filterValidationDecorations } from '../../../common/config/editorOptions.js';
import { CursorColumns } from '../../../common/core/cursorColumns.js';
import { IDimension } from '../../../common/core/dimension.js';
import { editorUnnecessaryCodeOpacity } from '../../../common/core/editorColorRegistry.js';
import { IPosition, Position } from '../../../common/core/position.js';
import { IRange, Range } from '../../../common/core/range.js';
import { ISelection, Selection } from '../../../common/core/selection.js';
import { IWordAtPosition } from '../../../common/core/wordHelper.js';
import { WordOperations } from '../../../common/cursor/cursorWordOperations.js';
import { CursorChangeReason, ICursorPositionChangedEvent, ICursorSelectionChangedEvent } from '../../../common/cursorEvents.js';
import { InternalEditorAction } from '../../../common/editorAction.js';
import * as editorCommon from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ILanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { EndOfLinePreference, IAttachedView, ICursorStateComputer, IIdentifiedSingleEditOperation, IModelDecoration, IModelDecorationOptions, IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel } from '../../../common/model.js';
import { ClassName } from '../../../common/model/intervalTree.js';
import { ModelDecorationOptions } from '../../../common/model/textModel.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { IModelContentChangedEvent, IModelDecorationsChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelOptionsChangedEvent, IModelTokensChangedEvent } from '../../../common/textModelEvents.js';
import { VerticalRevealType } from '../../../common/viewEvents.js';
import { IEditorWhitespace, IViewModel } from '../../../common/viewModel.js';
import { MonospaceLineBreaksComputerFactory } from '../../../common/viewModel/monospaceLineBreaksComputer.js';
import { ViewModel } from '../../../common/viewModel/viewModelImpl.js';
import { OutgoingViewModelEventKind } from '../../../common/viewModelEventDispatcher.js';
import * as nls from '../../../../nls.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyValue, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { editorErrorForeground, editorHintForeground, editorInfoForeground, editorWarningForeground } from '../../../../platform/theme/common/colorRegistry.js';
import { IThemeService, registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

export class CodeEditorWidget extends Disposable implements editorBrowser.ICodeEditor {

	private static readonly dropIntoEditorDecorationOptions = ModelDecorationOptions.register({
		description: 'workbench-dnd-target',
		className: 'dnd-target'
	});

	//#region Eventing

	private readonly _deliveryQueue = createEventDeliveryQueue();
	protected readonly _contributions: CodeEditorContributions = this._register(new CodeEditorContributions());

	private readonly _onDidDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidDispose: Event<void> = this._onDidDispose.event;

	private readonly _onDidChangeModelContent: Emitter<IModelContentChangedEvent> = this._register(new Emitter<IModelContentChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelContent: Event<IModelContentChangedEvent> = this._onDidChangeModelContent.event;

	private readonly _onDidChangeModelLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeModelLanguage.event;

	private readonly _onDidChangeModelLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeModelLanguageConfiguration.event;

	private readonly _onDidChangeModelOptions: Emitter<IModelOptionsChangedEvent> = this._register(new Emitter<IModelOptionsChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelOptions: Event<IModelOptionsChangedEvent> = this._onDidChangeModelOptions.event;

	private readonly _onDidChangeModelDecorations: Emitter<IModelDecorationsChangedEvent> = this._register(new Emitter<IModelDecorationsChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelDecorations: Event<IModelDecorationsChangedEvent> = this._onDidChangeModelDecorations.event;

	private readonly _onDidChangeModelTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeModelTokens: Event<IModelTokensChangedEvent> = this._onDidChangeModelTokens.event;

	private readonly _onDidChangeConfiguration: Emitter<ConfigurationChangedEvent> = this._register(new Emitter<ConfigurationChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onDidChangeConfiguration: Event<ConfigurationChangedEvent> = this._onDidChangeConfiguration.event;

	protected readonly _onWillChangeModel: Emitter<editorCommon.IModelChangedEvent> = this._register(new Emitter<editorCommon.IModelChangedEvent>({ deliveryQueue: this._deliveryQueue }));
	public readonly onWillChangeModel: Event<editorCommon.IModelChangedEvent> = this._onWillChangeModel.event;

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

	private _updateCounter = 0;

	private readonly _onWillTriggerEditorOperationEvent: Emitter<editorCommon.ITriggerEditorOperationEvent> = this._register(new Emitter<editorCommon.ITriggerEditorOperationEvent>());
	public readonly onWillTriggerEditorOperationEvent: Event<editorCommon.ITriggerEditorOperationEvent> = this._onWillTriggerEditorOperationEvent.event;

	private readonly _onBeginUpdate: Emitter<void> = this._register(new Emitter<void>());
	public readonly onBeginUpdate: Event<void> = this._onBeginUpdate.event;

	private readonly _onEndUpdate: Emitter<void> = this._register(new Emitter<void>());
	public readonly onEndUpdate: Event<void> = this._onEndUpdate.event;

	//#endregion

	public get isSimpleWidget(): boolean {
		return this._configuration.isSimpleWidget;
	}

	public get contextMenuId(): MenuId {
		return this._configuration.contextMenuId;
	}

	private readonly _telemetryData?: object;

	private readonly _domElement: HTMLElement;
	private readonly _overflowWidgetsDomNode: HTMLElement | undefined;
	private readonly _id: number;
	private readonly _configuration: IEditorConfiguration;
	private _contributionsDisposable: IDisposable | undefined;

	protected readonly _actions = new Map<string, editorCommon.IEditorAction>();

	// --- Members logically associated to a model
	protected _modelData: ModelData | null;

	protected readonly _instantiationService: IInstantiationService;
	protected readonly _contextKeyService: IContextKeyService;
	get contextKeyService() { return this._contextKeyService; }
	private readonly _notificationService: INotificationService;
	protected readonly _codeEditorService: ICodeEditorService;
	private readonly _commandService: ICommandService;
	private readonly _themeService: IThemeService;

	private readonly _focusTracker: CodeEditorWidgetFocusTracker;

	private _contentWidgets: { [key: string]: IContentWidgetData };
	private _overlayWidgets: { [key: string]: IOverlayWidgetData };
	private _glyphMarginWidgets: { [key: string]: IGlyphMarginWidgetData };

	/**
	 * map from "parent" decoration type to live decoration ids.
	 */
	private _decorationTypeKeysToIds: { [decorationTypeKey: string]: string[] };
	private _decorationTypeSubtypes: { [decorationTypeKey: string]: { [subtype: string]: boolean } };

	private _bannerDomNode: HTMLElement | null = null;

	private _dropIntoEditorDecorations: EditorDecorationsCollection = this.createDecorationsCollection();

	constructor(
		domElement: HTMLElement,
		_options: Readonly<IEditorConstructionOptions>,
		codeEditorWidgetOptions: ICodeEditorWidgetOptions,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ICommandService commandService: ICommandService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService notificationService: INotificationService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		codeEditorService.willCreateCodeEditor();

		const options = { ..._options };

		this._domElement = domElement;
		this._overflowWidgetsDomNode = options.overflowWidgetsDomNode;
		delete options.overflowWidgetsDomNode;
		this._id = (++EDITOR_ID);
		this._decorationTypeKeysToIds = {};
		this._decorationTypeSubtypes = {};
		this._telemetryData = codeEditorWidgetOptions.telemetryData;

		this._configuration = this._register(this._createConfiguration(codeEditorWidgetOptions.isSimpleWidget || false,
			codeEditorWidgetOptions.contextMenuId ?? (codeEditorWidgetOptions.isSimpleWidget ? MenuId.SimpleEditorContext : MenuId.EditorContext),
			options, accessibilityService));
		this._register(this._configuration.onDidChange((e) => {
			this._onDidChangeConfiguration.fire(e);

			const options = this._configuration.options;
			if (e.hasChanged(EditorOption.layoutInfo)) {
				const layoutInfo = options.get(EditorOption.layoutInfo);
				this._onDidLayoutChange.fire(layoutInfo);
			}
		}));

		this._contextKeyService = this._register(contextKeyService.createScoped(this._domElement));
		this._notificationService = notificationService;
		this._codeEditorService = codeEditorService;
		this._commandService = commandService;
		this._themeService = themeService;
		this._register(new EditorContextKeysManager(this, this._contextKeyService));
		this._register(new EditorModeContext(this, this._contextKeyService, languageFeaturesService));

		this._instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));

		this._modelData = null;

		this._focusTracker = new CodeEditorWidgetFocusTracker(domElement, this._overflowWidgetsDomNode);
		this._register(this._focusTracker.onChange(() => {
			this._editorWidgetFocus.setValue(this._focusTracker.hasFocus());
		}));

		this._contentWidgets = {};
		this._overlayWidgets = {};
		this._glyphMarginWidgets = {};

		let contributions: IEditorContributionDescription[];
		if (Array.isArray(codeEditorWidgetOptions.contributions)) {
			contributions = codeEditorWidgetOptions.contributions;
		} else {
			contributions = EditorExtensionsRegistry.getEditorContributions();
		}
		this._contributions.initialize(this, contributions, this._instantiationService);

		for (const action of EditorExtensionsRegistry.getEditorActions()) {
			if (this._actions.has(action.id)) {
				onUnexpectedError(new Error(`Cannot have two actions with the same id ${action.id}`));
				continue;
			}
			const internalAction = new InternalEditorAction(
				action.id,
				action.label,
				action.alias,
				action.metadata,
				action.precondition ?? undefined,
				(args: unknown): Promise<void> => {
					return this._instantiationService.invokeFunction((accessor) => {
						return Promise.resolve(action.runEditorCommand(accessor, this, args));
					});
				},
				this._contextKeyService
			);
			this._actions.set(internalAction.id, internalAction);
		}

		const isDropIntoEnabled = () => {
			return !this._configuration.options.get(EditorOption.readOnly)
				&& this._configuration.options.get(EditorOption.dropIntoEditor).enabled;
		};

		this._register(new dom.DragAndDropObserver(this._domElement, {
			onDragOver: e => {
				if (!isDropIntoEnabled()) {
					return;
				}

				const target = this.getTargetAtClientPoint(e.clientX, e.clientY);
				if (target?.position) {
					this.showDropIndicatorAt(target.position);
				}
			},
			onDrop: async e => {
				if (!isDropIntoEnabled()) {
					return;
				}

				this.removeDropIndicator();

				if (!e.dataTransfer) {
					return;
				}

				const target = this.getTargetAtClientPoint(e.clientX, e.clientY);
				if (target?.position) {
					this._onDropIntoEditor.fire({ position: target.position, event: e });
				}
			},
			onDragLeave: () => {
				this.removeDropIndicator();
			},
			onDragEnd: () => {
				this.removeDropIndicator();
			},
		}));

		this._codeEditorService.addCodeEditor(this);
	}

	public writeScreenReaderContent(reason: string): void {
		this._modelData?.view.writeScreenReaderContent(reason);
	}

	protected _createConfiguration(isSimpleWidget: boolean, contextMenuId: MenuId, options: Readonly<IEditorConstructionOptions>, accessibilityService: IAccessibilityService): EditorConfiguration {
		return new EditorConfiguration(isSimpleWidget, contextMenuId, options, this._domElement, accessibilityService);
	}

	public getId(): string {
		return this.getEditorType() + ':' + this._id;
	}

	public getEditorType(): string {
		return editorCommon.EditorType.ICodeEditor;
	}

	public override dispose(): void {
		this._codeEditorService.removeCodeEditor(this);

		this._focusTracker.dispose();
		this._actions.clear();
		this._contentWidgets = {};
		this._overlayWidgets = {};

		this._removeDecorationTypes();
		this._postDetachModelCleanup(this._detachModel());

		this._onDidDispose.fire();

		super.dispose();
	}

	public invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		return this._instantiationService.invokeFunction(fn);
	}

	public updateOptions(newOptions: Readonly<IEditorOptions> | undefined): void {
		this._configuration.updateOptions(newOptions || {});
	}

	public getOptions(): IComputedEditorOptions {
		return this._configuration.options;
	}

	public getOption<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T> {
		return this._configuration.options.get(id);
	}

	public getRawOptions(): IEditorOptions {
		return this._configuration.getRawOptions();
	}

	public getOverflowWidgetsDomNode(): HTMLElement | undefined {
		return this._overflowWidgetsDomNode;
	}

	public getConfiguredWordAtPosition(position: Position): IWordAtPosition | null {
		if (!this._modelData) {
			return null;
		}
		return WordOperations.getWordAtPosition(this._modelData.model, this._configuration.options.get(EditorOption.wordSeparators), this._configuration.options.get(EditorOption.wordSegmenterLocales), position);
	}

	public getValue(options: { preserveBOM: boolean; lineEnding: string } | null = null): string {
		if (!this._modelData) {
			return '';
		}

		const preserveBOM: boolean = (options && options.preserveBOM) ? true : false;
		let eolPreference = EndOfLinePreference.TextDefined;
		if (options && options.lineEnding && options.lineEnding === '\n') {
			eolPreference = EndOfLinePreference.LF;
		} else if (options && options.lineEnding && options.lineEnding === '\r\n') {
			eolPreference = EndOfLinePreference.CRLF;
		}
		return this._modelData.model.getValue(eolPreference, preserveBOM);
	}

	public setValue(newValue: string): void {
		try {
			this._beginUpdate();
			if (!this._modelData) {
				return;
			}
			this._modelData.model.setValue(newValue);
		} finally {
			this._endUpdate();
		}
	}

	public getModel(): ITextModel | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.model;
	}

	public setModel(_model: ITextModel | editorCommon.IDiffEditorModel | editorCommon.IDiffEditorViewModel | null = null): void {
		try {
			this._beginUpdate();
			const model = <ITextModel | null>_model;
			if (this._modelData === null && model === null) {
				// Current model is the new model
				return;
			}
			if (this._modelData && this._modelData.model === model) {
				// Current model is the new model
				return;
			}

			const e: editorCommon.IModelChangedEvent = {
				oldModelUrl: this._modelData?.model.uri || null,
				newModelUrl: model?.uri || null
			};
			this._onWillChangeModel.fire(e);

			const hasTextFocus = this.hasTextFocus();
			const detachedModel = this._detachModel();
			this._attachModel(model);
			if (hasTextFocus && this.hasModel()) {
				this.focus();
			}

			this._removeDecorationTypes();
			this._onDidChangeModel.fire(e);
			this._postDetachModelCleanup(detachedModel);

			this._contributionsDisposable = this._contributions.onAfterModelAttached();
		} finally {
			this._endUpdate();
		}
	}

	private _removeDecorationTypes(): void {
		this._decorationTypeKeysToIds = {};
		if (this._decorationTypeSubtypes) {
			for (const decorationType in this._decorationTypeSubtypes) {
				const subTypes = this._decorationTypeSubtypes[decorationType];
				for (const subType in subTypes) {
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

	public getVisibleRangesPlusViewportAboveBelow(): Range[] {
		if (!this._modelData) {
			return [];
		}
		return this._modelData.viewModel.getVisibleRangesPlusViewportAboveBelow();
	}

	public getWhitespaces(): IEditorWhitespace[] {
		if (!this._modelData) {
			return [];
		}
		return this._modelData.viewModel.viewLayout.getWhitespaces();
	}

	private static _getVerticalOffsetAfterPosition(modelData: ModelData, modelLineNumber: number, modelColumn: number, includeViewZones: boolean): number {
		const modelPosition = modelData.model.validatePosition({
			lineNumber: modelLineNumber,
			column: modelColumn
		});
		const viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		return modelData.viewModel.viewLayout.getVerticalOffsetAfterLineNumber(viewPosition.lineNumber, includeViewZones);
	}

	public getTopForLineNumber(lineNumber: number, includeViewZones: boolean = false): number {
		if (!this._modelData) {
			return -1;
		}
		return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, 1, includeViewZones);
	}

	public getTopForPosition(lineNumber: number, column: number): number {
		if (!this._modelData) {
			return -1;
		}
		return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, column, false);
	}

	private static _getVerticalOffsetForPosition(modelData: ModelData, modelLineNumber: number, modelColumn: number, includeViewZones: boolean = false): number {
		const modelPosition = modelData.model.validatePosition({
			lineNumber: modelLineNumber,
			column: modelColumn
		});
		const viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
		return modelData.viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber, includeViewZones);
	}

	public getBottomForLineNumber(lineNumber: number, includeViewZones: boolean = false): number {
		if (!this._modelData) {
			return -1;
		}
		const maxCol = this._modelData.model.getLineMaxColumn(lineNumber);
		return CodeEditorWidget._getVerticalOffsetAfterPosition(this._modelData, lineNumber, maxCol, includeViewZones);
	}

	public setHiddenAreas(ranges: IRange[], source?: unknown, forceUpdate?: boolean): void {
		this._modelData?.viewModel.setHiddenAreas(ranges.map(r => Range.lift(r)), source, forceUpdate);
	}

	public getVisibleColumnFromPosition(rawPosition: IPosition): number {
		if (!this._modelData) {
			return rawPosition.column;
		}

		const position = this._modelData.model.validatePosition(rawPosition);
		const tabSize = this._modelData.model.getOptions().tabSize;

		return CursorColumns.visibleColumnFromColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize) + 1;
	}

	public getStatusbarColumn(rawPosition: IPosition): number {
		if (!this._modelData) {
			return rawPosition.column;
		}

		const position = this._modelData.model.validatePosition(rawPosition);
		const tabSize = this._modelData.model.getOptions().tabSize;

		return CursorColumns.toStatusbarColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize);
	}

	public getPosition(): Position | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.viewModel.getPosition();
	}

	public setPosition(position: IPosition, source: string = 'api'): void {
		if (!this._modelData) {
			return;
		}
		if (!Position.isIPosition(position)) {
			throw new Error('Invalid arguments');
		}
		this._modelData.viewModel.setSelections(source, [{
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

		this._modelData.viewModel.revealRange('api', revealHorizontal, viewRange, verticalType, scrollType);
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

	public revealLineNearTop(lineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLine(lineNumber, VerticalRevealType.NearTop, scrollType);
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

	public revealPositionNearTop(position: IPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealPosition(
			position,
			VerticalRevealType.NearTop,
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
		return this._modelData.viewModel.getSelection();
	}

	public getSelections(): Selection[] | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.viewModel.getSelections();
	}

	public setSelection(range: IRange, source?: string): void;
	public setSelection(editorRange: Range, source?: string): void;
	public setSelection(selection: ISelection, source?: string): void;
	public setSelection(editorSelection: Selection, source?: string): void;
	public setSelection(something: any, source: string = 'api'): void {
		const isSelection = Selection.isISelection(something);
		const isRange = Range.isIRange(something);

		if (!isSelection && !isRange) {
			throw new Error('Invalid arguments');
		}

		if (isSelection) {
			this._setSelectionImpl(<ISelection>something, source);
		} else if (isRange) {
			// act as if it was an IRange
			const selection: ISelection = {
				selectionStartLineNumber: something.startLineNumber,
				selectionStartColumn: something.startColumn,
				positionLineNumber: something.endLineNumber,
				positionColumn: something.endColumn
			};
			this._setSelectionImpl(selection, source);
		}
	}

	private _setSelectionImpl(sel: ISelection, source: string): void {
		if (!this._modelData) {
			return;
		}
		const selection = new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
		this._modelData.viewModel.setSelections(source, [selection]);
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

	public revealLinesNearTop(startLineNumber: number, endLineNumber: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealLines(
			startLineNumber,
			endLineNumber,
			VerticalRevealType.NearTop,
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

	public revealRangeNearTop(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealRange(
			range,
			VerticalRevealType.NearTop,
			true,
			scrollType
		);
	}

	public revealRangeNearTopIfOutsideViewport(range: IRange, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Smooth): void {
		this._revealRange(
			range,
			VerticalRevealType.NearTopIfOutsideViewport,
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

	public setSelections(ranges: readonly ISelection[], source: string = 'api', reason = CursorChangeReason.NotSet): void {
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
		this._modelData.viewModel.setSelections(source, ranges, reason);
	}

	public getContentWidth(): number {
		if (!this._modelData) {
			return -1;
		}
		return this._modelData.viewModel.viewLayout.getContentWidth();
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

	public getContentHeight(): number {
		if (!this._modelData) {
			return -1;
		}
		return this._modelData.viewModel.viewLayout.getContentHeight();
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

	public setScrollLeft(newScrollLeft: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Immediate): void {
		if (!this._modelData) {
			return;
		}
		if (typeof newScrollLeft !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._modelData.viewModel.viewLayout.setScrollPosition({
			scrollLeft: newScrollLeft
		}, scrollType);
	}
	public setScrollTop(newScrollTop: number, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Immediate): void {
		if (!this._modelData) {
			return;
		}
		if (typeof newScrollTop !== 'number') {
			throw new Error('Invalid arguments');
		}
		this._modelData.viewModel.viewLayout.setScrollPosition({
			scrollTop: newScrollTop
		}, scrollType);
	}
	public setScrollPosition(position: editorCommon.INewScrollPosition, scrollType: editorCommon.ScrollType = editorCommon.ScrollType.Immediate): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.viewLayout.setScrollPosition(position, scrollType);
	}
	public hasPendingScrollAnimation(): boolean {
		if (!this._modelData) {
			return false;
		}
		return this._modelData.viewModel.viewLayout.hasPendingScrollAnimation();
	}

	public saveViewState(): editorCommon.ICodeEditorViewState | null {
		if (!this._modelData) {
			return null;
		}
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
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		const codeEditorState = s as editorCommon.ICodeEditorViewState | null;
		if (codeEditorState && codeEditorState.cursorState && codeEditorState.viewState) {
			const cursorState = <any>codeEditorState.cursorState;
			if (Array.isArray(cursorState)) {
				if (cursorState.length > 0) {
					this._modelData.viewModel.restoreCursorState(<editorCommon.ICursorState[]>cursorState);
				}
			} else {
				// Backwards compatibility
				this._modelData.viewModel.restoreCursorState([<editorCommon.ICursorState>cursorState]);
			}

			this._contributions.restoreViewState(codeEditorState.contributionsState || {});
			const reducedState = this._modelData.viewModel.reduceRestoreState(codeEditorState.viewState);
			this._modelData.view.restoreState(reducedState);
		}
	}

	public handleInitialized(): void {
		this._getViewModel()?.visibleLinesStabilized();
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

		try {
			this._onWillTriggerEditorOperationEvent.fire({ source: source, handlerId: handlerId, payload: payload });
			this._beginUpdate();

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
					const args = <Partial<editorBrowser.PastePayload>>payload;
					this._paste(source, args.text || '', args.pasteOnNewLine || false, args.multicursorText || null, args.mode || null, args.clipboardEvent);
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
		} finally {
			this._endUpdate();
		}
	}

	protected _triggerCommand(handlerId: string, payload: any): void {
		this._commandService.executeCommand(handlerId, payload);
	}

	private _startComposition(): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.startComposition();
		this._onDidCompositionStart.fire();
	}

	private _endComposition(source: string | null | undefined): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.endComposition(source);
		this._onDidCompositionEnd.fire();
	}

	private _type(source: string | null | undefined, text: string): void {
		if (!this._modelData || text.length === 0) {
			return;
		}
		if (source === 'keyboard') {
			this._onWillType.fire(text);
		}
		this._modelData.viewModel.type(text, source);
		if (source === 'keyboard') {
			this._onDidType.fire(text);
		}
	}

	private _compositionType(source: string | null | undefined, text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source);
	}

	private _paste(source: string | null | undefined, text: string, pasteOnNewLine: boolean, multicursorText: string[] | null, mode: string | null, clipboardEvent?: ClipboardEvent): void {
		if (!this._modelData) {
			return;
		}
		const viewModel = this._modelData.viewModel;
		const startPosition = viewModel.getSelection().getStartPosition();
		viewModel.paste(text, pasteOnNewLine, multicursorText, source);
		const endPosition = viewModel.getSelection().getStartPosition();
		if (source === 'keyboard') {
			this._onDidPaste.fire({
				clipboardEvent,
				range: new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
				languageId: mode
			});
		}
	}

	private _cut(source: string | null | undefined): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.cut(source);
	}

	private _triggerEditorCommand(source: string | null | undefined, handlerId: string, payload: any): boolean {
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

	public _getViewModel(): IViewModel | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.viewModel;
	}

	public pushUndoStop(): boolean {
		if (!this._modelData) {
			return false;
		}
		if (this._configuration.options.get(EditorOption.readOnly)) {
			// read only editor => sorry!
			return false;
		}
		this._modelData.model.pushStackElement();
		return true;
	}

	public popUndoStop(): boolean {
		if (!this._modelData) {
			return false;
		}
		if (this._configuration.options.get(EditorOption.readOnly)) {
			// read only editor => sorry!
			return false;
		}
		this._modelData.model.popStackElement();
		return true;
	}

	public executeEdits(source: string | null | undefined, edits: IIdentifiedSingleEditOperation[], endCursorState?: ICursorStateComputer | Selection[]): boolean {
		if (!this._modelData) {
			return false;
		}
		if (this._configuration.options.get(EditorOption.readOnly)) {
			// read only editor => sorry!
			return false;
		}

		let cursorStateComputer: ICursorStateComputer;
		if (!endCursorState) {
			cursorStateComputer = () => null;
		} else if (Array.isArray(endCursorState)) {
			cursorStateComputer = () => endCursorState;
		} else {
			cursorStateComputer = endCursorState;
		}

		this._modelData.viewModel.executeEdits(source, edits, cursorStateComputer);
		return true;
	}

	public executeCommand(source: string | null | undefined, command: editorCommon.ICommand): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.executeCommand(command, source);
	}

	public executeCommands(source: string | null | undefined, commands: editorCommon.ICommand[]): void {
		if (!this._modelData) {
			return;
		}
		this._modelData.viewModel.executeCommands(commands, source);
	}

	public createDecorationsCollection(decorations?: IModelDeltaDecoration[]): EditorDecorationsCollection {
		return new EditorDecorationsCollection(this, decorations);
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
		return this._modelData.model.getLineDecorations(lineNumber, this._id, filterValidationDecorations(this._configuration.options));
	}

	public getDecorationsInRange(range: Range): IModelDecoration[] | null {
		if (!this._modelData) {
			return null;
		}
		return this._modelData.model.getDecorationsInRange(range, this._id, filterValidationDecorations(this._configuration.options));
	}

	/**
	 * @deprecated
	 */
	public deltaDecorations(oldDecorations: string[], newDecorations: IModelDeltaDecoration[]): string[] {
		if (!this._modelData) {
			return [];
		}

		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			return oldDecorations;
		}

		return this._modelData.model.deltaDecorations(oldDecorations, newDecorations, this._id);
	}

	public removeDecorations(decorationIds: string[]): void {
		if (!this._modelData || decorationIds.length === 0) {
			return;
		}

		this._modelData.model.changeDecorations((changeAccessor) => {
			changeAccessor.deltaDecorations(decorationIds, []);
		});
	}

	public setDecorationsByType(description: string, decorationTypeKey: string, decorationOptions: editorCommon.IDecorationOptions[]): void {

		const newDecorationsSubTypes: { [key: string]: boolean } = {};
		const oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
		this._decorationTypeSubtypes[decorationTypeKey] = newDecorationsSubTypes;

		const newModelDecorations: IModelDeltaDecoration[] = [];

		for (const decorationOption of decorationOptions) {
			let typeKey = decorationTypeKey;
			if (decorationOption.renderOptions) {
				// identify custom render options by a hash code over all keys and values
				// For custom render options register a decoration type if necessary
				const subType = hash(decorationOption.renderOptions).toString(16);
				// The fact that `decorationTypeKey` appears in the typeKey has no influence
				// it is just a mechanism to get predictable and unique keys (repeatable for the same options and unique across clients)
				typeKey = decorationTypeKey + '-' + subType;
				if (!oldDecorationsSubTypes[subType] && !newDecorationsSubTypes[subType]) {
					// decoration type did not exist before, register new one
					this._registerDecorationType(description, typeKey, decorationOption.renderOptions, decorationTypeKey);
				}
				newDecorationsSubTypes[subType] = true;
			}
			const opts = this._resolveDecorationOptions(typeKey, !!decorationOption.hoverMessage);
			if (decorationOption.hoverMessage) {
				opts.hoverMessage = decorationOption.hoverMessage;
			}
			newModelDecorations.push({ range: decorationOption.range, options: opts });
		}

		// remove decoration sub types that are no longer used, deregister decoration type if necessary
		for (const subType in oldDecorationsSubTypes) {
			if (!newDecorationsSubTypes[subType]) {
				this._removeDecorationType(decorationTypeKey + '-' + subType);
			}
		}

		// update all decorations
		const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this.changeDecorations(accessor => this._decorationTypeKeysToIds[decorationTypeKey] = accessor.deltaDecorations(oldDecorationsIds, newModelDecorations));
	}

	public setDecorationsByTypeFast(decorationTypeKey: string, ranges: IRange[]): void {

		// remove decoration sub types that are no longer used, deregister decoration type if necessary
		const oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
		for (const subType in oldDecorationsSubTypes) {
			this._removeDecorationType(decorationTypeKey + '-' + subType);
		}
		this._decorationTypeSubtypes[decorationTypeKey] = {};

		const opts = ModelDecorationOptions.createDynamic(this._resolveDecorationOptions(decorationTypeKey, false));
		const newModelDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(ranges.length);
		for (let i = 0, len = ranges.length; i < len; i++) {
			newModelDecorations[i] = { range: ranges[i], options: opts };
		}

		// update all decorations
		const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
		this.changeDecorations(accessor => this._decorationTypeKeysToIds[decorationTypeKey] = accessor.deltaDecorations(oldDecorationsIds, newModelDecorations));
	}

	public removeDecorationsByType(decorationTypeKey: string): void {
		// remove decorations for type and sub type
		const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey];
		if (oldDecorationsIds) {
			this.changeDecorations(accessor => accessor.deltaDecorations(oldDecorationsIds, []));
		}
		if (this._decorationTypeKeysToIds.hasOwnProperty(decorationTypeKey)) {
			delete this._decorationTypeKeysToIds[decorationTypeKey];
		}
		if (this._decorationTypeSubtypes.hasOwnProperty(decorationTypeKey)) {
			delete this._decorationTypeSubtypes[decorationTypeKey];
		}
	}

	public getLayoutInfo(): EditorLayoutInfo {
		const options = this._configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);
		return layoutInfo;
	}

	public createOverviewRuler(cssClassName: string): editorBrowser.IOverviewRuler | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}
		return this._modelData.view.createOverviewRuler(cssClassName);
	}

	public getContainerDomNode(): HTMLElement {
		return this._domElement;
	}

	public getDomNode(): HTMLElement | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}
		return this._modelData.view.domNode.domNode;
	}

	public delegateVerticalScrollbarPointerDown(browserEvent: PointerEvent): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.delegateVerticalScrollbarPointerDown(browserEvent);
	}

	public delegateScrollFromMouseWheelEvent(browserEvent: IMouseWheelEvent) {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.delegateScrollFromMouseWheelEvent(browserEvent);
	}

	public layout(dimension?: IDimension, postponeRendering: boolean = false): void {
		this._configuration.observeContainer(dimension);
		if (!postponeRendering) {
			this.render();
		}
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
		const widgetData: IContentWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this._contentWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting a content widget with the same id:' + widget.getId());
		}

		this._contentWidgets[widget.getId()] = widgetData;

		if (this._modelData && this._modelData.hasRealView) {
			this._modelData.view.addContentWidget(widgetData);
		}
	}

	public layoutContentWidget(widget: editorBrowser.IContentWidget): void {
		const widgetId = widget.getId();
		if (this._contentWidgets.hasOwnProperty(widgetId)) {
			const widgetData = this._contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.layoutContentWidget(widgetData);
			}
		}
	}

	public removeContentWidget(widget: editorBrowser.IContentWidget): void {
		const widgetId = widget.getId();
		if (this._contentWidgets.hasOwnProperty(widgetId)) {
			const widgetData = this._contentWidgets[widgetId];
			delete this._contentWidgets[widgetId];
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.removeContentWidget(widgetData);
			}
		}
	}

	public addOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		const widgetData: IOverlayWidgetData = {
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
		const widgetId = widget.getId();
		if (this._overlayWidgets.hasOwnProperty(widgetId)) {
			const widgetData = this._overlayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.layoutOverlayWidget(widgetData);
			}
		}
	}

	public removeOverlayWidget(widget: editorBrowser.IOverlayWidget): void {
		const widgetId = widget.getId();
		if (this._overlayWidgets.hasOwnProperty(widgetId)) {
			const widgetData = this._overlayWidgets[widgetId];
			delete this._overlayWidgets[widgetId];
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.removeOverlayWidget(widgetData);
			}
		}
	}

	public addGlyphMarginWidget(widget: editorBrowser.IGlyphMarginWidget): void {
		const widgetData: IGlyphMarginWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this._glyphMarginWidgets.hasOwnProperty(widget.getId())) {
			console.warn('Overwriting a glyph margin widget with the same id.');
		}

		this._glyphMarginWidgets[widget.getId()] = widgetData;

		if (this._modelData && this._modelData.hasRealView) {
			this._modelData.view.addGlyphMarginWidget(widgetData);
		}
	}

	public layoutGlyphMarginWidget(widget: editorBrowser.IGlyphMarginWidget): void {
		const widgetId = widget.getId();
		if (this._glyphMarginWidgets.hasOwnProperty(widgetId)) {
			const widgetData = this._glyphMarginWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.layoutGlyphMarginWidget(widgetData);
			}
		}
	}

	public removeGlyphMarginWidget(widget: editorBrowser.IGlyphMarginWidget): void {
		const widgetId = widget.getId();
		if (this._glyphMarginWidgets.hasOwnProperty(widgetId)) {
			const widgetData = this._glyphMarginWidgets[widgetId];
			delete this._glyphMarginWidgets[widgetId];
			if (this._modelData && this._modelData.hasRealView) {
				this._modelData.view.removeGlyphMarginWidget(widgetData);
			}
		}
	}

	public changeViewZones(callback: (accessor: editorBrowser.IViewZoneChangeAccessor) => void): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.change(callback);
	}

	public getTargetAtClientPoint(clientX: number, clientY: number): editorBrowser.IMouseTarget | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}
		return this._modelData.view.getTargetAtClientPoint(clientX, clientY);
	}

	public getScrolledVisiblePosition(rawPosition: IPosition): { top: number; left: number; height: number } | null {
		if (!this._modelData || !this._modelData.hasRealView) {
			return null;
		}

		const position = this._modelData.model.validatePosition(rawPosition);
		const options = this._configuration.options;
		const layoutInfo = options.get(EditorOption.layoutInfo);

		const top = CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, position.lineNumber, position.column) - this.getScrollTop();
		const left = this._modelData.view.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - this.getScrollLeft();

		return {
			top: top,
			left: left,
			height: options.get(EditorOption.lineHeight)
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
		this._modelData.viewModel.batchEvents(() => {
			this._modelData!.view.render(true, forceRedraw);
		});
	}

	public setAriaOptions(options: editorBrowser.IEditorAriaOptions): void {
		if (!this._modelData || !this._modelData.hasRealView) {
			return;
		}
		this._modelData.view.setAriaOptions(options);
	}

	public applyFontInfo(target: HTMLElement): void {
		applyFontInfo(target, this._configuration.options.get(EditorOption.fontInfo));
	}

	public setBanner(domNode: HTMLElement | null, domNodeHeight: number): void {
		if (this._bannerDomNode && this._domElement.contains(this._bannerDomNode)) {
			this._bannerDomNode.remove();
		}

		this._bannerDomNode = domNode;
		this._configuration.setReservedHeight(domNode ? domNodeHeight : 0);

		if (this._bannerDomNode) {
			this._domElement.prepend(this._bannerDomNode);
		}
	}

	protected _attachModel(model: ITextModel | null): void {
		if (!model) {
			this._modelData = null;
			return;
		}

		const listenersToRemove: IDisposable[] = [];

		this._domElement.setAttribute('data-mode-id', model.getLanguageId());
		this._configuration.setIsDominatedByLongLines(model.isDominatedByLongLines());
		this._configuration.setModelLineCount(model.getLineCount());

		const attachedView = model.onBeforeAttached();

		const viewModel = new ViewModel(
			this._id,
			this._configuration,
			model,
			DOMLineBreaksComputerFactory.create(dom.getWindow(this._domElement)),
			MonospaceLineBreaksComputerFactory.create(this._configuration.options),
			(callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(this._domElement), callback),
			this.languageConfigurationService,
			this._themeService,
			attachedView,
			{
				batchChanges: (cb) => {
					try {
						this._beginUpdate();
						return cb();
					} finally {
						this._endUpdate();
					}
				},
			}
		);

		// Someone might destroy the model from under the editor, so prevent any exceptions by setting a null model
		listenersToRemove.push(model.onWillDispose(() => this.setModel(null)));

		listenersToRemove.push(viewModel.onEvent((e) => {
			switch (e.kind) {
				case OutgoingViewModelEventKind.ContentSizeChanged:
					this._onDidContentSizeChange.fire(e);
					break;
				case OutgoingViewModelEventKind.FocusChanged:
					this._editorTextFocus.setValue(e.hasFocus);
					break;
				case OutgoingViewModelEventKind.ScrollChanged:
					this._onDidScrollChange.fire(e);
					break;
				case OutgoingViewModelEventKind.ViewZonesChanged:
					this._onDidChangeViewZones.fire();
					break;
				case OutgoingViewModelEventKind.HiddenAreasChanged:
					this._onDidChangeHiddenAreas.fire();
					break;
				case OutgoingViewModelEventKind.ReadOnlyEditAttempt:
					this._onDidAttemptReadOnlyEdit.fire();
					break;
				case OutgoingViewModelEventKind.CursorStateChanged: {
					if (e.reachedMaxCursorCount) {

						const multiCursorLimit = this.getOption(EditorOption.multiCursorLimit);
						const message = nls.localize('cursors.maximum', "The number of cursors has been limited to {0}. Consider using [find and replace](https://code.visualstudio.com/docs/editor/codebasics#_find-and-replace) for larger changes or increase the editor multi cursor limit setting.", multiCursorLimit);
						this._notificationService.prompt(Severity.Warning, message, [
							{
								label: 'Find and Replace',
								run: () => {
									this._commandService.executeCommand('editor.action.startFindReplaceAction');
								}
							},
							{
								label: nls.localize('goToSetting', 'Increase Multi Cursor Limit'),
								run: () => {
									this._commandService.executeCommand('workbench.action.openSettings2', {
										query: 'editor.multiCursorLimit'
									});
								}
							}
						]);
					}

					const positions: Position[] = [];
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
						modelVersionId: e.modelVersionId,
						oldSelections: e.oldSelections,
						oldModelVersionId: e.oldModelVersionId,
						source: e.source,
						reason: e.reason
					};
					this._onDidChangeCursorSelection.fire(e2);

					break;
				}
				case OutgoingViewModelEventKind.ModelDecorationsChanged:
					this._onDidChangeModelDecorations.fire(e.event);
					break;
				case OutgoingViewModelEventKind.ModelLanguageChanged:
					this._domElement.setAttribute('data-mode-id', model.getLanguageId());
					this._onDidChangeModelLanguage.fire(e.event);
					break;
				case OutgoingViewModelEventKind.ModelLanguageConfigurationChanged:
					this._onDidChangeModelLanguageConfiguration.fire(e.event);
					break;
				case OutgoingViewModelEventKind.ModelContentChanged:
					this._onDidChangeModelContent.fire(e.event);
					break;
				case OutgoingViewModelEventKind.ModelOptionsChanged:
					this._onDidChangeModelOptions.fire(e.event);
					break;
				case OutgoingViewModelEventKind.ModelTokensChanged:
					this._onDidChangeModelTokens.fire(e.event);
					break;

			}
		}));

		const [view, hasRealView] = this._createView(viewModel);
		if (hasRealView) {
			this._domElement.appendChild(view.domNode.domNode);

			let keys = Object.keys(this._contentWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				const widgetId = keys[i];
				view.addContentWidget(this._contentWidgets[widgetId]);
			}

			keys = Object.keys(this._overlayWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				const widgetId = keys[i];
				view.addOverlayWidget(this._overlayWidgets[widgetId]);
			}

			keys = Object.keys(this._glyphMarginWidgets);
			for (let i = 0, len = keys.length; i < len; i++) {
				const widgetId = keys[i];
				view.addGlyphMarginWidget(this._glyphMarginWidgets[widgetId]);
			}

			view.render(false, true);
			view.domNode.domNode.setAttribute('data-uri', model.uri.toString());
		}

		this._modelData = new ModelData(model, viewModel, view, hasRealView, listenersToRemove, attachedView);
	}

	protected _createView(viewModel: ViewModel): [View, boolean] {
		let commandDelegate: ICommandDelegate;
		if (this.isSimpleWidget) {
			commandDelegate = {
				paste: (text: string, pasteOnNewLine: boolean, multicursorText: string[] | null, mode: string | null) => {
					this._paste('keyboard', text, pasteOnNewLine, multicursorText, mode);
				},
				type: (text: string) => {
					this._type('keyboard', text);
				},
				compositionType: (text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number) => {
					this._compositionType('keyboard', text, replacePrevCharCnt, replaceNextCharCnt, positionDelta);
				},
				startComposition: () => {
					this._startComposition();
				},
				endComposition: () => {
					this._endComposition('keyboard');
				},
				cut: () => {
					this._cut('keyboard');
				}
			};
		} else {
			commandDelegate = {
				paste: (text: string, pasteOnNewLine: boolean, multicursorText: string[] | null, mode: string | null) => {
					const payload: editorBrowser.PastePayload = { text, pasteOnNewLine, multicursorText, mode };
					this._commandService.executeCommand(editorCommon.Handler.Paste, payload);
				},
				type: (text: string) => {
					const payload: editorCommon.TypePayload = { text };
					this._commandService.executeCommand(editorCommon.Handler.Type, payload);
				},
				compositionType: (text: string, replacePrevCharCnt: number, replaceNextCharCnt: number, positionDelta: number) => {
					// Try if possible to go through the existing `replacePreviousChar` command
					if (replaceNextCharCnt || positionDelta) {
						// must be handled through the new command
						const payload: editorCommon.CompositionTypePayload = { text, replacePrevCharCnt, replaceNextCharCnt, positionDelta };
						this._commandService.executeCommand(editorCommon.Handler.CompositionType, payload);
					} else {
						const payload: editorCommon.ReplacePreviousCharPayload = { text, replaceCharCnt: replacePrevCharCnt };
						this._commandService.executeCommand(editorCommon.Handler.ReplacePreviousChar, payload);
					}
				},
				startComposition: () => {
					this._commandService.executeCommand(editorCommon.Handler.CompositionStart, {});
				},
				endComposition: () => {
					this._commandService.executeCommand(editorCommon.Handler.CompositionEnd, {});
				},
				cut: () => {
					this._commandService.executeCommand(editorCommon.Handler.Cut, {});
				}
			};
		}

		const viewUserInputEvents = new ViewUserInputEvents(viewModel.coordinatesConverter);
		viewUserInputEvents.onKeyDown = (e) => this._onKeyDown.fire(e);
		viewUserInputEvents.onKeyUp = (e) => this._onKeyUp.fire(e);
		viewUserInputEvents.onContextMenu = (e) => this._onContextMenu.fire(e);
		viewUserInputEvents.onMouseMove = (e) => this._onMouseMove.fire(e);
		viewUserInputEvents.onMouseLeave = (e) => this._onMouseLeave.fire(e);
		viewUserInputEvents.onMouseDown = (e) => this._onMouseDown.fire(e);
		viewUserInputEvents.onMouseUp = (e) => this._onMouseUp.fire(e);
		viewUserInputEvents.onMouseDrag = (e) => this._onMouseDrag.fire(e);
		viewUserInputEvents.onMouseDrop = (e) => this._onMouseDrop.fire(e);
		viewUserInputEvents.onMouseDropCanceled = (e) => this._onMouseDropCanceled.fire(e);
		viewUserInputEvents.onMouseWheel = (e) => this._onMouseWheel.fire(e);

		const view = new View(
			commandDelegate,
			this._configuration,
			this._themeService.getColorTheme(),
			viewModel,
			viewUserInputEvents,
			this._overflowWidgetsDomNode,
			this._instantiationService
		);

		return [view, true];
	}

	protected _postDetachModelCleanup(detachedModel: ITextModel | null): void {
		detachedModel?.removeAllDecorationsWithOwnerId(this._id);
	}

	private _detachModel(): ITextModel | null {
		this._contributionsDisposable?.dispose();
		this._contributionsDisposable = undefined;
		if (!this._modelData) {
			return null;
		}
		const model = this._modelData.model;
		const removeDomNode = this._modelData.hasRealView ? this._modelData.view.domNode.domNode : null;

		this._modelData.dispose();
		this._modelData = null;

		this._domElement.removeAttribute('data-mode-id');
		if (removeDomNode && this._domElement.contains(removeDomNode)) {
			removeDomNode.remove();
		}
		if (this._bannerDomNode && this._domElement.contains(this._bannerDomNode)) {
			this._bannerDomNode.remove();
		}
		return model;
	}

	private _registerDecorationType(description: string, key: string, options: editorCommon.IDecorationRenderOptions, parentTypeKey?: string): void {
		this._codeEditorService.registerDecorationType(description, key, options, parentTypeKey, this);
	}

	private _removeDecorationType(key: string): void {
		this._codeEditorService.removeDecorationType(key);
	}

	private _resolveDecorationOptions(typeKey: string, writable: boolean): IModelDecorationOptions {
		return this._codeEditorService.resolveDecorationOptions(typeKey, writable);
	}

	public getTelemetryData(): { [key: string]: any } | undefined {
		return this._telemetryData;
	}

	public hasModel(): this is editorBrowser.IActiveCodeEditor {
		return (this._modelData !== null);
	}

	private showDropIndicatorAt(position: Position): void {
		const newDecorations: IModelDeltaDecoration[] = [{
			range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			options: CodeEditorWidget.dropIntoEditorDecorationOptions
		}];

		this._dropIntoEditorDecorations.set(newDecorations);
		this.revealPosition(position, editorCommon.ScrollType.Immediate);
	}

	private removeDropIndicator(): void {
		this._dropIntoEditorDecorations.clear();
	}

	public setContextValue(key: string, value: ContextKeyValue): void {
		this._contextKeyService.createKey(key, value);
	}

	private _beginUpdate(): void {
		this._updateCounter++;
		if (this._updateCounter === 1) {
			this._onBeginUpdate.fire();
		}
	}

	private _endUpdate(): void {
		this._updateCounter--;
		if (this._updateCounter === 0) {
			this._onEndUpdate.fire();
		}
	}
}

let EDITOR_ID = 0;

export interface ICodeEditorWidgetOptions {
	/**
	 * Is this a simple widget (not a real code editor)?
	 * Defaults to false.
	 */
	isSimpleWidget?: boolean;

	/**
	 * Contributions to instantiate.
	 * When provided, only the contributions included will be instantiated.
	 * To include the defaults, those must be provided as well via [...EditorExtensionsRegistry.getEditorContributions()]
	 * Defaults to EditorExtensionsRegistry.getEditorContributions().
	 */
	contributions?: IEditorContributionDescription[];

	/**
	 * Telemetry data associated with this CodeEditorWidget.
	 * Defaults to null.
	 */
	telemetryData?: object;

	/**
	 * The ID of the context menu.
	 * Defaults to MenuId.SimpleEditorContext or MenuId.EditorContext depending on whether the widget is simple.
	 */
	contextMenuId?: MenuId;
}

class ModelData {
	constructor(
		public readonly model: ITextModel,
		public readonly viewModel: ViewModel,
		public readonly view: View,
		public readonly hasRealView: boolean,
		public readonly listenersToRemove: IDisposable[],
		public readonly attachedView: IAttachedView,
	) {
	}

	public dispose(): void {
		dispose(this.listenersToRemove);
		this.model.onBeforeDetached(this.attachedView);
		if (this.hasRealView) {
			this.view.dispose();
		}
		this.viewModel.dispose();
	}
}

const enum BooleanEventValue {
	NotSet,
	False,
	True
}

export class BooleanEventEmitter extends Disposable {
	private readonly _onDidChangeToTrue: Emitter<void> = this._register(new Emitter<void>(this._emitterOptions));
	public readonly onDidChangeToTrue: Event<void> = this._onDidChangeToTrue.event;

	private readonly _onDidChangeToFalse: Emitter<void> = this._register(new Emitter<void>(this._emitterOptions));
	public readonly onDidChangeToFalse: Event<void> = this._onDidChangeToFalse.event;

	private _value: BooleanEventValue;

	constructor(
		private readonly _emitterOptions: EmitterOptions
	) {
		super();
		this._value = BooleanEventValue.NotSet;
	}

	public setValue(_value: boolean) {
		const value = (_value ? BooleanEventValue.True : BooleanEventValue.False);
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

/**
 * A regular event emitter that also makes sure contributions are instantiated if necessary
 */
class InteractionEmitter<T> extends Emitter<T> {

	constructor(
		private readonly _contributions: CodeEditorContributions,
		deliveryQueue: EventDeliveryQueue
	) {
		super({ deliveryQueue });
	}

	override fire(event: T): void {
		this._contributions.onBeforeInteractionEvent();
		super.fire(event);
	}
}

class EditorContextKeysManager extends Disposable {

	private readonly _editor: CodeEditorWidget;
	private readonly _editorSimpleInput: IContextKey<boolean>;
	private readonly _editorFocus: IContextKey<boolean>;
	private readonly _textInputFocus: IContextKey<boolean>;
	private readonly _editorTextFocus: IContextKey<boolean>;
	private readonly _tabMovesFocus: IContextKey<boolean>;
	private readonly _editorReadonly: IContextKey<boolean>;
	private readonly _inDiffEditor: IContextKey<boolean>;
	private readonly _editorColumnSelection: IContextKey<boolean>;
	private readonly _hasMultipleSelections: IContextKey<boolean>;
	private readonly _hasNonEmptySelection: IContextKey<boolean>;
	private readonly _canUndo: IContextKey<boolean>;
	private readonly _canRedo: IContextKey<boolean>;

	constructor(
		editor: CodeEditorWidget,
		contextKeyService: IContextKeyService
	) {
		super();

		this._editor = editor;

		contextKeyService.createKey('editorId', editor.getId());

		this._editorSimpleInput = EditorContextKeys.editorSimpleInput.bindTo(contextKeyService);
		this._editorFocus = EditorContextKeys.focus.bindTo(contextKeyService);
		this._textInputFocus = EditorContextKeys.textInputFocus.bindTo(contextKeyService);
		this._editorTextFocus = EditorContextKeys.editorTextFocus.bindTo(contextKeyService);
		this._tabMovesFocus = EditorContextKeys.tabMovesFocus.bindTo(contextKeyService);
		this._editorReadonly = EditorContextKeys.readOnly.bindTo(contextKeyService);
		this._inDiffEditor = EditorContextKeys.inDiffEditor.bindTo(contextKeyService);
		this._editorColumnSelection = EditorContextKeys.columnSelection.bindTo(contextKeyService);
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
		this._register(TabFocus.onDidChangeTabFocus((tabFocusMode: boolean) => this._tabMovesFocus.set(tabFocusMode)));

		this._updateFromConfig();
		this._updateFromSelection();
		this._updateFromFocus();
		this._updateFromModel();

		this._editorSimpleInput.set(this._editor.isSimpleWidget);
	}

	private _updateFromConfig(): void {
		const options = this._editor.getOptions();

		this._tabMovesFocus.set(TabFocus.getTabFocusMode());
		this._editorReadonly.set(options.get(EditorOption.readOnly));
		this._inDiffEditor.set(options.get(EditorOption.inDiffEditor));
		this._editorColumnSelection.set(options.get(EditorOption.columnSelection));
	}

	private _updateFromSelection(): void {
		const selections = this._editor.getSelections();
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

	private readonly _langId: IContextKey<string>;
	private readonly _hasCompletionItemProvider: IContextKey<boolean>;
	private readonly _hasCodeActionsProvider: IContextKey<boolean>;
	private readonly _hasCodeLensProvider: IContextKey<boolean>;
	private readonly _hasDefinitionProvider: IContextKey<boolean>;
	private readonly _hasDeclarationProvider: IContextKey<boolean>;
	private readonly _hasImplementationProvider: IContextKey<boolean>;
	private readonly _hasTypeDefinitionProvider: IContextKey<boolean>;
	private readonly _hasHoverProvider: IContextKey<boolean>;
	private readonly _hasDocumentHighlightProvider: IContextKey<boolean>;
	private readonly _hasDocumentSymbolProvider: IContextKey<boolean>;
	private readonly _hasReferenceProvider: IContextKey<boolean>;
	private readonly _hasRenameProvider: IContextKey<boolean>;
	private readonly _hasDocumentFormattingProvider: IContextKey<boolean>;
	private readonly _hasDocumentSelectionFormattingProvider: IContextKey<boolean>;
	private readonly _hasMultipleDocumentFormattingProvider: IContextKey<boolean>;
	private readonly _hasMultipleDocumentSelectionFormattingProvider: IContextKey<boolean>;
	private readonly _hasSignatureHelpProvider: IContextKey<boolean>;
	private readonly _hasInlayHintsProvider: IContextKey<boolean>;
	private readonly _isInEmbeddedEditor: IContextKey<boolean>;

	constructor(
		private readonly _editor: CodeEditorWidget,
		private readonly _contextKeyService: IContextKeyService,
		private readonly _languageFeaturesService: ILanguageFeaturesService,
	) {
		super();

		this._langId = EditorContextKeys.languageId.bindTo(_contextKeyService);
		this._hasCompletionItemProvider = EditorContextKeys.hasCompletionItemProvider.bindTo(_contextKeyService);
		this._hasCodeActionsProvider = EditorContextKeys.hasCodeActionsProvider.bindTo(_contextKeyService);
		this._hasCodeLensProvider = EditorContextKeys.hasCodeLensProvider.bindTo(_contextKeyService);
		this._hasDefinitionProvider = EditorContextKeys.hasDefinitionProvider.bindTo(_contextKeyService);
		this._hasDeclarationProvider = EditorContextKeys.hasDeclarationProvider.bindTo(_contextKeyService);
		this._hasImplementationProvider = EditorContextKeys.hasImplementationProvider.bindTo(_contextKeyService);
		this._hasTypeDefinitionProvider = EditorContextKeys.hasTypeDefinitionProvider.bindTo(_contextKeyService);
		this._hasHoverProvider = EditorContextKeys.hasHoverProvider.bindTo(_contextKeyService);
		this._hasDocumentHighlightProvider = EditorContextKeys.hasDocumentHighlightProvider.bindTo(_contextKeyService);
		this._hasDocumentSymbolProvider = EditorContextKeys.hasDocumentSymbolProvider.bindTo(_contextKeyService);
		this._hasReferenceProvider = EditorContextKeys.hasReferenceProvider.bindTo(_contextKeyService);
		this._hasRenameProvider = EditorContextKeys.hasRenameProvider.bindTo(_contextKeyService);
		this._hasSignatureHelpProvider = EditorContextKeys.hasSignatureHelpProvider.bindTo(_contextKeyService);
		this._hasInlayHintsProvider = EditorContextKeys.hasInlayHintsProvider.bindTo(_contextKeyService);
		this._hasDocumentFormattingProvider = EditorContextKeys.hasDocumentFormattingProvider.bindTo(_contextKeyService);
		this._hasDocumentSelectionFormattingProvider = EditorContextKeys.hasDocumentSelectionFormattingProvider.bindTo(_contextKeyService);
		this._hasMultipleDocumentFormattingProvider = EditorContextKeys.hasMultipleDocumentFormattingProvider.bindTo(_contextKeyService);
		this._hasMultipleDocumentSelectionFormattingProvider = EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider.bindTo(_contextKeyService);
		this._isInEmbeddedEditor = EditorContextKeys.isInEmbeddedEditor.bindTo(_contextKeyService);

		const update = () => this._update();

		// update when model/mode changes
		this._register(_editor.onDidChangeModel(update));
		this._register(_editor.onDidChangeModelLanguage(update));

		// update when registries change
		this._register(_languageFeaturesService.completionProvider.onDidChange(update));
		this._register(_languageFeaturesService.codeActionProvider.onDidChange(update));
		this._register(_languageFeaturesService.codeLensProvider.onDidChange(update));
		this._register(_languageFeaturesService.definitionProvider.onDidChange(update));
		this._register(_languageFeaturesService.declarationProvider.onDidChange(update));
		this._register(_languageFeaturesService.implementationProvider.onDidChange(update));
		this._register(_languageFeaturesService.typeDefinitionProvider.onDidChange(update));
		this._register(_languageFeaturesService.hoverProvider.onDidChange(update));
		this._register(_languageFeaturesService.documentHighlightProvider.onDidChange(update));
		this._register(_languageFeaturesService.documentSymbolProvider.onDidChange(update));
		this._register(_languageFeaturesService.referenceProvider.onDidChange(update));
		this._register(_languageFeaturesService.renameProvider.onDidChange(update));
		this._register(_languageFeaturesService.documentFormattingEditProvider.onDidChange(update));
		this._register(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(update));
		this._register(_languageFeaturesService.signatureHelpProvider.onDidChange(update));
		this._register(_languageFeaturesService.inlayHintsProvider.onDidChange(update));

		update();
	}

	override dispose() {
		super.dispose();
	}

	reset() {
		this._contextKeyService.bufferChangeEvents(() => {
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
			this._isInEmbeddedEditor.reset();
		});
	}

	private _update() {
		const model = this._editor.getModel();
		if (!model) {
			this.reset();
			return;
		}
		this._contextKeyService.bufferChangeEvents(() => {
			this._langId.set(model.getLanguageId());
			this._hasCompletionItemProvider.set(this._languageFeaturesService.completionProvider.has(model));
			this._hasCodeActionsProvider.set(this._languageFeaturesService.codeActionProvider.has(model));
			this._hasCodeLensProvider.set(this._languageFeaturesService.codeLensProvider.has(model));
			this._hasDefinitionProvider.set(this._languageFeaturesService.definitionProvider.has(model));
			this._hasDeclarationProvider.set(this._languageFeaturesService.declarationProvider.has(model));
			this._hasImplementationProvider.set(this._languageFeaturesService.implementationProvider.has(model));
			this._hasTypeDefinitionProvider.set(this._languageFeaturesService.typeDefinitionProvider.has(model));
			this._hasHoverProvider.set(this._languageFeaturesService.hoverProvider.has(model));
			this._hasDocumentHighlightProvider.set(this._languageFeaturesService.documentHighlightProvider.has(model));
			this._hasDocumentSymbolProvider.set(this._languageFeaturesService.documentSymbolProvider.has(model));
			this._hasReferenceProvider.set(this._languageFeaturesService.referenceProvider.has(model));
			this._hasRenameProvider.set(this._languageFeaturesService.renameProvider.has(model));
			this._hasSignatureHelpProvider.set(this._languageFeaturesService.signatureHelpProvider.has(model));
			this._hasInlayHintsProvider.set(this._languageFeaturesService.inlayHintsProvider.has(model));
			this._hasDocumentFormattingProvider.set(this._languageFeaturesService.documentFormattingEditProvider.has(model) || this._languageFeaturesService.documentRangeFormattingEditProvider.has(model));
			this._hasDocumentSelectionFormattingProvider.set(this._languageFeaturesService.documentRangeFormattingEditProvider.has(model));
			this._hasMultipleDocumentFormattingProvider.set(this._languageFeaturesService.documentFormattingEditProvider.all(model).length + this._languageFeaturesService.documentRangeFormattingEditProvider.all(model).length > 1);
			this._hasMultipleDocumentSelectionFormattingProvider.set(this._languageFeaturesService.documentRangeFormattingEditProvider.all(model).length > 1);
			this._isInEmbeddedEditor.set(model.uri.scheme === Schemas.walkThroughSnippet || model.uri.scheme === Schemas.vscodeChatCodeBlock);
		});
	}
}

class CodeEditorWidgetFocusTracker extends Disposable {

	private _hasDomElementFocus: boolean;
	private readonly _domFocusTracker: dom.IFocusTracker;
	private readonly _overflowWidgetsDomNode: dom.IFocusTracker | undefined;

	private readonly _onChange: Emitter<void> = this._register(new Emitter<void>());
	public readonly onChange: Event<void> = this._onChange.event;

	private _overflowWidgetsDomNodeHasFocus: boolean;

	private _hadFocus: boolean | undefined = undefined;

	constructor(domElement: HTMLElement, overflowWidgetsDomNode: HTMLElement | undefined) {
		super();

		this._hasDomElementFocus = false;
		this._domFocusTracker = this._register(dom.trackFocus(domElement));

		this._overflowWidgetsDomNodeHasFocus = false;

		this._register(this._domFocusTracker.onDidFocus(() => {
			this._hasDomElementFocus = true;
			this._update();
		}));
		this._register(this._domFocusTracker.onDidBlur(() => {
			this._hasDomElementFocus = false;
			this._update();
		}));

		if (overflowWidgetsDomNode) {
			this._overflowWidgetsDomNode = this._register(dom.trackFocus(overflowWidgetsDomNode));
			this._register(this._overflowWidgetsDomNode.onDidFocus(() => {
				this._overflowWidgetsDomNodeHasFocus = true;
				this._update();
			}));
			this._register(this._overflowWidgetsDomNode.onDidBlur(() => {
				this._overflowWidgetsDomNodeHasFocus = false;
				this._update();
			}));
		}
	}

	private _update() {
		const focused = this._hasDomElementFocus || this._overflowWidgetsDomNodeHasFocus;
		if (this._hadFocus !== focused) {
			this._hadFocus = focused;
			this._onChange.fire(undefined);
		}
	}

	public hasFocus(): boolean {
		return this._hadFocus ?? false;
	}

	public refreshState(): void {
		this._domFocusTracker.refreshState();
		this._overflowWidgetsDomNode?.refreshState?.();
	}
}

class EditorDecorationsCollection implements editorCommon.IEditorDecorationsCollection {

	private _decorationIds: string[] = [];
	private _isChangingDecorations: boolean = false;

	public get length(): number {
		return this._decorationIds.length;
	}

	constructor(
		private readonly _editor: editorBrowser.ICodeEditor,
		decorations: IModelDeltaDecoration[] | undefined
	) {
		if (Array.isArray(decorations) && decorations.length > 0) {
			this.set(decorations);
		}
	}

	public onDidChange(listener: (e: IModelDecorationsChangedEvent) => any, thisArgs?: any, disposables?: IDisposable[] | DisposableStore): IDisposable {
		return this._editor.onDidChangeModelDecorations((e) => {
			if (this._isChangingDecorations) {
				return;
			}
			listener.call(thisArgs, e);
		}, disposables);
	}

	public getRange(index: number): Range | null {
		if (!this._editor.hasModel()) {
			return null;
		}
		if (index >= this._decorationIds.length) {
			return null;
		}
		return this._editor.getModel().getDecorationRange(this._decorationIds[index]);
	}

	public getRanges(): Range[] {
		if (!this._editor.hasModel()) {
			return [];
		}
		const model = this._editor.getModel();
		const result: Range[] = [];
		for (const decorationId of this._decorationIds) {
			const range = model.getDecorationRange(decorationId);
			if (range) {
				result.push(range);
			}
		}
		return result;
	}

	public has(decoration: IModelDecoration): boolean {
		return this._decorationIds.includes(decoration.id);
	}

	public clear(): void {
		if (this._decorationIds.length === 0) {
			// nothing to do
			return;
		}
		this.set([]);
	}

	public set(newDecorations: readonly IModelDeltaDecoration[]): string[] {
		try {
			this._isChangingDecorations = true;
			this._editor.changeDecorations((accessor) => {
				this._decorationIds = accessor.deltaDecorations(this._decorationIds, newDecorations);
			});
		} finally {
			this._isChangingDecorations = false;
		}
		return this._decorationIds;
	}

	public append(newDecorations: readonly IModelDeltaDecoration[]): string[] {
		let newDecorationIds: string[] = [];
		try {
			this._isChangingDecorations = true;
			this._editor.changeDecorations((accessor) => {
				newDecorationIds = accessor.deltaDecorations([], newDecorations);
				this._decorationIds = this._decorationIds.concat(newDecorationIds);
			});
		} finally {
			this._isChangingDecorations = false;
		}
		return newDecorationIds;
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
	const errorForeground = theme.getColor(editorErrorForeground);
	if (errorForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorErrorDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}") repeat-x bottom left; }`);
	}
	const warningForeground = theme.getColor(editorWarningForeground);
	if (warningForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorWarningDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(warningForeground)}") repeat-x bottom left; }`);
	}
	const infoForeground = theme.getColor(editorInfoForeground);
	if (infoForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorInfoDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(infoForeground)}") repeat-x bottom left; }`);
	}
	const hintForeground = theme.getColor(editorHintForeground);
	if (hintForeground) {
		collector.addRule(`.monaco-editor .${ClassName.EditorHintDecoration} { background: url("data:image/svg+xml,${getDotDotDotSVGData(hintForeground)}") no-repeat bottom left; }`);
	}
	const unnecessaryForeground = theme.getColor(editorUnnecessaryCodeOpacity);
	if (unnecessaryForeground) {
		collector.addRule(`.monaco-editor.showUnused .${ClassName.EditorUnnecessaryInlineDecoration} { opacity: ${unnecessaryForeground.rgba.a}; }`);
	}
});
