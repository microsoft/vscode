/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/editorgroupview.css';
import { EditorGroupModel, IEditorOpenOptions, IGroupModelChangeEvent, ISerializedEditorGroupModel, isGroupEditorCloseEvent, isGroupEditorOpenEvent, isSerializedEditorGroupModel } from '../../../common/editor/editorGroupModel.js';
import { GroupIdentifier, CloseDirection, IEditorCloseEvent, IEditorPane, SaveReason, IEditorPartOptionsChangeEvent, EditorsOrder, IVisibleEditorPane, EditorResourceAccessor, EditorInputCapabilities, IUntypedEditorInput, DEFAULT_EDITOR_ASSOCIATION, SideBySideEditor, EditorCloseContext, IEditorWillMoveEvent, IEditorWillOpenEvent, IMatchEditorOptions, GroupModelChangeKind, IActiveEditorChangeEvent, IFindEditorOptions, TEXT_DIFF_EDITOR_ID } from '../../../common/editor.js';
import { ActiveEditorGroupLockedContext, ActiveEditorDirtyContext, EditorGroupEditorsCountContext, ActiveEditorStickyContext, ActiveEditorPinnedContext, ActiveEditorLastInGroupContext, ActiveEditorFirstInGroupContext, ResourceContextKey, applyAvailableEditorIds, ActiveEditorAvailableEditorIdsContext, ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext, TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveEditorContext, ActiveEditorReadonlyContext, ActiveEditorCanRevertContext, ActiveEditorCanToggleReadonlyContext, ActiveCompareEditorCanSwapContext, MultipleEditorsSelectedInGroupContext, TwoEditorsSelectedInGroupContext, SelectedEditorsInGroupFileOrUntitledResourceContextKey } from '../../../common/contextkeys.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { SideBySideEditorInput } from '../../../common/editor/sideBySideEditorInput.js';
import { Emitter, Event, Relay } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Dimension, trackFocus, addDisposableListener, EventType, EventHelper, findParentWithClass, isAncestor, IDomNodePagePosition, isMouseEvent, isActiveElement, getWindow, getActiveElement, $ } from '../../../../base/browser/dom.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ProgressBar } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { editorBackground, contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { EDITOR_GROUP_HEADER_TABS_BACKGROUND, EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_EMPTY_BACKGROUND, EDITOR_GROUP_HEADER_BORDER } from '../../../common/theme.js';
import { ICloseEditorsFilter, GroupsOrder, ICloseEditorOptions, ICloseAllEditorsOptions, IEditorReplacement, IActiveEditorActions } from '../../../services/editor/common/editorGroupsService.js';
import { EditorPanes } from './editorPanes.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
import { EditorProgressIndicator } from '../../../services/progress/browser/progressIndicator.js';
import { localize } from '../../../../nls.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { DeferredPromise, Promises, RunOnceWorker } from '../../../../base/common/async.js';
import { EventType as TouchEventType, GestureEvent } from '../../../../base/browser/touch.js';
import { IEditorGroupsView, IEditorGroupView, fillActiveEditorViewState, EditorServiceImpl, IEditorGroupTitleHeight, IInternalEditorOpenOptions, IInternalMoveCopyOptions, IInternalEditorCloseOptions, IInternalEditorTitleControlOptions, IEditorPartsView, IEditorGroupViewOptions } from './editor.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { SubmenuAction } from '../../../../base/common/actions.js';
import { IMenuChangeEvent, IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { getActionBarActions, PrimaryAndSecondaryActions } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { hash } from '../../../../base/common/hash.js';
import { getMimeTypes } from '../../../../editor/common/services/languagesAssociations.js';
import { extname, isEqual } from '../../../../base/common/resources.js';
import { Schemas } from '../../../../base/common/network.js';
import { EditorActivation, IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IFileDialogService, ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFilesConfigurationService, AutoSaveMode } from '../../../services/filesConfiguration/common/filesConfigurationService.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { isLinux, isMacintosh, isNative, isWindows } from '../../../../base/common/platform.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { TelemetryTrustedValue } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { defaultProgressBarStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { IBoundarySashes } from '../../../../base/browser/ui/sash/sash.js';
import { EditorGroupWatermark } from './editorGroupWatermark.js';
import { EditorTitleControl } from './editorTitleControl.js';
import { EditorPane } from './editorPane.js';
import { IEditorResolverService } from '../../../services/editor/common/editorResolverService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DiffEditorInput } from '../../../common/editor/diffEditorInput.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../platform/files/common/files.js';

export class EditorGroupView extends Themable implements IEditorGroupView {

	//#region factory

	static createNew(editorPartsView: IEditorPartsView, groupsView: IEditorGroupsView, groupsLabel: string, groupIndex: number, instantiationService: IInstantiationService, options?: IEditorGroupViewOptions): IEditorGroupView {
		return instantiationService.createInstance(EditorGroupView, null, editorPartsView, groupsView, groupsLabel, groupIndex, options);
	}

	static createFromSerialized(serialized: ISerializedEditorGroupModel, editorPartsView: IEditorPartsView, groupsView: IEditorGroupsView, groupsLabel: string, groupIndex: number, instantiationService: IInstantiationService, options?: IEditorGroupViewOptions): IEditorGroupView {
		return instantiationService.createInstance(EditorGroupView, serialized, editorPartsView, groupsView, groupsLabel, groupIndex, options);
	}

	static createCopy(copyFrom: IEditorGroupView, editorPartsView: IEditorPartsView, groupsView: IEditorGroupsView, groupsLabel: string, groupIndex: number, instantiationService: IInstantiationService, options?: IEditorGroupViewOptions): IEditorGroupView {
		return instantiationService.createInstance(EditorGroupView, copyFrom, editorPartsView, groupsView, groupsLabel, groupIndex, options);
	}

	//#endregion

	/**
	 * Access to the context key service scoped to this editor group.
	 */
	readonly scopedContextKeyService: IContextKeyService;

	//#region events

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private readonly _onDidModelChange = this._register(new Emitter<IGroupModelChangeEvent>());
	readonly onDidModelChange = this._onDidModelChange.event;

	private readonly _onDidActiveEditorChange = this._register(new Emitter<IActiveEditorChangeEvent>());
	readonly onDidActiveEditorChange = this._onDidActiveEditorChange.event;

	private readonly _onDidOpenEditorFail = this._register(new Emitter<EditorInput>());
	readonly onDidOpenEditorFail = this._onDidOpenEditorFail.event;

	private readonly _onWillCloseEditor = this._register(new Emitter<IEditorCloseEvent>());
	readonly onWillCloseEditor = this._onWillCloseEditor.event;

	private readonly _onDidCloseEditor = this._register(new Emitter<IEditorCloseEvent>());
	readonly onDidCloseEditor = this._onDidCloseEditor.event;

	private readonly _onWillMoveEditor = this._register(new Emitter<IEditorWillMoveEvent>());
	readonly onWillMoveEditor = this._onWillMoveEditor.event;

	private readonly _onWillOpenEditor = this._register(new Emitter<IEditorWillOpenEvent>());
	readonly onWillOpenEditor = this._onWillOpenEditor.event;

	//#endregion

	private readonly model: EditorGroupModel;

	private active: boolean | undefined;
	private lastLayout: IDomNodePagePosition | undefined;

	private readonly scopedInstantiationService: IInstantiationService;

	private readonly resourceContext: ResourceContextKey;

	private readonly titleContainer: HTMLElement;
	private readonly titleControl: EditorTitleControl;

	private readonly progressBar: ProgressBar;

	private readonly editorContainer: HTMLElement;
	private readonly editorPane: EditorPanes;

	private readonly disposedEditorsWorker = this._register(new RunOnceWorker<EditorInput>(editors => this.handleDisposedEditors(editors), 0));

	private readonly mapEditorToPendingConfirmation = new Map<EditorInput, Promise<boolean>>();

	private readonly containerToolBarMenuDisposable = this._register(new MutableDisposable());

	private readonly whenRestoredPromise = new DeferredPromise<void>();
	readonly whenRestored = this.whenRestoredPromise.p;

	constructor(
		from: IEditorGroupView | ISerializedEditorGroupModel | null,
		private readonly editorPartsView: IEditorPartsView,
		readonly groupsView: IEditorGroupsView,
		private groupsLabel: string,
		private _index: number,
		options: IEditorGroupViewOptions | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IFileDialogService private readonly fileDialogService: IFileDialogService,
		@IEditorService private readonly editorService: EditorServiceImpl,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
		@IEditorResolverService private readonly editorResolverService: IEditorResolverService,
		@IHostService private readonly hostService: IHostService,
		@IDialogService private readonly dialogService: IDialogService,
		@IFileService private readonly fileService: IFileService
	) {
		super(themeService);

		if (from instanceof EditorGroupView) {
			this.model = this._register(from.model.clone());
		} else if (isSerializedEditorGroupModel(from)) {
			this.model = this._register(instantiationService.createInstance(EditorGroupModel, from));
		} else {
			this.model = this._register(instantiationService.createInstance(EditorGroupModel, undefined));
		}

		//#region create()
		{
			// Scoped context key service
			this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));

			// Container
			this.element.classList.add(...coalesce(['editor-group-container', this.model.isLocked ? 'locked' : undefined]));

			// Container listeners
			this.registerContainerListeners();

			// Container toolbar
			this.createContainerToolbar();

			// Container context menu
			this.createContainerContextMenu();

			// Watermark & shortcuts
			this._register(this.instantiationService.createInstance(EditorGroupWatermark, this.element));

			// Progress bar
			this.progressBar = this._register(new ProgressBar(this.element, defaultProgressBarStyles));
			this.progressBar.hide();

			// Scoped instantiation service
			this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, this.scopedContextKeyService],
				[IEditorProgressService, this._register(new EditorProgressIndicator(this.progressBar, this))]
			)));

			// Context keys
			this.resourceContext = this._register(this.scopedInstantiationService.createInstance(ResourceContextKey));
			this.handleGroupContextKeys();

			// Title container
			this.titleContainer = $('.title');
			this.element.appendChild(this.titleContainer);

			// Title control
			this.titleControl = this._register(this.scopedInstantiationService.createInstance(EditorTitleControl, this.titleContainer, this.editorPartsView, this.groupsView, this, this.model));

			// Editor container
			this.editorContainer = $('.editor-container');
			this.element.appendChild(this.editorContainer);

			// Editor pane
			this.editorPane = this._register(this.scopedInstantiationService.createInstance(EditorPanes, this.element, this.editorContainer, this));
			this._onDidChange.input = this.editorPane.onDidChangeSizeConstraints;

			// Track Focus
			this.doTrackFocus();

			// Update containers
			this.updateTitleContainer();
			this.updateContainer();

			// Update styles
			this.updateStyles();
		}
		//#endregion

		// Restore editors if provided
		const restoreEditorsPromise = this.restoreEditors(from, options) ?? Promise.resolve();

		// Signal restored once editors have restored
		restoreEditorsPromise.finally(() => {
			this.whenRestoredPromise.complete();
		});

		// Register Listeners
		this.registerListeners();
	}

	private handleGroupContextKeys(): void {
		const groupActiveEditorDirtyContext = this.editorPartsView.bind(ActiveEditorDirtyContext, this);
		const groupActiveEditorPinnedContext = this.editorPartsView.bind(ActiveEditorPinnedContext, this);
		const groupActiveEditorFirstContext = this.editorPartsView.bind(ActiveEditorFirstInGroupContext, this);
		const groupActiveEditorLastContext = this.editorPartsView.bind(ActiveEditorLastInGroupContext, this);
		const groupActiveEditorStickyContext = this.editorPartsView.bind(ActiveEditorStickyContext, this);
		const groupEditorsCountContext = this.editorPartsView.bind(EditorGroupEditorsCountContext, this);
		const groupLockedContext = this.editorPartsView.bind(ActiveEditorGroupLockedContext, this);

		const multipleEditorsSelectedContext = MultipleEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
		const twoEditorsSelectedContext = TwoEditorsSelectedInGroupContext.bindTo(this.scopedContextKeyService);
		const selectedEditorsHaveFileOrUntitledResourceContext = SelectedEditorsInGroupFileOrUntitledResourceContextKey.bindTo(this.scopedContextKeyService);

		const groupActiveEditorContext = this.editorPartsView.bind(ActiveEditorContext, this);
		const groupActiveEditorIsReadonly = this.editorPartsView.bind(ActiveEditorReadonlyContext, this);
		const groupActiveEditorCanRevert = this.editorPartsView.bind(ActiveEditorCanRevertContext, this);
		const groupActiveEditorCanToggleReadonly = this.editorPartsView.bind(ActiveEditorCanToggleReadonlyContext, this);
		const groupActiveCompareEditorCanSwap = this.editorPartsView.bind(ActiveCompareEditorCanSwapContext, this);
		const groupTextCompareEditorVisibleContext = this.editorPartsView.bind(TextCompareEditorVisibleContext, this);
		const groupTextCompareEditorActiveContext = this.editorPartsView.bind(TextCompareEditorActiveContext, this);

		const groupActiveEditorAvailableEditorIds = this.editorPartsView.bind(ActiveEditorAvailableEditorIdsContext, this);
		const groupActiveEditorCanSplitInGroupContext = this.editorPartsView.bind(ActiveEditorCanSplitInGroupContext, this);
		const groupActiveEditorIsSideBySideEditorContext = this.editorPartsView.bind(SideBySideEditorActiveContext, this);

		const activeEditorListener = this._register(new MutableDisposable());

		const observeActiveEditor = () => {
			activeEditorListener.clear();

			this.scopedContextKeyService.bufferChangeEvents(() => {
				const activeEditor = this.activeEditor;
				const activeEditorPane = this.activeEditorPane;

				this.resourceContext.set(EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }));

				applyAvailableEditorIds(groupActiveEditorAvailableEditorIds, activeEditor, this.editorResolverService);

				if (activeEditor) {
					groupActiveEditorCanSplitInGroupContext.set(activeEditor.hasCapability(EditorInputCapabilities.CanSplitInGroup));
					groupActiveEditorIsSideBySideEditorContext.set(activeEditor.typeId === SideBySideEditorInput.ID);

					groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
					activeEditorListener.value = activeEditor.onDidChangeDirty(() => {
						groupActiveEditorDirtyContext.set(activeEditor.isDirty() && !activeEditor.isSaving());
					});
				} else {
					groupActiveEditorCanSplitInGroupContext.set(false);
					groupActiveEditorIsSideBySideEditorContext.set(false);
					groupActiveEditorDirtyContext.set(false);
				}

				if (activeEditorPane) {
					groupActiveEditorContext.set(activeEditorPane.getId());
					groupActiveEditorCanRevert.set(!activeEditorPane.input.hasCapability(EditorInputCapabilities.Untitled));
					groupActiveEditorIsReadonly.set(!!activeEditorPane.input.isReadonly());

					const primaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.PRIMARY });
					const secondaryEditorResource = EditorResourceAccessor.getOriginalUri(activeEditorPane.input, { supportSideBySide: SideBySideEditor.SECONDARY });
					groupActiveCompareEditorCanSwap.set(activeEditorPane.input instanceof DiffEditorInput && !activeEditorPane.input.original.isReadonly() && !!primaryEditorResource && (this.fileService.hasProvider(primaryEditorResource) || primaryEditorResource.scheme === Schemas.untitled) && !!secondaryEditorResource && (this.fileService.hasProvider(secondaryEditorResource) || secondaryEditorResource.scheme === Schemas.untitled));
					groupActiveEditorCanToggleReadonly.set(!!primaryEditorResource && this.fileService.hasProvider(primaryEditorResource) && !this.fileService.hasCapability(primaryEditorResource, FileSystemProviderCapabilities.Readonly));

					const activePaneDiffEditor = activeEditorPane?.getId() === TEXT_DIFF_EDITOR_ID;
					groupTextCompareEditorActiveContext.set(activePaneDiffEditor);
					groupTextCompareEditorVisibleContext.set(activePaneDiffEditor);
				} else {
					groupActiveEditorContext.reset();
					groupActiveEditorCanRevert.reset();
					groupActiveEditorIsReadonly.reset();
					groupActiveCompareEditorCanSwap.reset();
					groupActiveEditorCanToggleReadonly.reset();
				}
			});
		};

		// Update group contexts based on group changes
		const updateGroupContextKeys = (e: IGroupModelChangeEvent) => {
			switch (e.kind) {
				case GroupModelChangeKind.GROUP_LOCKED:
					groupLockedContext.set(this.isLocked);
					break;
				case GroupModelChangeKind.EDITOR_ACTIVE:
					groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
					groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
					groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
					groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
					break;
				case GroupModelChangeKind.EDITOR_CLOSE:
					groupActiveEditorPinnedContext.set(this.model.activeEditor ? this.model.isPinned(this.model.activeEditor) : false);
					groupActiveEditorStickyContext.set(this.model.activeEditor ? this.model.isSticky(this.model.activeEditor) : false);
					break;
				case GroupModelChangeKind.EDITOR_OPEN:
				case GroupModelChangeKind.EDITOR_MOVE:
					groupActiveEditorFirstContext.set(this.model.isFirst(this.model.activeEditor));
					groupActiveEditorLastContext.set(this.model.isLast(this.model.activeEditor));
					break;
				case GroupModelChangeKind.EDITOR_PIN:
					if (e.editor && e.editor === this.model.activeEditor) {
						groupActiveEditorPinnedContext.set(this.model.isPinned(this.model.activeEditor));
					}
					break;
				case GroupModelChangeKind.EDITOR_STICKY:
					if (e.editor && e.editor === this.model.activeEditor) {
						groupActiveEditorStickyContext.set(this.model.isSticky(this.model.activeEditor));
					}
					break;
				case GroupModelChangeKind.EDITORS_SELECTION:
					multipleEditorsSelectedContext.set(this.model.selectedEditors.length > 1);
					twoEditorsSelectedContext.set(this.model.selectedEditors.length === 2);
					selectedEditorsHaveFileOrUntitledResourceContext.set(this.model.selectedEditors.every(e => e.resource && (this.fileService.hasProvider(e.resource) || e.resource.scheme === Schemas.untitled)));
					break;
			}

			// Group editors count context
			groupEditorsCountContext.set(this.count);
		};

		this._register(this.onDidModelChange(e => updateGroupContextKeys(e)));

		// Track the active editor and update context key that reflects
		// the dirty state of this editor
		this._register(this.onDidActiveEditorChange(() => observeActiveEditor()));

		// Update context keys on startup
		observeActiveEditor();
		updateGroupContextKeys({ kind: GroupModelChangeKind.EDITOR_ACTIVE });
		updateGroupContextKeys({ kind: GroupModelChangeKind.GROUP_LOCKED });
	}

	private registerContainerListeners(): void {

		// Open new file via doubleclick on empty container
		this._register(addDisposableListener(this.element, EventType.DBLCLICK, e => {
			if (this.isEmpty) {
				EventHelper.stop(e);

				this.editorService.openEditor({
					resource: undefined,
					options: {
						pinned: true,
						override: DEFAULT_EDITOR_ASSOCIATION.id
					}
				}, this.id);
			}
		}));

		// Close empty editor group via middle mouse click
		this._register(addDisposableListener(this.element, EventType.AUXCLICK, e => {
			if (this.isEmpty && e.button === 1 /* Middle Button */) {
				EventHelper.stop(e, true);

				this.groupsView.removeGroup(this);
			}
		}));
	}

	private createContainerToolbar(): void {

		// Toolbar Container
		const toolbarContainer = $('.editor-group-container-toolbar');
		this.element.appendChild(toolbarContainer);

		// Toolbar
		const containerToolbar = this._register(new ActionBar(toolbarContainer, {
			ariaLabel: localize('ariaLabelGroupActions', "Empty editor group actions"),
			highlightToggledItems: true
		}));

		// Toolbar actions
		const containerToolbarMenu = this._register(this.menuService.createMenu(MenuId.EmptyEditorGroup, this.scopedContextKeyService));
		const updateContainerToolbar = () => {

			// Clear old actions
			this.containerToolBarMenuDisposable.value = toDisposable(() => containerToolbar.clear());

			// Create new actions
			const actions = getActionBarActions(
				containerToolbarMenu.getActions({ arg: { groupId: this.id }, shouldForwardArgs: true }),
				'navigation'
			);

			for (const action of [...actions.primary, ...actions.secondary]) {
				const keybinding = this.keybindingService.lookupKeybinding(action.id);
				containerToolbar.push(action, { icon: true, label: false, keybinding: keybinding?.getLabel() });
			}
		};
		updateContainerToolbar();
		this._register(containerToolbarMenu.onDidChange(updateContainerToolbar));
	}

	private createContainerContextMenu(): void {
		this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, e => this.onShowContainerContextMenu(e)));
		this._register(addDisposableListener(this.element, TouchEventType.Contextmenu, () => this.onShowContainerContextMenu()));
	}

	private onShowContainerContextMenu(e?: MouseEvent): void {
		if (!this.isEmpty) {
			return; // only for empty editor groups
		}

		// Find target anchor
		let anchor: HTMLElement | StandardMouseEvent = this.element;
		if (e) {
			anchor = new StandardMouseEvent(getWindow(this.element), e);
		}

		// Show it
		this.contextMenuService.showContextMenu({
			menuId: MenuId.EmptyEditorGroupContext,
			contextKeyService: this.contextKeyService,
			getAnchor: () => anchor,
			onHide: () => this.focus()
		});
	}

	private doTrackFocus(): void {

		// Container
		const containerFocusTracker = this._register(trackFocus(this.element));
		this._register(containerFocusTracker.onDidFocus(() => {
			if (this.isEmpty) {
				this._onDidFocus.fire(); // only when empty to prevent duplicate events from `editorPane.onDidFocus`
			}
		}));

		// Title Container
		const handleTitleClickOrTouch = (e: MouseEvent | GestureEvent): void => {
			let target: HTMLElement;
			if (isMouseEvent(e)) {
				if (e.button !== 0 /* middle/right mouse button */ || (isMacintosh && e.ctrlKey /* macOS context menu */)) {
					return undefined;
				}

				target = e.target as HTMLElement;
			} else {
				target = (e as GestureEvent).initialTarget as HTMLElement;
			}

			if (findParentWithClass(target, 'monaco-action-bar', this.titleContainer) ||
				findParentWithClass(target, 'monaco-breadcrumb-item', this.titleContainer)
			) {
				return; // not when clicking on actions or breadcrumbs
			}

			// timeout to keep focus in editor after mouse up
			setTimeout(() => {
				this.focus();
			});
		};

		this._register(addDisposableListener(this.titleContainer, EventType.MOUSE_DOWN, e => handleTitleClickOrTouch(e)));
		this._register(addDisposableListener(this.titleContainer, TouchEventType.Tap, e => handleTitleClickOrTouch(e)));

		// Editor pane
		this._register(this.editorPane.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
	}

	private updateContainer(): void {

		// Empty Container: add some empty container attributes
		if (this.isEmpty) {
			this.element.classList.add('empty');
			this.element.tabIndex = 0;
			this.element.setAttribute('aria-label', localize('emptyEditorGroup', "{0} (empty)", this.ariaLabel));
		}

		// Non-Empty Container: revert empty container attributes
		else {
			this.element.classList.remove('empty');
			this.element.removeAttribute('tabIndex');
			this.element.removeAttribute('aria-label');
		}

		// Update styles
		this.updateStyles();
	}

	private updateTitleContainer(): void {
		this.titleContainer.classList.toggle('tabs', this.groupsView.partOptions.showTabs === 'multiple');
		this.titleContainer.classList.toggle('show-file-icons', this.groupsView.partOptions.showIcons);
	}

	private restoreEditors(from: IEditorGroupView | ISerializedEditorGroupModel | null, groupViewOptions?: IEditorGroupViewOptions): Promise<void> | undefined {
		if (this.count === 0) {
			return; // nothing to show
		}

		// Determine editor options
		let options: IEditorOptions;
		if (from instanceof EditorGroupView) {
			options = fillActiveEditorViewState(from); // if we copy from another group, ensure to copy its active editor viewstate
		} else {
			options = Object.create(null);
		}

		const activeEditor = this.model.activeEditor;
		if (!activeEditor) {
			return;
		}

		options.pinned = this.model.isPinned(activeEditor);	// preserve pinned state
		options.sticky = this.model.isSticky(activeEditor);	// preserve sticky state
		options.preserveFocus = true;						// handle focus after editor is restored

		const internalOptions: IInternalEditorOpenOptions = {
			preserveWindowOrder: true,						// handle window order after editor is restored
			skipTitleUpdate: true,							// update the title later for all editors at once
		};

		const activeElement = getActiveElement();

		// Show active editor (intentionally not using async to keep
		// `restoreEditors` from executing in same stack)
		const result = this.doShowEditor(activeEditor, { active: true, isNew: false /* restored */ }, options, internalOptions).then(() => {

			// Set focused now if this is the active group and focus has
			// not changed meanwhile. This prevents focus from being
			// stolen accidentally on startup when the user already
			// clicked somewhere.

			if (this.groupsView.activeGroup === this && activeElement && isActiveElement(activeElement) && !groupViewOptions?.preserveFocus) {
				this.focus();
			}
		});

		// Restore editors in title control
		this.titleControl.openEditors(this.editors);

		return result;
	}

	//#region event handling

	private registerListeners(): void {

		// Model Events
		this._register(this.model.onDidModelChange(e => this.onDidGroupModelChange(e)));

		// Option Changes
		this._register(this.groupsView.onDidChangeEditorPartOptions(e => this.onDidChangeEditorPartOptions(e)));

		// Visibility
		this._register(this.groupsView.onDidVisibilityChange(e => this.onDidVisibilityChange(e)));

		// Focus
		this._register(this.onDidFocus(() => this.onDidGainFocus()));
	}

	private onDidGroupModelChange(e: IGroupModelChangeEvent): void {

		// Re-emit to outside
		this._onDidModelChange.fire(e);

		// Handle within

		switch (e.kind) {
			case GroupModelChangeKind.GROUP_LOCKED:
				this.element.classList.toggle('locked', this.isLocked);
				break;
			case GroupModelChangeKind.EDITORS_SELECTION:
				this.onDidChangeEditorSelection();
				break;
		}

		if (!e.editor) {
			return;
		}

		switch (e.kind) {
			case GroupModelChangeKind.EDITOR_OPEN:
				if (isGroupEditorOpenEvent(e)) {
					this.onDidOpenEditor(e.editor, e.editorIndex);
				}
				break;
			case GroupModelChangeKind.EDITOR_CLOSE:
				if (isGroupEditorCloseEvent(e)) {
					this.handleOnDidCloseEditor(e.editor, e.editorIndex, e.context, e.sticky);
				}
				break;
			case GroupModelChangeKind.EDITOR_WILL_DISPOSE:
				this.onWillDisposeEditor(e.editor);
				break;
			case GroupModelChangeKind.EDITOR_DIRTY:
				this.onDidChangeEditorDirty(e.editor);
				break;
			case GroupModelChangeKind.EDITOR_TRANSIENT:
				this.onDidChangeEditorTransient(e.editor);
				break;
			case GroupModelChangeKind.EDITOR_LABEL:
				this.onDidChangeEditorLabel(e.editor);
				break;
		}
	}

	private onDidOpenEditor(editor: EditorInput, editorIndex: number): void {

		/* __GDPR__
			"editorOpened" : {
				"owner": "isidorn",
				"${include}": [
					"${EditorTelemetryDescriptor}"
				]
			}
		*/
		this.telemetryService.publicLog('editorOpened', this.toEditorTelemetryDescriptor(editor));

		// Update container
		this.updateContainer();
	}

	private handleOnDidCloseEditor(editor: EditorInput, editorIndex: number, context: EditorCloseContext, sticky: boolean): void {

		// Before close
		this._onWillCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });

		// Handle event
		const editorsToClose: EditorInput[] = [editor];

		// Include both sides of side by side editors when being closed
		if (editor instanceof SideBySideEditorInput) {
			editorsToClose.push(editor.primary, editor.secondary);
		}

		// For each editor to close, we call dispose() to free up any resources.
		// However, certain editors might be shared across multiple editor groups
		// (including being visible in side by side / diff editors) and as such we
		// only dispose when they are not opened elsewhere.
		for (const editor of editorsToClose) {
			if (this.canDispose(editor)) {
				editor.dispose();
			}
		}

		// Update container
		this.updateContainer();

		// Event
		this._onDidCloseEditor.fire({ groupId: this.id, editor, context, index: editorIndex, sticky });
	}

	private canDispose(editor: EditorInput): boolean {
		for (const groupView of this.editorPartsView.groups) {
			if (groupView instanceof EditorGroupView && groupView.model.contains(editor, {
				strictEquals: true,						// only if this input is not shared across editor groups
				supportSideBySide: SideBySideEditor.ANY // include any side of an opened side by side editor
			})) {
				return false;
			}
		}

		return true;
	}

	private toResourceTelemetryDescriptor(resource: URI): object | undefined {
		if (!resource) {
			return undefined;
		}

		const path = resource ? resource.scheme === Schemas.file ? resource.fsPath : resource.path : undefined;
		if (!path) {
			return undefined;
		}

		// Remove query parameters from the resource extension
		let resourceExt = extname(resource);
		const queryStringLocation = resourceExt.indexOf('?');
		resourceExt = queryStringLocation !== -1 ? resourceExt.substr(0, queryStringLocation) : resourceExt;

		return {
			mimeType: new TelemetryTrustedValue(getMimeTypes(resource).join(', ')),
			scheme: resource.scheme,
			ext: resourceExt,
			path: hash(path)
		};
	}

	private toEditorTelemetryDescriptor(editor: EditorInput): object {
		const descriptor = editor.getTelemetryDescriptor();

		const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH });
		if (URI.isUri(resource)) {
			descriptor['resource'] = this.toResourceTelemetryDescriptor(resource);

			/* __GDPR__FRAGMENT__
				"EditorTelemetryDescriptor" : {
					"resource": { "${inline}": [ "${URIDescriptor}" ] }
				}
			*/
			return descriptor;
		} else if (resource) {
			if (resource.primary) {
				descriptor['resource'] = this.toResourceTelemetryDescriptor(resource.primary);
			}
			if (resource.secondary) {
				descriptor['resourceSecondary'] = this.toResourceTelemetryDescriptor(resource.secondary);
			}
			/* __GDPR__FRAGMENT__
				"EditorTelemetryDescriptor" : {
					"resource": { "${inline}": [ "${URIDescriptor}" ] },
					"resourceSecondary": { "${inline}": [ "${URIDescriptor}" ] }
				}
			*/
			return descriptor;
		}

		return descriptor;
	}

	private onWillDisposeEditor(editor: EditorInput): void {

		// To prevent race conditions, we handle disposed editors in our worker with a timeout
		// because it can happen that an input is being disposed with the intent to replace
		// it with some other input right after.
		this.disposedEditorsWorker.work(editor);
	}

	private handleDisposedEditors(disposedEditors: EditorInput[]): void {

		// Split between visible and hidden editors
		let activeEditor: EditorInput | undefined;
		const inactiveEditors: EditorInput[] = [];
		for (const disposedEditor of disposedEditors) {
			const editorFindResult = this.model.findEditor(disposedEditor);
			if (!editorFindResult) {
				continue; // not part of the model anymore
			}

			const editor = editorFindResult[0];
			if (!editor.isDisposed()) {
				continue; // editor got reopened meanwhile
			}

			if (this.model.isActive(editor)) {
				activeEditor = editor;
			} else {
				inactiveEditors.push(editor);
			}
		}

		// Close all inactive editors first to prevent UI flicker
		for (const inactiveEditor of inactiveEditors) {
			this.doCloseEditor(inactiveEditor, true);
		}

		// Close active one last
		if (activeEditor) {
			this.doCloseEditor(activeEditor, true);
		}
	}

	private onDidChangeEditorPartOptions(event: IEditorPartOptionsChangeEvent): void {

		// Title container
		this.updateTitleContainer();

		// Title control
		this.titleControl.updateOptions(event.oldPartOptions, event.newPartOptions);

		// Title control switch between singleEditorTabs, multiEditorTabs and multiRowEditorTabs
		if (
			event.oldPartOptions.showTabs !== event.newPartOptions.showTabs ||
			event.oldPartOptions.tabHeight !== event.newPartOptions.tabHeight ||
			(event.oldPartOptions.showTabs === 'multiple' && event.oldPartOptions.pinnedTabsOnSeparateRow !== event.newPartOptions.pinnedTabsOnSeparateRow)
		) {

			// Re-layout
			this.relayout();

			// Ensure to show active editor if any
			if (this.model.activeEditor) {
				this.titleControl.openEditors(this.model.getEditors(EditorsOrder.SEQUENTIAL));
			}
		}

		// Styles
		this.updateStyles();

		// Pin preview editor once user disables preview
		if (event.oldPartOptions.enablePreview && !event.newPartOptions.enablePreview) {
			if (this.model.previewEditor) {
				this.pinEditor(this.model.previewEditor);
			}
		}
	}

	private onDidChangeEditorDirty(editor: EditorInput): void {

		// Always show dirty editors pinned
		this.pinEditor(editor);

		// Forward to title control
		this.titleControl.updateEditorDirty(editor);
	}

	private onDidChangeEditorTransient(editor: EditorInput): void {
		const transient = this.model.isTransient(editor);

		// Transient state overrides the `enablePreview` setting,
		// so when an editor leaves the transient state, we have
		// to ensure its preview state is also cleared.
		if (!transient && !this.groupsView.partOptions.enablePreview) {
			this.pinEditor(editor);
		}
	}

	private onDidChangeEditorLabel(editor: EditorInput): void {

		// Forward to title control
		this.titleControl.updateEditorLabel(editor);
	}

	private onDidChangeEditorSelection(): void {

		// Forward to title control
		this.titleControl.updateEditorSelections();
	}

	private onDidVisibilityChange(visible: boolean): void {

		// Forward to active editor pane
		this.editorPane.setVisible(visible);
	}

	private onDidGainFocus(): void {
		if (this.activeEditor) {

			// We aggressively clear the transient state of editors
			// as soon as the group gains focus. This is to ensure
			// that the transient state is not staying around when
			// the user interacts with the editor.

			this.model.setTransient(this.activeEditor, false);
		}
	}

	//#endregion

	//#region IEditorGroupView

	get index(): number {
		return this._index;
	}

	get label(): string {
		if (this.groupsLabel) {
			return localize('groupLabelLong', "{0}: Group {1}", this.groupsLabel, this._index + 1);
		}

		return localize('groupLabel', "Group {0}", this._index + 1);
	}

	get ariaLabel(): string {
		if (this.groupsLabel) {
			return localize('groupAriaLabelLong', "{0}: Editor Group {1}", this.groupsLabel, this._index + 1);
		}

		return localize('groupAriaLabel', "Editor Group {0}", this._index + 1);
	}

	private _disposed = false;
	get disposed(): boolean {
		return this._disposed;
	}

	get isEmpty(): boolean {
		return this.count === 0;
	}

	get titleHeight(): IEditorGroupTitleHeight {
		return this.titleControl.getHeight();
	}

	notifyIndexChanged(newIndex: number): void {
		if (this._index !== newIndex) {
			this._index = newIndex;
			this.model.setIndex(newIndex);
		}
	}

	notifyLabelChanged(newLabel: string): void {
		if (this.groupsLabel !== newLabel) {
			this.groupsLabel = newLabel;
			this.model.setLabel(newLabel);
		}
	}

	setActive(isActive: boolean): void {
		this.active = isActive;

		// Clear selection when group no longer active
		if (!isActive && this.activeEditor && this.selectedEditors.length > 1) {
			this.setSelection(this.activeEditor, []);
		}

		// Update container
		this.element.classList.toggle('active', isActive);
		this.element.classList.toggle('inactive', !isActive);

		// Update title control
		this.titleControl.setActive(isActive);

		// Update styles
		this.updateStyles();

		// Update model
		this.model.setActive(undefined /* entire group got active */);
	}

	//#endregion

	//#region basics()

	get id(): GroupIdentifier {
		return this.model.id;
	}

	get windowId(): number {
		return this.groupsView.windowId;
	}

	get editors(): EditorInput[] {
		return this.model.getEditors(EditorsOrder.SEQUENTIAL);
	}

	get count(): number {
		return this.model.count;
	}

	get stickyCount(): number {
		return this.model.stickyCount;
	}

	get activeEditorPane(): IVisibleEditorPane | undefined {
		return this.editorPane ? this.editorPane.activeEditorPane ?? undefined : undefined;
	}

	get activeEditor(): EditorInput | null {
		return this.model.activeEditor;
	}

	get selectedEditors(): EditorInput[] {
		return this.model.selectedEditors;
	}

	get previewEditor(): EditorInput | null {
		return this.model.previewEditor;
	}

	isPinned(editorOrIndex: EditorInput | number): boolean {
		return this.model.isPinned(editorOrIndex);
	}

	isSticky(editorOrIndex: EditorInput | number): boolean {
		return this.model.isSticky(editorOrIndex);
	}

	isSelected(editor: EditorInput): boolean {
		return this.model.isSelected(editor);
	}

	isTransient(editorOrIndex: EditorInput | number): boolean {
		return this.model.isTransient(editorOrIndex);
	}

	isActive(editor: EditorInput | IUntypedEditorInput): boolean {
		return this.model.isActive(editor);
	}

	async setSelection(activeSelectedEditor: EditorInput, inactiveSelectedEditors: EditorInput[]): Promise<void> {
		if (!this.isActive(activeSelectedEditor)) {
			// The active selected editor is not yet opened, so we go
			// through `openEditor` to show it. We pass the inactive
			// selection as internal options
			await this.openEditor(activeSelectedEditor, { activation: EditorActivation.ACTIVATE }, { inactiveSelection: inactiveSelectedEditors });
		} else {
			this.model.setSelection(activeSelectedEditor, inactiveSelectedEditors);
		}
	}

	contains(candidate: EditorInput | IUntypedEditorInput, options?: IMatchEditorOptions): boolean {
		return this.model.contains(candidate, options);
	}

	getEditors(order: EditorsOrder, options?: { excludeSticky?: boolean }): EditorInput[] {
		return this.model.getEditors(order, options);
	}

	findEditors(resource: URI, options?: IFindEditorOptions): EditorInput[] {
		const canonicalResource = this.uriIdentityService.asCanonicalUri(resource);
		return this.getEditors(options?.order ?? EditorsOrder.SEQUENTIAL).filter(editor => {
			if (editor.resource && isEqual(editor.resource, canonicalResource)) {
				return true;
			}

			// Support side by side editor primary side if specified
			if (options?.supportSideBySide === SideBySideEditor.PRIMARY || options?.supportSideBySide === SideBySideEditor.ANY) {
				const primaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
				if (primaryResource && isEqual(primaryResource, canonicalResource)) {
					return true;
				}
			}

			// Support side by side editor secondary side if specified
			if (options?.supportSideBySide === SideBySideEditor.SECONDARY || options?.supportSideBySide === SideBySideEditor.ANY) {
				const secondaryResource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY });
				if (secondaryResource && isEqual(secondaryResource, canonicalResource)) {
					return true;
				}
			}

			return false;
		});
	}

	getEditorByIndex(index: number): EditorInput | undefined {
		return this.model.getEditorByIndex(index);
	}

	getIndexOfEditor(editor: EditorInput): number {
		return this.model.indexOf(editor);
	}

	isFirst(editor: EditorInput): boolean {
		return this.model.isFirst(editor);
	}

	isLast(editor: EditorInput): boolean {
		return this.model.isLast(editor);
	}

	focus(): void {

		// Pass focus to editor panes
		if (this.activeEditorPane) {
			this.activeEditorPane.focus();
		} else {
			this.element.focus();
		}

		// Event
		this._onDidFocus.fire();
	}

	pinEditor(candidate: EditorInput | undefined = this.activeEditor || undefined): void {
		if (candidate && !this.model.isPinned(candidate)) {

			// Update model
			const editor = this.model.pin(candidate);

			// Forward to title control
			if (editor) {
				this.titleControl.pinEditor(editor);
			}
		}
	}

	stickEditor(candidate: EditorInput | undefined = this.activeEditor || undefined): void {
		this.doStickEditor(candidate, true);
	}

	unstickEditor(candidate: EditorInput | undefined = this.activeEditor || undefined): void {
		this.doStickEditor(candidate, false);
	}

	private doStickEditor(candidate: EditorInput | undefined, sticky: boolean): void {
		if (candidate && this.model.isSticky(candidate) !== sticky) {
			const oldIndexOfEditor = this.getIndexOfEditor(candidate);

			// Update model
			const editor = sticky ? this.model.stick(candidate) : this.model.unstick(candidate);
			if (!editor) {
				return;
			}

			// If the index of the editor changed, we need to forward this to
			// title control and also make sure to emit this as an event
			const newIndexOfEditor = this.getIndexOfEditor(editor);
			if (newIndexOfEditor !== oldIndexOfEditor) {
				this.titleControl.moveEditor(editor, oldIndexOfEditor, newIndexOfEditor, true);
			}

			// Forward sticky state to title control
			if (sticky) {
				this.titleControl.stickEditor(editor);
			} else {
				this.titleControl.unstickEditor(editor);
			}
		}
	}

	//#endregion

	//#region openEditor()

	async openEditor(editor: EditorInput, options?: IEditorOptions, internalOptions?: IInternalEditorOpenOptions): Promise<IEditorPane | undefined> {
		return this.doOpenEditor(editor, options, {
			// Appply given internal open options
			...internalOptions,
			// Allow to match on a side-by-side editor when same
			// editor is opened on both sides. In that case we
			// do not want to open a new editor but reuse that one.
			supportSideBySide: SideBySideEditor.BOTH
		});
	}

	private async doOpenEditor(editor: EditorInput, options?: IEditorOptions, internalOptions?: IInternalEditorOpenOptions): Promise<IEditorPane | undefined> {

		// Guard against invalid editors. Disposed editors
		// should never open because they emit no events
		// e.g. to indicate dirty changes.
		if (!editor || editor.isDisposed()) {
			return;
		}

		// Fire the event letting everyone know we are about to open an editor
		this._onWillOpenEditor.fire({ editor, groupId: this.id });

		// Determine options
		const pinned = options?.sticky
			|| (!this.groupsView.partOptions.enablePreview && !options?.transient)
			|| editor.isDirty()
			|| (options?.pinned ?? typeof options?.index === 'number' /* unless specified, prefer to pin when opening with index */)
			|| (typeof options?.index === 'number' && this.model.isSticky(options.index))
			|| editor.hasCapability(EditorInputCapabilities.Scratchpad);
		const openEditorOptions: IEditorOpenOptions = {
			index: options ? options.index : undefined,
			pinned,
			sticky: options?.sticky || (typeof options?.index === 'number' && this.model.isSticky(options.index)),
			transient: !!options?.transient,
			inactiveSelection: internalOptions?.inactiveSelection,
			active: this.count === 0 || !options?.inactive,
			supportSideBySide: internalOptions?.supportSideBySide
		};

		if (!openEditorOptions.active && !openEditorOptions.pinned && this.model.activeEditor && !this.model.isPinned(this.model.activeEditor)) {
			// Special case: we are to open an editor inactive and not pinned, but the current active
			// editor is also not pinned, which means it will get replaced with this one. As such,
			// the editor can only be active.
			openEditorOptions.active = true;
		}

		let activateGroup = false;
		let restoreGroup = false;

		if (options?.activation === EditorActivation.ACTIVATE) {
			// Respect option to force activate an editor group.
			activateGroup = true;
		} else if (options?.activation === EditorActivation.RESTORE) {
			// Respect option to force restore an editor group.
			restoreGroup = true;
		} else if (options?.activation === EditorActivation.PRESERVE) {
			// Respect option to preserve active editor group.
			activateGroup = false;
			restoreGroup = false;
		} else if (openEditorOptions.active) {
			// Finally, we only activate/restore an editor which is
			// opening as active editor.
			// If preserveFocus is enabled, we only restore but never
			// activate the group.
			activateGroup = !options?.preserveFocus;
			restoreGroup = !activateGroup;
		}

		// Actually move the editor if a specific index is provided and we figure
		// out that the editor is already opened at a different index. This
		// ensures the right set of events are fired to the outside.
		if (typeof openEditorOptions.index === 'number') {
			const indexOfEditor = this.model.indexOf(editor);
			if (indexOfEditor !== -1 && indexOfEditor !== openEditorOptions.index) {
				this.doMoveEditorInsideGroup(editor, openEditorOptions);
			}
		}

		// Update model and make sure to continue to use the editor we get from
		// the model. It is possible that the editor was already opened and we
		// want to ensure that we use the existing instance in that case.
		const { editor: openedEditor, isNew } = this.model.openEditor(editor, openEditorOptions);

		// Conditionally lock the group
		if (
			isNew &&								// only if this editor was new for the group
			this.count === 1 &&						// only when this editor was the first editor in the group
			this.editorPartsView.groups.length > 1 	// only allow auto locking if more than 1 group is opened
		) {
			// only when the editor identifier is configured as such
			if (openedEditor.editorId && this.groupsView.partOptions.autoLockGroups?.has(openedEditor.editorId)) {
				this.lock(true);
			}
		}

		// Show editor
		const showEditorResult = this.doShowEditor(openedEditor, { active: !!openEditorOptions.active, isNew }, options, internalOptions);

		// Finally make sure the group is active or restored as instructed
		if (activateGroup) {
			this.groupsView.activateGroup(this);
		} else if (restoreGroup) {
			this.groupsView.restoreGroup(this);
		}

		return showEditorResult;
	}

	private doShowEditor(editor: EditorInput, context: { active: boolean; isNew: boolean }, options?: IEditorOptions, internalOptions?: IInternalEditorOpenOptions): Promise<IEditorPane | undefined> {

		// Show in editor control if the active editor changed
		let openEditorPromise: Promise<IEditorPane | undefined>;
		if (context.active) {
			openEditorPromise = (async () => {
				const { pane, changed, cancelled, error } = await this.editorPane.openEditor(editor, options, internalOptions, { newInGroup: context.isNew });

				// Return early if the operation was cancelled by another operation
				if (cancelled) {
					return undefined;
				}

				// Editor change event
				if (changed) {
					this._onDidActiveEditorChange.fire({ editor });
				}

				// Indicate error as an event but do not bubble them up
				if (error) {
					this._onDidOpenEditorFail.fire(editor);
				}

				// Without an editor pane, recover by closing the active editor
				// (if the input is still the active one)
				if (!pane && this.activeEditor === editor) {
					this.doCloseEditor(editor, options?.preserveFocus, { fromError: true });
				}

				return pane;
			})();
		} else {
			openEditorPromise = Promise.resolve(undefined); // inactive: return undefined as result to signal this
		}

		// Show in title control after editor control because some actions depend on it
		// but respect the internal options in case title control updates should skip.
		if (!internalOptions?.skipTitleUpdate) {
			this.titleControl.openEditor(editor, internalOptions);
		}

		return openEditorPromise;
	}

	//#endregion

	//#region openEditors()

	async openEditors(editors: { editor: EditorInput; options?: IEditorOptions }[]): Promise<IEditorPane | undefined> {

		// Guard against invalid editors. Disposed editors
		// should never open because they emit no events
		// e.g. to indicate dirty changes.
		const editorsToOpen = coalesce(editors).filter(({ editor }) => !editor.isDisposed());

		// Use the first editor as active editor
		const firstEditor = editorsToOpen.at(0);
		if (!firstEditor) {
			return;
		}

		const openEditorsOptions: IInternalEditorOpenOptions = {
			// Allow to match on a side-by-side editor when same
			// editor is opened on both sides. In that case we
			// do not want to open a new editor but reuse that one.
			supportSideBySide: SideBySideEditor.BOTH
		};

		await this.doOpenEditor(firstEditor.editor, firstEditor.options, openEditorsOptions);

		// Open the other ones inactive
		const inactiveEditors = editorsToOpen.slice(1);
		const startingIndex = this.getIndexOfEditor(firstEditor.editor) + 1;
		await Promises.settled(inactiveEditors.map(({ editor, options }, index) => {
			return this.doOpenEditor(editor, {
				...options,
				inactive: true,
				pinned: true,
				index: startingIndex + index
			}, {
				...openEditorsOptions,
				// optimization: update the title control later
				// https://github.com/microsoft/vscode/issues/130634
				skipTitleUpdate: true
			});
		}));

		// Update the title control all at once with all editors
		this.titleControl.openEditors(inactiveEditors.map(({ editor }) => editor));

		// Opening many editors at once can put any editor to be
		// the active one depending on options. As such, we simply
		// return the active editor pane after this operation.
		return this.editorPane.activeEditorPane ?? undefined;
	}

	//#endregion

	//#region moveEditor()

	moveEditors(editors: { editor: EditorInput; options?: IEditorOptions }[], target: EditorGroupView): boolean {

		// Optimization: knowing that we move many editors, we
		// delay the title update to a later point for this group
		// through a method that allows for bulk updates but only
		// when moving to a different group where many editors
		// are more likely to occur.
		const internalOptions: IInternalMoveCopyOptions = {
			skipTitleUpdate: this !== target
		};

		let moveFailed = false;

		const movedEditors = new Set<EditorInput>();
		for (const { editor, options } of editors) {
			if (this.moveEditor(editor, target, options, internalOptions)) {
				movedEditors.add(editor);
			} else {
				moveFailed = true;
			}
		}

		// Update the title control all at once with all editors
		// in source and target if the title update was skipped
		if (internalOptions.skipTitleUpdate) {
			target.titleControl.openEditors(Array.from(movedEditors));
			this.titleControl.closeEditors(Array.from(movedEditors));
		}

		return !moveFailed;
	}

	moveEditor(editor: EditorInput, target: EditorGroupView, options?: IEditorOptions, internalOptions?: IInternalMoveCopyOptions): boolean {

		// Move within same group
		if (this === target) {
			this.doMoveEditorInsideGroup(editor, options);
			return true;
		}

		// Move across groups
		else {
			return this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: false });
		}
	}

	private doMoveEditorInsideGroup(candidate: EditorInput, options?: IEditorOpenOptions): void {
		const moveToIndex = options ? options.index : undefined;
		if (typeof moveToIndex !== 'number') {
			return; // do nothing if we move into same group without index
		}

		// Update model and make sure to continue to use the editor we get from
		// the model. It is possible that the editor was already opened and we
		// want to ensure that we use the existing instance in that case.
		const currentIndex = this.model.indexOf(candidate);
		const editor = this.model.getEditorByIndex(currentIndex);
		if (!editor) {
			return;
		}

		// Move when index has actually changed
		if (currentIndex !== moveToIndex) {
			const oldStickyCount = this.model.stickyCount;

			// Update model
			this.model.moveEditor(editor, moveToIndex);
			this.model.pin(editor);

			// Forward to title control
			this.titleControl.moveEditor(editor, currentIndex, moveToIndex, oldStickyCount !== this.model.stickyCount);
			this.titleControl.pinEditor(editor);
		}

		// Support the option to stick the editor even if it is moved.
		// It is important that we call this method after we have moved
		// the editor because the result of moving the editor could have
		// caused a change in sticky state.
		if (options?.sticky) {
			this.stickEditor(editor);
		}
	}

	private doMoveOrCopyEditorAcrossGroups(editor: EditorInput, target: EditorGroupView, openOptions?: IEditorOpenOptions, internalOptions?: IInternalMoveCopyOptions): boolean {
		const keepCopy = internalOptions?.keepCopy;

		// Validate that we can move
		if (!keepCopy || editor.hasCapability(EditorInputCapabilities.Singleton) /* singleton editors will always move */) {
			const canMoveVeto = editor.canMove(this.id, target.id);
			if (typeof canMoveVeto === 'string') {
				this.dialogService.error(canMoveVeto, localize('moveErrorDetails', "Try saving or reverting the editor first and then try again."));

				return false;
			}
		}

		// When moving/copying an editor, try to preserve as much view state as possible
		// by checking for the editor to be a text editor and creating the options accordingly
		// if so
		const options = fillActiveEditorViewState(this, editor, {
			...openOptions,
			pinned: true, 																// always pin moved editor
			sticky: openOptions?.sticky ?? (!keepCopy && this.model.isSticky(editor))	// preserve sticky state only if editor is moved or explicitly wanted (https://github.com/microsoft/vscode/issues/99035)
		});

		// Indicate will move event
		if (!keepCopy) {
			this._onWillMoveEditor.fire({
				groupId: this.id,
				editor,
				target: target.id
			});
		}

		// A move to another group is an open first...
		target.doOpenEditor(keepCopy ? editor.copy() : editor, options, internalOptions);

		// ...and a close afterwards (unless we copy)
		if (!keepCopy) {
			this.doCloseEditor(editor, true /* do not focus next one behind if any */, { ...internalOptions, context: EditorCloseContext.MOVE });
		}

		return true;
	}

	//#endregion

	//#region copyEditor()

	copyEditors(editors: { editor: EditorInput; options?: IEditorOptions }[], target: EditorGroupView): void {

		// Optimization: knowing that we move many editors, we
		// delay the title update to a later point for this group
		// through a method that allows for bulk updates but only
		// when moving to a different group where many editors
		// are more likely to occur.
		const internalOptions: IInternalMoveCopyOptions = {
			skipTitleUpdate: this !== target
		};

		for (const { editor, options } of editors) {
			this.copyEditor(editor, target, options, internalOptions);
		}

		// Update the title control all at once with all editors
		// in target if the title update was skipped
		if (internalOptions.skipTitleUpdate) {
			const copiedEditors = editors.map(({ editor }) => editor);
			target.titleControl.openEditors(copiedEditors);
		}
	}

	copyEditor(editor: EditorInput, target: EditorGroupView, options?: IEditorOptions, internalOptions?: IInternalEditorTitleControlOptions): void {

		// Move within same group because we do not support to show the same editor
		// multiple times in the same group
		if (this === target) {
			this.doMoveEditorInsideGroup(editor, options);
		}

		// Copy across groups
		else {
			this.doMoveOrCopyEditorAcrossGroups(editor, target, options, { ...internalOptions, keepCopy: true });
		}
	}

	//#endregion

	//#region closeEditor()

	async closeEditor(editor: EditorInput | undefined = this.activeEditor || undefined, options?: ICloseEditorOptions): Promise<boolean> {
		return this.doCloseEditorWithConfirmationHandling(editor, options);
	}

	private async doCloseEditorWithConfirmationHandling(editor: EditorInput | undefined = this.activeEditor || undefined, options?: ICloseEditorOptions, internalOptions?: IInternalEditorCloseOptions): Promise<boolean> {
		if (!editor) {
			return false;
		}

		// Check for confirmation and veto
		const veto = await this.handleCloseConfirmation([editor]);
		if (veto) {
			return false;
		}

		// Do close
		this.doCloseEditor(editor, options?.preserveFocus, internalOptions);

		return true;
	}

	private doCloseEditor(editor: EditorInput, preserveFocus = (this.groupsView.activeGroup !== this), internalOptions?: IInternalEditorCloseOptions): void {

		// Forward to title control unless skipped via internal options
		if (!internalOptions?.skipTitleUpdate) {
			this.titleControl.beforeCloseEditor(editor);
		}

		// Closing the active editor of the group is a bit more work
		if (this.model.isActive(editor)) {
			this.doCloseActiveEditor(preserveFocus, internalOptions);
		}

		// Closing inactive editor is just a model update
		else {
			this.doCloseInactiveEditor(editor, internalOptions);
		}

		// Forward to title control unless skipped via internal options
		if (!internalOptions?.skipTitleUpdate) {
			this.titleControl.closeEditor(editor);
		}
	}

	private doCloseActiveEditor(preserveFocus = (this.groupsView.activeGroup !== this), internalOptions?: IInternalEditorCloseOptions): void {
		const editorToClose = this.activeEditor;
		const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.element);

		// Optimization: if we are about to close the last editor in this group and settings
		// are configured to close the group since it will be empty, we first set the last
		// active group as empty before closing the editor. This reduces the amount of editor
		// change events that this operation emits and will reduce flicker. Without this
		// optimization, this group (if active) would first trigger a active editor change
		// event because it became empty, only to then trigger another one when the next
		// group gets active.
		const closeEmptyGroup = this.groupsView.partOptions.closeEmptyGroups;
		if (closeEmptyGroup && this.active && this.count === 1) {
			const mostRecentlyActiveGroups = this.groupsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
			const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current one, so take [1]
			if (nextActiveGroup) {
				if (restoreFocus) {
					nextActiveGroup.focus();
				} else {
					this.groupsView.activateGroup(nextActiveGroup, true);
				}
			}
		}

		// Update model
		if (editorToClose) {
			this.model.closeEditor(editorToClose, internalOptions?.context);
		}

		// Open next active if there are more to show
		const nextActiveEditor = this.model.activeEditor;
		if (nextActiveEditor) {
			let activation: EditorActivation | undefined = undefined;
			if (preserveFocus && this.groupsView.activeGroup !== this) {
				// If we are opening the next editor in an inactive group
				// without focussing it, ensure we preserve the editor
				// group sizes in case that group is minimized.
				// https://github.com/microsoft/vscode/issues/117686
				activation = EditorActivation.PRESERVE;
			}

			const options: IEditorOptions = {
				preserveFocus,
				activation,
				// When closing an editor due to an error we can end up in a loop where we continue closing
				// editors that fail to open (e.g. when the file no longer exists). We do not want to show
				// repeated errors in this case to the user. As such, if we open the next editor and we are
				// in a scope of a previous editor failing, we silence the input errors until the editor is
				// opened by setting ignoreError: true.
				ignoreError: internalOptions?.fromError
			};

			const internalEditorOpenOptions: IInternalEditorOpenOptions = {
				// When closing an editor, we reveal the next one in the group.
				// However, this can be a result of moving an editor to another
				// window so we explicitly disable window reordering in this case.
				preserveWindowOrder: true
			};

			this.doOpenEditor(nextActiveEditor, options, internalEditorOpenOptions);
		}

		// Otherwise we are empty, so clear from editor control and send event
		else {

			// Forward to editor pane
			if (editorToClose) {
				this.editorPane.closeEditor(editorToClose);
			}

			// Restore focus to group container as needed unless group gets closed
			if (restoreFocus && !closeEmptyGroup) {
				this.focus();
			}

			// Events
			this._onDidActiveEditorChange.fire({ editor: undefined });

			// Remove empty group if we should
			if (closeEmptyGroup) {
				this.groupsView.removeGroup(this, preserveFocus);
			}
		}
	}

	private shouldRestoreFocus(target: Element): boolean {
		const activeElement = getActiveElement();
		if (activeElement === target.ownerDocument.body) {
			return true; // always restore focus if nothing is focused currently
		}

		// otherwise check for the active element being an ancestor of the target
		return isAncestor(activeElement, target);
	}

	private doCloseInactiveEditor(editor: EditorInput, internalOptions?: IInternalEditorCloseOptions): void {

		// Update model
		this.model.closeEditor(editor, internalOptions?.context);
	}

	private async handleCloseConfirmation(editors: EditorInput[]): Promise<boolean /* veto */> {
		if (!editors.length) {
			return false; // no veto
		}

		const editor = editors.shift()!;

		// To prevent multiple confirmation dialogs from showing up one after the other
		// we check if a pending confirmation is currently showing and if so, join that
		let handleCloseConfirmationPromise = this.mapEditorToPendingConfirmation.get(editor);
		if (!handleCloseConfirmationPromise) {
			handleCloseConfirmationPromise = this.doHandleCloseConfirmation(editor);
			this.mapEditorToPendingConfirmation.set(editor, handleCloseConfirmationPromise);
		}

		let veto: boolean;
		try {
			veto = await handleCloseConfirmationPromise;
		} finally {
			this.mapEditorToPendingConfirmation.delete(editor);
		}

		// Return for the first veto we got
		if (veto) {
			return veto;
		}

		// Otherwise continue with the remainders
		return this.handleCloseConfirmation(editors);
	}

	private async doHandleCloseConfirmation(editor: EditorInput, options?: { skipAutoSave: boolean }): Promise<boolean /* veto */> {
		if (!this.shouldConfirmClose(editor)) {
			return false; // no veto
		}

		if (editor instanceof SideBySideEditorInput && this.model.contains(editor.primary)) {
			return false; // primary-side of editor is still opened somewhere else
		}

		// Note: we explicitly decide to ask for confirm if closing a normal editor even
		// if it is opened in a side-by-side editor in the group. This decision is made
		// because it may be less obvious that one side of a side by side editor is dirty
		// and can still be changed.
		// The only exception is when the same editor is opened on both sides of a side
		// by side editor (https://github.com/microsoft/vscode/issues/138442)

		if (this.editorPartsView.groups.some(groupView => {
			if (groupView === this) {
				return false; // skip (we already handled our group above)
			}

			const otherGroup = groupView;
			if (otherGroup.contains(editor, { supportSideBySide: SideBySideEditor.BOTH })) {
				return true; // exact editor still opened (either single, or split-in-group)
			}

			if (editor instanceof SideBySideEditorInput && otherGroup.contains(editor.primary)) {
				return true; // primary side of side by side editor still opened
			}

			return false;
		})) {
			return false; // editor is still editable somewhere else
		}

		// In some cases trigger save before opening the dialog depending
		// on auto-save configuration.
		// However, make sure to respect `skipAutoSave` option in case the automated
		// save fails which would result in the editor never closing.
		// Also, we only do this if no custom confirmation handling is implemented.
		let confirmation = ConfirmResult.CANCEL;
		let saveReason = SaveReason.EXPLICIT;
		let autoSave = false;
		if (!editor.hasCapability(EditorInputCapabilities.Untitled) && !options?.skipAutoSave && !editor.closeHandler) {

			// Auto-save on focus change: save, because a dialog would steal focus
			// (see https://github.com/microsoft/vscode/issues/108752)
			if (this.filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_FOCUS_CHANGE) {
				autoSave = true;
				confirmation = ConfirmResult.SAVE;
				saveReason = SaveReason.FOCUS_CHANGE;
			}

			// Auto-save on window change: save, because on Windows and Linux, a
			// native dialog triggers the window focus change
			// (see https://github.com/microsoft/vscode/issues/134250)
			else if ((isNative && (isWindows || isLinux)) && this.filesConfigurationService.getAutoSaveMode(editor).mode === AutoSaveMode.ON_WINDOW_CHANGE) {
				autoSave = true;
				confirmation = ConfirmResult.SAVE;
				saveReason = SaveReason.WINDOW_CHANGE;
			}
		}

		// No auto-save on focus change or custom confirmation handler: ask user
		if (!autoSave) {

			// Switch to editor that we want to handle for confirmation unless showing already
			if (!this.activeEditor?.matches(editor)) {
				await this.doOpenEditor(editor);
			}

			// Ensure our window has focus since we are about to show a dialog
			await this.hostService.focus(getWindow(this.element));

			// Let editor handle confirmation if implemented
			let handlerDidError = false;
			if (typeof editor.closeHandler?.confirm === 'function') {
				try {
					confirmation = await editor.closeHandler.confirm([{ editor, groupId: this.id }]);
				} catch (e) {
					this.logService.error(e);
					handlerDidError = true;
				}
			}

			// Show a file specific confirmation if there is no handler or it errored
			if (typeof editor.closeHandler?.confirm !== 'function' || handlerDidError) {
				let name: string;
				if (editor instanceof SideBySideEditorInput) {
					name = editor.primary.getName(); // prefer shorter names by using primary's name in this case
				} else {
					name = editor.getName();
				}

				confirmation = await this.fileDialogService.showSaveConfirm([name]);
			}
		}

		// It could be that the editor's choice of confirmation has changed
		// given the check for confirmation is long running, so we check
		// again to see if anything needs to happen before closing for good.
		// This can happen for example if `autoSave: onFocusChange` is configured
		// so that the save happens when the dialog opens.
		// However, we only do this unless a custom confirm handler is installed
		// that may not be fit to be asked a second time right after.
		if (!editor.closeHandler && !this.shouldConfirmClose(editor)) {
			return confirmation === ConfirmResult.CANCEL;
		}

		// Otherwise, handle accordingly
		switch (confirmation) {
			case ConfirmResult.SAVE: {
				const result = await editor.save(this.id, { reason: saveReason });
				if (!result && autoSave) {
					// Save failed and we need to signal this back to the user, so
					// we handle the dirty editor again but this time ensuring to
					// show the confirm dialog
					// (see https://github.com/microsoft/vscode/issues/108752)
					return this.doHandleCloseConfirmation(editor, { skipAutoSave: true });
				}

				return editor.isDirty(); // veto if still dirty
			}
			case ConfirmResult.DONT_SAVE:
				try {

					// first try a normal revert where the contents of the editor are restored
					await editor.revert(this.id);

					return editor.isDirty(); // veto if still dirty
				} catch (error) {
					this.logService.error(error);

					// if that fails, since we are about to close the editor, we accept that
					// the editor cannot be reverted and instead do a soft revert that just
					// enables us to close the editor. With this, a user can always close a
					// dirty editor even when reverting fails.

					await editor.revert(this.id, { soft: true });

					return editor.isDirty(); // veto if still dirty
				}
			case ConfirmResult.CANCEL:
				return true; // veto
		}
	}

	private shouldConfirmClose(editor: EditorInput): boolean {
		if (editor.closeHandler) {
			try {
				return editor.closeHandler.showConfirm(); // custom handling of confirmation on close
			} catch (error) {
				this.logService.error(error);
			}
		}

		return editor.isDirty() && !editor.isSaving(); // editor must be dirty and not saving
	}

	//#endregion

	//#region closeEditors()

	async closeEditors(args: EditorInput[] | ICloseEditorsFilter, options?: ICloseEditorOptions): Promise<boolean> {
		if (this.isEmpty) {
			return true;
		}

		const editors = this.doGetEditorsToClose(args);

		// Check for confirmation and veto
		const veto = await this.handleCloseConfirmation(editors.slice(0));
		if (veto) {
			return false;
		}

		// Do close
		this.doCloseEditors(editors, options);

		return true;
	}

	private doGetEditorsToClose(args: EditorInput[] | ICloseEditorsFilter): EditorInput[] {
		if (Array.isArray(args)) {
			return args;
		}

		const filter = args;
		const hasDirection = typeof filter.direction === 'number';

		let editorsToClose = this.model.getEditors(hasDirection ? EditorsOrder.SEQUENTIAL : EditorsOrder.MOST_RECENTLY_ACTIVE, filter); // in MRU order only if direction is not specified

		// Filter: saved or saving only
		if (filter.savedOnly) {
			editorsToClose = editorsToClose.filter(editor => !editor.isDirty() || editor.isSaving());
		}

		// Filter: direction (left / right)
		else if (hasDirection && filter.except) {
			editorsToClose = (filter.direction === CloseDirection.LEFT) ?
				editorsToClose.slice(0, this.model.indexOf(filter.except, editorsToClose)) :
				editorsToClose.slice(this.model.indexOf(filter.except, editorsToClose) + 1);
		}

		// Filter: except
		else if (filter.except) {
			editorsToClose = editorsToClose.filter(editor => filter.except && !editor.matches(filter.except));
		}

		return editorsToClose;
	}

	private doCloseEditors(editors: EditorInput[], options?: ICloseEditorOptions): void {

		// Close all inactive editors first
		let closeActiveEditor = false;
		for (const editor of editors) {
			if (!this.isActive(editor)) {
				this.doCloseInactiveEditor(editor);
			} else {
				closeActiveEditor = true;
			}
		}

		// Close active editor last if contained in editors list to close
		if (closeActiveEditor) {
			this.doCloseActiveEditor(options?.preserveFocus);
		}

		// Forward to title control
		if (editors.length) {
			this.titleControl.closeEditors(editors);
		}
	}

	//#endregion

	//#region closeAllEditors()

	closeAllEditors(options: { excludeConfirming: true }): boolean;
	closeAllEditors(options?: ICloseAllEditorsOptions): Promise<boolean>;
	closeAllEditors(options?: ICloseAllEditorsOptions): boolean | Promise<boolean> {
		if (this.isEmpty) {

			// If the group is empty and the request is to close all editors, we still close
			// the editor group is the related setting to close empty groups is enabled for
			// a convenient way of removing empty editor groups for the user.
			if (this.groupsView.partOptions.closeEmptyGroups) {
				this.groupsView.removeGroup(this);
			}

			return true;
		}

		// We can go ahead and close "sync" when we exclude confirming editors
		if (options?.excludeConfirming) {
			this.doCloseAllEditors(options);
			return true;
		}

		// Otherwise go through potential confirmation "async"
		return this.handleCloseConfirmation(this.model.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, options)).then(veto => {
			if (veto) {
				return false;
			}

			this.doCloseAllEditors(options);
			return true;
		});
	}

	private doCloseAllEditors(options?: ICloseAllEditorsOptions): void {
		let editors = this.model.getEditors(EditorsOrder.SEQUENTIAL, options);
		if (options?.excludeConfirming) {
			editors = editors.filter(editor => !this.shouldConfirmClose(editor));
		}

		// Close all inactive editors first
		const editorsToClose: EditorInput[] = [];
		for (const editor of editors) {
			if (!this.isActive(editor)) {
				this.doCloseInactiveEditor(editor);
			}

			editorsToClose.push(editor);
		}

		// Close active editor last (unless we skip it, e.g. because it is sticky)
		if (this.activeEditor && editorsToClose.includes(this.activeEditor)) {
			this.doCloseActiveEditor();
		}

		// Forward to title control
		if (editorsToClose.length) {
			this.titleControl.closeEditors(editorsToClose);
		}
	}

	//#endregion

	//#region replaceEditors()

	async replaceEditors(editors: EditorReplacement[]): Promise<void> {

		// Extract active vs. inactive replacements
		let activeReplacement: EditorReplacement | undefined;
		const inactiveReplacements: EditorReplacement[] = [];
		for (let { editor, replacement, forceReplaceDirty, options } of editors) {
			const index = this.getIndexOfEditor(editor);
			if (index >= 0) {
				const isActiveEditor = this.isActive(editor);

				// make sure we respect the index of the editor to replace
				if (options) {
					options.index = index;
				} else {
					options = { index };
				}

				options.inactive = !isActiveEditor;
				options.pinned = options.pinned ?? true; // unless specified, prefer to pin upon replace

				const editorToReplace = { editor, replacement, forceReplaceDirty, options };
				if (isActiveEditor) {
					activeReplacement = editorToReplace;
				} else {
					inactiveReplacements.push(editorToReplace);
				}
			}
		}

		// Handle inactive first
		for (const { editor, replacement, forceReplaceDirty, options } of inactiveReplacements) {

			// Open inactive editor
			await this.doOpenEditor(replacement, options);

			// Close replaced inactive editor unless they match
			if (!editor.matches(replacement)) {
				let closed = false;
				if (forceReplaceDirty) {
					this.doCloseEditor(editor, true, { context: EditorCloseContext.REPLACE });
					closed = true;
				} else {
					closed = await this.doCloseEditorWithConfirmationHandling(editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE });
				}

				if (!closed) {
					return; // canceled
				}
			}
		}

		// Handle active last
		if (activeReplacement) {

			// Open replacement as active editor
			const openEditorResult = this.doOpenEditor(activeReplacement.replacement, activeReplacement.options);

			// Close replaced active editor unless they match
			if (!activeReplacement.editor.matches(activeReplacement.replacement)) {
				if (activeReplacement.forceReplaceDirty) {
					this.doCloseEditor(activeReplacement.editor, true, { context: EditorCloseContext.REPLACE });
				} else {
					await this.doCloseEditorWithConfirmationHandling(activeReplacement.editor, { preserveFocus: true }, { context: EditorCloseContext.REPLACE });
				}
			}

			await openEditorResult;
		}
	}

	//#endregion

	//#region Locking

	get isLocked(): boolean {
		return this.model.isLocked;
	}

	lock(locked: boolean): void {
		this.model.lock(locked);
	}

	//#endregion

	//#region Editor Actions

	createEditorActions(disposables: DisposableStore, menuId = MenuId.EditorTitle): IActiveEditorActions {
		let actions: PrimaryAndSecondaryActions = { primary: [], secondary: [] };
		let onDidChange: Event<IMenuChangeEvent | void> | undefined;

		// Editor actions require the editor control to be there, so we retrieve it via service
		const activeEditorPane = this.activeEditorPane;
		if (activeEditorPane instanceof EditorPane) {
			const editorScopedContextKeyService = activeEditorPane.scopedContextKeyService ?? this.scopedContextKeyService;
			const editorTitleMenu = disposables.add(this.menuService.createMenu(menuId, editorScopedContextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: 0 }));
			onDidChange = editorTitleMenu.onDidChange;

			const shouldInlineGroup = (action: SubmenuAction, group: string) => group === 'navigation' && action.actions.length <= 1;

			actions = getActionBarActions(
				editorTitleMenu.getActions({ arg: this.resourceContext.get(), shouldForwardArgs: true }),
				'navigation',
				shouldInlineGroup
			);
		} else {
			// If there is no active pane in the group (it's the last group and it's empty)
			// Trigger the change event when the active editor changes
			const onDidChangeEmitter = disposables.add(new Emitter<void>());
			onDidChange = onDidChangeEmitter.event;
			disposables.add(this.onDidActiveEditorChange(() => onDidChangeEmitter.fire()));
		}

		return { actions, onDidChange };
	}

	//#endregion

	//#region Themable

	override updateStyles(): void {
		const isEmpty = this.isEmpty;

		// Container
		if (isEmpty) {
			this.element.style.backgroundColor = this.getColor(EDITOR_GROUP_EMPTY_BACKGROUND) || '';
		} else {
			this.element.style.backgroundColor = '';
		}

		// Title control
		const borderColor = this.getColor(EDITOR_GROUP_HEADER_BORDER) || this.getColor(contrastBorder);
		if (!isEmpty && borderColor) {
			this.titleContainer.classList.add('title-border-bottom');
			this.titleContainer.style.setProperty('--title-border-bottom-color', borderColor);
		} else {
			this.titleContainer.classList.remove('title-border-bottom');
			this.titleContainer.style.removeProperty('--title-border-bottom-color');
		}

		const { showTabs } = this.groupsView.partOptions;
		this.titleContainer.style.backgroundColor = this.getColor(showTabs === 'multiple' ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND) || '';

		// Editor container
		this.editorContainer.style.backgroundColor = this.getColor(editorBackground) || '';
	}

	//#endregion

	//#region ISerializableView

	readonly element: HTMLElement = $('div');

	get minimumWidth(): number { return this.editorPane.minimumWidth; }
	get minimumHeight(): number { return this.editorPane.minimumHeight; }
	get maximumWidth(): number { return this.editorPane.maximumWidth; }
	get maximumHeight(): number { return this.editorPane.maximumHeight; }

	get proportionalLayout(): boolean {
		if (!this.lastLayout) {
			return true;
		}

		return !(this.lastLayout.width === this.minimumWidth || this.lastLayout.height === this.minimumHeight);
	}

	private _onDidChange = this._register(new Relay<{ width: number; height: number } | undefined>());
	readonly onDidChange = this._onDidChange.event;

	layout(width: number, height: number, top: number, left: number): void {
		this.lastLayout = { width, height, top, left };
		this.element.classList.toggle('max-height-478px', height <= 478);

		// Layout the title control first to receive the size it occupies
		const titleControlSize = this.titleControl.layout({
			container: new Dimension(width, height),
			available: new Dimension(width, height - this.editorPane.minimumHeight)
		});

		// Update progress bar location
		this.progressBar.getContainer().style.top = `${Math.max(this.titleHeight.offset - 2, 0)}px`;

		// Pass the container width and remaining height to the editor layout
		const editorHeight = Math.max(0, height - titleControlSize.height);
		this.editorContainer.style.height = `${editorHeight}px`;
		this.editorPane.layout({ width, height: editorHeight, top: top + titleControlSize.height, left });
	}

	relayout(): void {
		if (this.lastLayout) {
			const { width, height, top, left } = this.lastLayout;
			this.layout(width, height, top, left);
		}
	}

	setBoundarySashes(sashes: IBoundarySashes): void {
		this.editorPane.setBoundarySashes(sashes);
	}

	toJSON(): ISerializedEditorGroupModel {
		return this.model.serialize();
	}

	//#endregion

	override dispose(): void {
		this._disposed = true;

		this._onWillDispose.fire();

		super.dispose();
	}
}

export interface EditorReplacement extends IEditorReplacement {
	readonly editor: EditorInput;
	readonly replacement: EditorInput;
	readonly options?: IEditorOptions;
}
