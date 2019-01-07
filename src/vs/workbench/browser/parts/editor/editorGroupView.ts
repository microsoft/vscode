/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorgroupview';
import { EditorGroup, IEditorOpenOptions, EditorCloseEvent, ISerializedEditorGroup, isSerializedEditorGroup } from 'vs/workbench/common/editor/editorGroup';
import { EditorInput, EditorOptions, GroupIdentifier, ConfirmResult, SideBySideEditorInput, CloseDirection, IEditorCloseEvent, EditorGroupActiveEditorDirtyContext, IEditor } from 'vs/workbench/common/editor';
import { Event, Emitter, Relay } from 'vs/base/common/event';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { addClass, addClasses, Dimension, trackFocus, toggleClass, removeClass, addDisposableListener, EventType, EventHelper, findParentWithClass, clearNode, isAncestor } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { editorBackground, contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { Themable, EDITOR_GROUP_HEADER_TABS_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND, EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_EMPTY_BACKGROUND, EDITOR_GROUP_FOCUSED_EMPTY_BORDER } from 'vs/workbench/common/theme';
import { IMoveEditorOptions, ICopyEditorOptions, ICloseEditorsFilter, IGroupChangeEvent, GroupChangeKind, EditorsOrder, GroupsOrder } from 'vs/workbench/services/group/common/editorGroupsService';
import { TabsTitleControl } from 'vs/workbench/browser/parts/editor/tabsTitleControl';
import { EditorControl } from 'vs/workbench/browser/parts/editor/editorControl';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ProgressService } from 'vs/workbench/services/progress/browser/progressService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { localize } from 'vs/nls';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { Severity, INotificationService, INotificationActions } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { RunOnceWorker } from 'vs/base/common/async';
import { EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import { TitleControl } from 'vs/workbench/browser/parts/editor/titleControl';
import { IEditorGroupsAccessor, IEditorGroupView, IEditorPartOptionsChangeEvent, getActiveTextEditorOptions, IEditorOpeningEvent } from 'vs/workbench/browser/parts/editor/editor';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { join } from 'vs/base/common/paths';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ActionRunner, IAction, Action } from 'vs/base/common/actions';
import { CLOSE_EDITOR_GROUP_COMMAND_ID } from 'vs/workbench/browser/parts/editor/editorCommands';
import { NoTabsTitleControl } from 'vs/workbench/browser/parts/editor/noTabsTitleControl';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { fillInContextMenuActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { isErrorWithActions, IErrorWithActions } from 'vs/base/common/errorsWithActions';
import { URI } from 'vs/base/common/uri';

export class EditorGroupView extends Themable implements IEditorGroupView {

	//#region factory

	static createNew(accessor: IEditorGroupsAccessor, label: string, instantiationService: IInstantiationService): IEditorGroupView {
		return instantiationService.createInstance(EditorGroupView, accessor, null, label);
	}

	static createFromSerialized(serialized: ISerializedEditorGroup, accessor: IEditorGroupsAccessor, label: string, instantiationService: IInstantiationService): IEditorGroupView {
		return instantiationService.createInstance(EditorGroupView, accessor, serialized, label);
	}

	static createCopy(copyFrom: IEditorGroupView, accessor: IEditorGroupsAccessor, label: string, instantiationService: IInstantiationService): IEditorGroupView {
		return instantiationService.createInstance(EditorGroupView, accessor, copyFrom, label);
	}

	//#endregion

	//#region events

	private _onDidFocus: Emitter<void> = this._register(new Emitter<void>());
	get onDidFocus(): Event<void> { return this._onDidFocus.event; }

	private _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	get onWillDispose(): Event<void> { return this._onWillDispose.event; }

	private _onDidGroupChange: Emitter<IGroupChangeEvent> = this._register(new Emitter<IGroupChangeEvent>());
	get onDidGroupChange(): Event<IGroupChangeEvent> { return this._onDidGroupChange.event; }

	private _onWillOpenEditor: Emitter<IEditorOpeningEvent> = this._register(new Emitter<IEditorOpeningEvent>());
	get onWillOpenEditor(): Event<IEditorOpeningEvent> { return this._onWillOpenEditor.event; }

	private _onDidOpenEditorFail: Emitter<EditorInput> = this._register(new Emitter<EditorInput>());
	get onDidOpenEditorFail(): Event<EditorInput> { return this._onDidOpenEditorFail.event; }

	private _onWillCloseEditor: Emitter<IEditorCloseEvent> = this._register(new Emitter<IEditorCloseEvent>());
	get onWillCloseEditor(): Event<IEditorCloseEvent> { return this._onWillCloseEditor.event; }

	private _onDidCloseEditor: Emitter<IEditorCloseEvent> = this._register(new Emitter<IEditorCloseEvent>());
	get onDidCloseEditor(): Event<IEditorCloseEvent> { return this._onDidCloseEditor.event; }

	//#endregion

	private _group: EditorGroup;
	private _disposed: boolean;

	private active: boolean;
	private dimension: Dimension;

	private _whenRestored: Promise<void>;
	private isRestored: boolean;

	private scopedInstantiationService: IInstantiationService;

	private titleContainer: HTMLElement;
	private titleAreaControl: TitleControl;

	private progressBar: ProgressBar;

	private editorContainer: HTMLElement;
	private editorControl: EditorControl;

	private ignoreOpenEditorErrors: boolean;
	private disposedEditorsWorker: RunOnceWorker<EditorInput>;

	private mapEditorToPendingConfirmation: Map<EditorInput, Promise<boolean>> = new Map<EditorInput, Promise<boolean>>();

	constructor(
		private accessor: IEditorGroupsAccessor,
		from: IEditorGroupView | ISerializedEditorGroup,
		private _label: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IUntitledEditorService private readonly untitledEditorService: IUntitledEditorService,
		@IKeybindingService private readonly keybindingService: IKeybindingService,
		@IMenuService private readonly menuService: IMenuService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super(themeService);

		if (from instanceof EditorGroupView) {
			this._group = this._register(from.group.clone());
		} else if (isSerializedEditorGroup(from)) {
			this._group = this._register(instantiationService.createInstance(EditorGroup, from));
		} else {
			this._group = this._register(instantiationService.createInstance(EditorGroup, undefined));
		}

		this.disposedEditorsWorker = this._register(new RunOnceWorker(editors => this.handleDisposedEditors(editors), 0));

		this.create();

		this._whenRestored = this.restoreEditors(from);
		this._whenRestored.then(() => this.isRestored = true);

		this.registerListeners();
	}

	private create(): void {

		// Container
		addClasses(this.element, 'editor-group-container');

		// Container listeners
		this.registerContainerListeners();

		// Container toolbar
		this.createContainerToolbar();

		// Container context menu
		this.createContainerContextMenu();

		// Letterpress container
		const letterpressContainer = document.createElement('div');
		addClass(letterpressContainer, 'editor-group-letterpress');
		this.element.appendChild(letterpressContainer);

		// Progress bar
		this.progressBar = this._register(new ProgressBar(this.element));
		this._register(attachProgressBarStyler(this.progressBar, this.themeService));
		this.progressBar.hide();

		// Scoped services
		const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
		this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection(
			[IContextKeyService, scopedContextKeyService],
			[IProgressService, new ProgressService(this.progressBar)]
		));

		// Context keys
		this.handleGroupContextKeys(scopedContextKeyService);

		// Title container
		this.titleContainer = document.createElement('div');
		addClass(this.titleContainer, 'title');
		this.element.appendChild(this.titleContainer);

		// Title control
		this.createTitleAreaControl();

		// Editor container
		this.editorContainer = document.createElement('div');
		addClass(this.editorContainer, 'editor-container');
		this.element.appendChild(this.editorContainer);

		// Editor control
		this.editorControl = this._register(this.scopedInstantiationService.createInstance(EditorControl, this.editorContainer, this));
		this._onDidChange.input = this.editorControl.onDidSizeConstraintsChange;

		// Track Focus
		this.doTrackFocus();

		// Update containers
		this.updateTitleContainer();
		this.updateContainer();

		// Update styles
		this.updateStyles();
	}

	private handleGroupContextKeys(contextKeyServcie: IContextKeyService): void {
		const groupActiveEditorDirtyContextKey = EditorGroupActiveEditorDirtyContext.bindTo(contextKeyServcie);

		let activeEditorListener: IDisposable;

		const observeActiveEditor = () => {
			activeEditorListener = dispose(activeEditorListener);

			const activeEditor = this._group.activeEditor;
			if (activeEditor) {
				groupActiveEditorDirtyContextKey.set(activeEditor.isDirty());
				activeEditorListener = activeEditor.onDidChangeDirty(() => groupActiveEditorDirtyContextKey.set(activeEditor.isDirty()));
			} else {
				groupActiveEditorDirtyContextKey.set(false);
			}
		};

		// Track the active editor and update context key that reflects
		// the dirty state of this editor
		this._register(this.onDidGroupChange(e => {
			if (e.kind === GroupChangeKind.EDITOR_ACTIVE) {
				observeActiveEditor();
			}
		}));

		observeActiveEditor();
	}

	private registerContainerListeners(): void {

		// Open new file via doubleclick on empty container
		this._register(addDisposableListener(this.element, EventType.DBLCLICK, e => {
			if (this.isEmpty()) {
				EventHelper.stop(e);

				this.openEditor(this.untitledEditorService.createOrGet(), EditorOptions.create({ pinned: true }));
			}
		}));

		// Close empty editor group via middle mouse click
		this._register(addDisposableListener(this.element, EventType.MOUSE_UP, e => {
			if (this.isEmpty() && e.button === 1 /* Middle Button */) {
				EventHelper.stop(e);

				this.accessor.removeGroup(this);
			}
		}));
	}

	private createContainerToolbar(): void {

		// Toolbar Container
		const toolbarContainer = document.createElement('div');
		addClass(toolbarContainer, 'editor-group-container-toolbar');
		this.element.appendChild(toolbarContainer);

		// Toolbar
		const groupId = this._group.id;
		const containerToolbar = new ActionBar(toolbarContainer, {
			ariaLabel: localize('araLabelGroupActions', "Editor group actions"), actionRunner: this._register(new class extends ActionRunner {
				run(action: IAction) {
					return action.run(groupId);
				}
			})
		});

		// Toolbar actions
		const removeGroupAction = this._register(new Action(CLOSE_EDITOR_GROUP_COMMAND_ID, localize('closeGroupAction', "Close"), 'close-editor-group', true, () => { this.accessor.removeGroup(this); return Promise.resolve(true); }));
		const keybinding = this.keybindingService.lookupKeybinding(removeGroupAction.id);
		containerToolbar.push(removeGroupAction, { icon: true, label: false, keybinding: keybinding ? keybinding.getLabel() : undefined });
	}

	private createContainerContextMenu(): void {
		const menu = this._register(this.menuService.createMenu(MenuId.EmptyEditorGroupContext, this.contextKeyService));

		this._register(addDisposableListener(this.element, EventType.CONTEXT_MENU, event => this.onShowContainerContextMenu(menu, event)));
		this._register(addDisposableListener(this.element, TouchEventType.Contextmenu, event => this.onShowContainerContextMenu(menu)));
	}

	private onShowContainerContextMenu(menu: IMenu, e?: MouseEvent): void {
		if (!this.isEmpty()) {
			return; // only for empty editor groups
		}

		// Find target anchor
		let anchor: HTMLElement | { x: number, y: number } = this.element;
		if (e instanceof MouseEvent) {
			const event = new StandardMouseEvent(e);
			anchor = { x: event.posx, y: event.posy };
		}

		// Fill in contributed actions
		const actions: IAction[] = [];
		fillInContextMenuActions(menu, undefined, actions, this.contextMenuService);

		// Show it
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => actions,
			onHide: () => this.focus()
		});
	}

	private doTrackFocus(): void {

		// Container
		const containerFocusTracker = this._register(trackFocus(this.element));
		this._register(containerFocusTracker.onDidFocus(() => {
			if (this.isEmpty()) {
				this._onDidFocus.fire(); // only when empty to prevent accident focus
			}
		}));

		// Title Container
		const handleTitleClickOrTouch = (e: MouseEvent | GestureEvent): void => {
			let target: HTMLElement;
			if (e instanceof MouseEvent) {
				if (e.button !== 0) {
					return undefined; // only for left mouse click
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

		// Editor Container
		this._register(this.editorControl.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
	}

	private updateContainer(): void {

		// Empty Container: add some empty container attributes
		if (this.isEmpty()) {
			addClass(this.element, 'empty');
			this.element.tabIndex = 0;
			this.element.setAttribute('aria-label', localize('emptyEditorGroup', "{0} (empty)", this.label));
		}

		// Non-Empty Container: revert empty container attributes
		else {
			removeClass(this.element, 'empty');
			this.element.removeAttribute('tabIndex');
			this.element.removeAttribute('aria-label');
		}

		// Update styles
		this.updateStyles();
	}

	private updateTitleContainer(): void {
		toggleClass(this.titleContainer, 'tabs', this.accessor.partOptions.showTabs);
		toggleClass(this.titleContainer, 'show-file-icons', this.accessor.partOptions.showIcons);
	}

	private createTitleAreaControl(): void {

		// Clear old if existing
		if (this.titleAreaControl) {
			this.titleAreaControl.dispose();
			clearNode(this.titleContainer);
		}

		// Create new based on options
		if (this.accessor.partOptions.showTabs) {
			this.titleAreaControl = this.scopedInstantiationService.createInstance(TabsTitleControl, this.titleContainer, this.accessor, this);
		} else {
			this.titleAreaControl = this.scopedInstantiationService.createInstance(NoTabsTitleControl, this.titleContainer, this.accessor, this);
		}
	}

	private restoreEditors(from: IEditorGroupView | ISerializedEditorGroup): Promise<void> {
		if (this._group.count === 0) {
			return Promise.resolve(); // nothing to show
		}

		// Determine editor options
		let options: EditorOptions;
		if (from instanceof EditorGroupView) {
			options = getActiveTextEditorOptions(from); // if we copy from another group, ensure to copy its active editor viewstate
		} else {
			options = new EditorOptions();
		}

		const activeEditor = this._group.activeEditor;
		options.pinned = this._group.isPinned(activeEditor);	// preserve pinned state
		options.preserveFocus = true;							// handle focus after editor is opened

		const activeElement = document.activeElement;

		// Show active editor
		return this.doShowEditor(activeEditor, true, options).then(() => {

			// Set focused now if this is the active group and focus has
			// not changed meanwhile. This prevents focus from being
			// stolen accidentally on startup when the user already
			// clicked somewhere.
			if (this.accessor.activeGroup === this && activeElement === document.activeElement) {
				this.focus();
			}
		});
	}

	//#region event handling

	private registerListeners(): void {

		// Model Events
		this._register(this._group.onDidEditorPin(editor => this.onDidEditorPin(editor)));
		this._register(this._group.onDidEditorOpen(editor => this.onDidEditorOpen(editor)));
		this._register(this._group.onDidEditorClose(editor => this.onDidEditorClose(editor)));
		this._register(this._group.onDidEditorDispose(editor => this.onDidEditorDispose(editor)));
		this._register(this._group.onDidEditorBecomeDirty(editor => this.onDidEditorBecomeDirty(editor)));
		this._register(this._group.onDidEditorLabelChange(editor => this.onDidEditorLabelChange(editor)));

		// Option Changes
		this._register(this.accessor.onDidEditorPartOptionsChange(e => this.onDidEditorPartOptionsChange(e)));
	}

	private onDidEditorPin(editor: EditorInput): void {

		// Event
		this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_PIN, editor });
	}

	private onDidEditorOpen(editor: EditorInput): void {
		/* __GDPR__
			"editorOpened" : {
				"${include}": [
					"${EditorTelemetryDescriptor}"
				]
			}
		*/
		this.telemetryService.publicLog('editorOpened', editor.getTelemetryDescriptor());

		// Update container
		this.updateContainer();

		// Event
		this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_OPEN, editor });
	}

	private onDidEditorClose(event: EditorCloseEvent): void {

		// Before close
		this._onWillCloseEditor.fire(event);

		// Handle event
		const editor = event.editor;
		const editorsToClose = [editor];

		// Include both sides of side by side editors when being closed and not opened multiple times
		if (editor instanceof SideBySideEditorInput && !this.accessor.groups.some(groupView => groupView.group.contains(editor))) {
			editorsToClose.push(editor.master, editor.details);
		}

		// Close the editor when it is no longer open in any group including diff editors
		editorsToClose.forEach(editorToClose => {
			const resource = editorToClose ? editorToClose.getResource() : undefined; // prefer resource to not close right-hand side editors of a diff editor
			if (!this.accessor.groups.some(groupView => groupView.group.contains(resource || editorToClose))) {
				editorToClose.close();
			}
		});

		/* __GDPR__
			"editorClosed" : {
				"${include}": [
					"${EditorTelemetryDescriptor}"
				]
			}
		*/
		this.telemetryService.publicLog('editorClosed', event.editor.getTelemetryDescriptor());

		// Update container
		this.updateContainer();

		// Event
		this._onDidCloseEditor.fire(event);
		this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_CLOSE, editor, editorIndex: event.index });
	}

	private onDidEditorDispose(editor: EditorInput): void {

		// To prevent race conditions, we handle disposed editors in our worker with a timeout
		// because it can happen that an input is being disposed with the intent to replace
		// it with some other input right after.
		this.disposedEditorsWorker.work(editor);
	}

	private handleDisposedEditors(editors: EditorInput[]): void {

		// Split between visible and hidden editors
		let activeEditor: EditorInput;
		const inactiveEditors: EditorInput[] = [];
		editors.forEach(editor => {
			if (this._group.isActive(editor)) {
				activeEditor = editor;
			} else if (this._group.contains(editor)) {
				inactiveEditors.push(editor);
			}
		});

		// Close all inactive editors first to prevent UI flicker
		inactiveEditors.forEach(hidden => this.doCloseEditor(hidden, false));

		// Close active one last
		if (activeEditor) {
			this.doCloseEditor(activeEditor, false);
		}
	}

	private onDidEditorPartOptionsChange(event: IEditorPartOptionsChangeEvent): void {

		// Title container
		this.updateTitleContainer();

		// Title control Switch between showing tabs <=> not showing tabs
		if (event.oldPartOptions.showTabs !== event.newPartOptions.showTabs) {
			this.createTitleAreaControl();

			if (this._group.activeEditor) {
				this.titleAreaControl.openEditor(this._group.activeEditor);
			}
		}

		// Just update title control
		else {
			this.titleAreaControl.updateOptions(event.oldPartOptions, event.newPartOptions);
		}

		// Styles
		this.updateStyles();

		// Pin preview editor once user disables preview
		if (event.oldPartOptions.enablePreview && !event.newPartOptions.enablePreview) {
			this.pinEditor(this._group.previewEditor);
		}
	}

	private onDidEditorBecomeDirty(editor: EditorInput): void {

		// Always show dirty editors pinned
		this.pinEditor(editor);

		// Forward to title control
		this.titleAreaControl.updateEditorDirty(editor);

		// Event
		this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_DIRTY, editor });
	}

	private onDidEditorLabelChange(editor: EditorInput): void {

		// Forward to title control
		this.titleAreaControl.updateEditorLabel(editor);

		// Event
		this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_LABEL, editor });
	}

	//#endregion

	//region IEditorGroupView

	get group(): EditorGroup {
		return this._group;
	}

	get label(): string {
		return this._label;
	}

	get disposed(): boolean {
		return this._disposed;
	}

	get whenRestored(): Promise<void> {
		return this._whenRestored;
	}

	setLabel(label: string): void {
		if (this._label !== label) {
			this._label = label;
			this._onDidGroupChange.fire({ kind: GroupChangeKind.GROUP_LABEL });
		}
	}

	setActive(isActive: boolean): void {
		this.active = isActive;

		// Update container
		toggleClass(this.element, 'active', isActive);
		toggleClass(this.element, 'inactive', !isActive);

		// Update title control
		this.titleAreaControl.setActive(isActive);

		// Update styles
		this.updateStyles();

		// Event
		this._onDidGroupChange.fire({ kind: GroupChangeKind.GROUP_ACTIVE });
	}

	isEmpty(): boolean {
		return this._group.count === 0;
	}

	//#endregion

	//#region IEditorGroup

	//#region basics()

	get id(): GroupIdentifier {
		return this._group.id;
	}

	get editors(): EditorInput[] {
		return this._group.getEditors();
	}

	get count(): number {
		return this._group.count;
	}

	get activeControl(): BaseEditor {
		return this.editorControl ? this.editorControl.activeControl : undefined;
	}

	get activeEditor(): EditorInput {
		return this._group.activeEditor;
	}

	get previewEditor(): EditorInput {
		return this._group.previewEditor;
	}

	isPinned(editor: EditorInput): boolean {
		return this._group.isPinned(editor);
	}

	isActive(editor: EditorInput): boolean {
		return this._group.isActive(editor);
	}

	getEditors(order?: EditorsOrder): EditorInput[] {
		if (order === EditorsOrder.MOST_RECENTLY_ACTIVE) {
			return this._group.getEditors(true);
		}

		return this.editors;
	}

	getEditor(index: number): EditorInput {
		return this._group.getEditor(index);
	}

	getIndexOfEditor(editor: EditorInput): number {
		return this._group.indexOf(editor);
	}

	isOpened(editor: EditorInput): boolean {
		return this._group.contains(editor);
	}

	focus(): void {

		// Pass focus to widgets
		if (this.activeControl) {
			this.activeControl.focus();
		} else {
			this.element.focus();
		}

		// Event
		this._onDidFocus.fire();
	}

	pinEditor(editor: EditorInput = this.activeEditor): void {
		if (editor && !this._group.isPinned(editor)) {

			// Update model
			this._group.pin(editor);

			// Forward to title control
			this.titleAreaControl.pinEditor(editor);
		}
	}

	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		return this.scopedInstantiationService.invokeFunction(fn);
	}

	//#endregion

	//#region openEditor()

	openEditor(editor: EditorInput, options?: EditorOptions): Promise<IEditor | null> {

		// Guard against invalid inputs
		if (!editor) {
			return Promise.resolve(null);
		}

		// Editor opening event allows for prevention
		const event = new EditorOpeningEvent(this._group.id, editor, options);
		this._onWillOpenEditor.fire(event);
		const prevented = event.isPrevented();
		if (prevented) {
			return prevented();
		}

		// Proceed with opening
		return this.doOpenEditor(editor, options);
	}

	private doOpenEditor(editor: EditorInput, options?: EditorOptions): Promise<IEditor> {

		// Determine options
		const openEditorOptions: IEditorOpenOptions = {
			index: options ? options.index : undefined,
			pinned: !this.accessor.partOptions.enablePreview || editor.isDirty() || (options && options.pinned) || (options && typeof options.index === 'number'),
			active: this._group.count === 0 || !options || !options.inactive
		};

		if (!openEditorOptions.active && !openEditorOptions.pinned && this._group.isPreview(this._group.activeEditor)) {
			// Special case: we are to open an editor inactive and not pinned, but the current active
			// editor is also not pinned, which means it will get replaced with this one. As such,
			// the editor can only be active.
			openEditorOptions.active = true;
		}

		// Set group active unless we open inactive or preserve focus
		// Do this before we open the editor in the group to prevent a false
		// active editor change event before the editor is loaded
		// (see https://github.com/Microsoft/vscode/issues/51679)
		if (openEditorOptions.active && (!options || !options.preserveFocus)) {
			this.accessor.activateGroup(this);
		}

		// Actually move the editor if a specific index is provided and we figure
		// out that the editor is already opened at a different index. This
		// ensures the right set of events are fired to the outside.
		if (typeof openEditorOptions.index === 'number') {
			const indexOfEditor = this._group.indexOf(editor);
			if (indexOfEditor !== -1 && indexOfEditor !== openEditorOptions.index) {
				this.doMoveEditorInsideGroup(editor, openEditorOptions);
			}
		}

		// Update model
		this._group.openEditor(editor, openEditorOptions);

		// Show editor
		return this.doShowEditor(editor, openEditorOptions.active, options);
	}

	private doShowEditor(editor: EditorInput, active: boolean, options?: EditorOptions): Promise<IEditor> {

		// Show in editor control if the active editor changed
		let openEditorPromise: Promise<IEditor>;
		if (active) {
			openEditorPromise = this.editorControl.openEditor(editor, options).then(result => {

				// Editor change event
				if (result.editorChanged) {
					this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_ACTIVE, editor });
				}

				return result.control;
			}, error => {

				// Handle errors but do not bubble them up
				this.doHandleOpenEditorError(error, editor, options);

				return null; // error: return NULL as result to signal this
			});
		} else {
			openEditorPromise = Promise.resolve(null); // inactive: return NULL as result to signal this
		}

		// Show in title control after editor control because some actions depend on it
		this.titleAreaControl.openEditor(editor);

		return openEditorPromise;
	}

	private doHandleOpenEditorError(error: Error, editor: EditorInput, options?: EditorOptions): void {

		// Report error only if this was not us restoring previous error state or
		// we are told to ignore errors that occur from opening an editor
		if (this.isRestored && !isPromiseCanceledError(error) && !this.ignoreOpenEditorErrors) {
			const actions: INotificationActions = { primary: [] };
			if (isErrorWithActions(error)) {
				actions.primary = (error as IErrorWithActions).actions;
			}

			const handle = this.notificationService.notify({
				severity: Severity.Error,
				message: localize('editorOpenError', "Unable to open '{0}': {1}.", editor.getName(), toErrorMessage(error)),
				actions
			});

			Event.once(handle.onDidClose)(() => dispose(actions.primary));
		}

		// Event
		this._onDidOpenEditorFail.fire(editor);

		// Recover by closing the active editor (if the input is still the active one)
		if (this.activeEditor === editor) {
			const focusNext = !options || !options.preserveFocus;
			this.doCloseEditor(editor, focusNext, true /* from error */);
		}
	}

	//#endregion

	//#region openEditors()

	openEditors(editors: { editor: EditorInput, options?: EditorOptions }[]): Promise<IEditor | null> {
		if (!editors.length) {
			return Promise.resolve(null);
		}

		// Do not modify original array
		editors = editors.slice(0);

		let result: IEditor;

		// Use the first editor as active editor
		const { editor, options } = editors.shift();
		return this.openEditor(editor, options).then(activeEditor => {
			result = activeEditor; // this can be NULL if the opening failed

			const startingIndex = this.getIndexOfEditor(editor) + 1;

			// Open the other ones inactive
			return Promise.all(editors.map(({ editor, options }, index) => {
				const adjustedEditorOptions = options || new EditorOptions();
				adjustedEditorOptions.inactive = true;
				adjustedEditorOptions.pinned = true;
				adjustedEditorOptions.index = startingIndex + index;

				return this.openEditor(editor, adjustedEditorOptions).then(activeEditor => {
					if (!result) {
						result = activeEditor; // only take if the first editor opening failed
					}
				});
			})).then(() => result);
		});
	}

	//#endregion

	//#region moveEditor()

	moveEditor(editor: EditorInput, target: IEditorGroupView, options?: IMoveEditorOptions): void {

		// Move within same group
		if (this === target) {
			this.doMoveEditorInsideGroup(editor, options);
		}

		// Move across groups
		else {
			this.doMoveOrCopyEditorAcrossGroups(editor, target, options);
		}
	}

	private doMoveEditorInsideGroup(editor: EditorInput, moveOptions?: IMoveEditorOptions): void {
		const moveToIndex = moveOptions ? moveOptions.index : undefined;
		if (typeof moveToIndex !== 'number') {
			return; // do nothing if we move into same group without index
		}

		const currentIndex = this._group.indexOf(editor);
		if (currentIndex === moveToIndex) {
			return; // do nothing if editor is already at the given index
		}

		// Update model
		this._group.moveEditor(editor, moveToIndex);
		this._group.pin(editor);

		// Forward to title area
		this.titleAreaControl.moveEditor(editor, currentIndex, moveToIndex);
		this.titleAreaControl.pinEditor(editor);

		// Event
		this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_MOVE, editor });
	}

	private doMoveOrCopyEditorAcrossGroups(editor: EditorInput, target: IEditorGroupView, moveOptions: IMoveEditorOptions = Object.create(null), keepCopy?: boolean): void {

		// When moving an editor, try to preserve as much view state as possible by checking
		// for the editor to be a text editor and creating the options accordingly if so
		const options = getActiveTextEditorOptions(this, editor, EditorOptions.create(moveOptions));
		options.pinned = true; // always pin moved editor

		// A move to another group is an open first...
		target.openEditor(editor, options);

		// ...and a close afterwards (unless we copy)
		if (!keepCopy) {
			this.doCloseEditor(editor, false /* do not focus next one behind if any */);
		}
	}

	//#endregion

	//#region copyEditor()

	copyEditor(editor: EditorInput, target: IEditorGroupView, options?: ICopyEditorOptions): void {

		// Move within same group because we do not support to show the same editor
		// multiple times in the same group
		if (this === target) {
			this.doMoveEditorInsideGroup(editor, options);
		}

		// Copy across groups
		else {
			this.doMoveOrCopyEditorAcrossGroups(editor, target, options, true);
		}
	}

	//#endregion

	//#region closeEditor()

	closeEditor(editor: EditorInput = this.activeEditor): Promise<void> {
		if (!editor) {
			return Promise.resolve();
		}

		// Check for dirty and veto
		return this.handleDirty([editor]).then(veto => {
			if (veto) {
				return;
			}

			// Do close
			this.doCloseEditor(editor);
		});
	}

	private doCloseEditor(editor: EditorInput, focusNext = this.accessor.activeGroup === this, fromError?: boolean): void {

		// Closing the active editor of the group is a bit more work
		if (this._group.isActive(editor)) {
			this.doCloseActiveEditor(focusNext, fromError);
		}

		// Closing inactive editor is just a model update
		else {
			this.doCloseInactiveEditor(editor);
		}

		// Forward to title control
		this.titleAreaControl.closeEditor(editor);
	}

	private doCloseActiveEditor(focusNext = this.accessor.activeGroup === this, fromError?: boolean): void {
		const editorToClose = this.activeEditor;
		const restoreFocus = this.shouldRestoreFocus(this.element);

		// Optimization: if we are about to close the last editor in this group and settings
		// are configured to close the group since it will be empty, we first set the last
		// active group as empty before closing the editor. This reduces the amount of editor
		// change events that this operation emits and will reduce flicker. Without this
		// optimization, this group (if active) would first trigger a active editor change
		// event because it became empty, only to then trigger another one when the next
		// group gets active.
		const closeEmptyGroup = this.accessor.partOptions.closeEmptyGroups;
		if (closeEmptyGroup && this.active && this._group.count === 1) {
			const mostRecentlyActiveGroups = this.accessor.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
			const nextActiveGroup = mostRecentlyActiveGroups[1]; // [0] will be the current one, so take [1]
			if (nextActiveGroup) {
				if (restoreFocus) {
					nextActiveGroup.focus();
				} else {
					this.accessor.activateGroup(nextActiveGroup);
				}
			}
		}

		// Update model
		this._group.closeEditor(editorToClose);

		// Open next active if there are more to show
		const nextActiveEditor = this._group.activeEditor;
		if (nextActiveEditor) {

			// When closing an editor due to an error we can end up in a loop where we continue closing
			// editors that fail to open (e.g. when the file no longer exists). We do not want to show
			// repeated errors in this case to the user. As such, if we open the next editor and we are
			// in a scope of a previous editor failing, we silence the input errors until the editor is
			// opened.
			if (fromError) {
				this.ignoreOpenEditorErrors = true;
			}

			const options = !focusNext ? EditorOptions.create({ preserveFocus: true }) : undefined;
			this.openEditor(nextActiveEditor, options).then(() => {
				this.ignoreOpenEditorErrors = false;
			});
		}

		// Otherwise we are empty, so clear from editor control and send event
		else {

			// Forward to editor control
			this.editorControl.closeEditor(editorToClose);

			// Restore focus to group container as needed unless group gets closed
			if (restoreFocus && !closeEmptyGroup) {
				this.focus();
			}

			// Events
			this._onDidGroupChange.fire({ kind: GroupChangeKind.EDITOR_ACTIVE });

			// Remove empty group if we should
			if (closeEmptyGroup) {
				this.accessor.removeGroup(this);
			}
		}
	}

	private shouldRestoreFocus(target: Element): boolean {
		const activeElement = document.activeElement;

		if (activeElement === document.body) {
			return true; // always restore focus if nothing is focused currently
		}

		// otherwise check for the active element being an ancestor of the target
		return isAncestor(activeElement, target);
	}

	private doCloseInactiveEditor(editor: EditorInput) {

		// Update model
		this._group.closeEditor(editor);
	}

	private handleDirty(editors: EditorInput[]): Promise<boolean /* veto */> {
		if (!editors.length) {
			return Promise.resolve(false); // no veto
		}

		const editor = editors.shift();

		// To prevent multiple confirmation dialogs from showing up one after the other
		// we check if a pending confirmation is currently showing and if so, join that
		let handleDirtyPromise = this.mapEditorToPendingConfirmation.get(editor);
		if (!handleDirtyPromise) {
			handleDirtyPromise = this.doHandleDirty(editor);
			this.mapEditorToPendingConfirmation.set(editor, handleDirtyPromise);
		}

		return handleDirtyPromise.then(veto => {

			// Make sure to remove from our map of cached pending confirmations
			this.mapEditorToPendingConfirmation.delete(editor);

			// Return for the first veto we got
			if (veto) {
				return veto;
			}

			// Otherwise continue with the remainders
			return this.handleDirty(editors);
		});
	}

	private doHandleDirty(editor: EditorInput): Promise<boolean /* veto */> {
		if (
			!editor.isDirty() || // editor must be dirty
			this.accessor.groups.some(groupView => groupView !== this && groupView.group.contains(editor, true /* support side by side */)) ||  // editor is opened in other group
			editor instanceof SideBySideEditorInput && this.isOpened(editor.master) // side by side editor master is still opened
		) {
			return Promise.resolve(false);
		}

		// Switch to editor that we want to handle and confirm to save/revert
		return this.openEditor(editor).then(() => editor.confirmSave().then(res => {

			// It could be that the editor saved meanwhile, so we check again
			// to see if anything needs to happen before closing for good.
			// This can happen for example if autoSave: onFocusChange is configured
			// so that the save happens when the dialog opens.
			if (!editor.isDirty()) {
				return res === ConfirmResult.CANCEL ? true : false;
			}

			// Otherwise, handle accordingly
			switch (res) {
				case ConfirmResult.SAVE:
					return editor.save().then(ok => !ok);

				case ConfirmResult.DONT_SAVE:

					// first try a normal revert where the contents of the editor are restored
					return editor.revert().then(ok => !ok, error => {

						// if that fails, since we are about to close the editor, we accept that
						// the editor cannot be reverted and instead do a soft revert that just
						// enables us to close the editor. With this, a user can always close a
						// dirty editor even when reverting fails.
						return editor.revert({ soft: true }).then(ok => !ok);
					});

				case ConfirmResult.CANCEL:
					return true; // veto
			}
		}));
	}

	//#endregion

	//#region closeEditors()

	closeEditors(args: EditorInput[] | ICloseEditorsFilter): Promise<void> {
		if (this.isEmpty()) {
			return Promise.resolve();
		}

		const editors = this.getEditorsToClose(args);

		// Check for dirty and veto
		return this.handleDirty(editors.slice(0)).then(veto => {
			if (veto) {
				return;
			}

			// Do close
			this.doCloseEditors(editors);
		});
	}

	private getEditorsToClose(editors: EditorInput[] | ICloseEditorsFilter): EditorInput[] {
		if (Array.isArray(editors)) {
			return editors;
		}

		const filter = editors;
		const hasDirection = typeof filter.direction === 'number';

		let editorsToClose = this._group.getEditors(!hasDirection /* in MRU order only if direction is not specified */);

		// Filter: saved only
		if (filter.savedOnly) {
			editorsToClose = editorsToClose.filter(e => !e.isDirty());
		}

		// Filter: direction (left / right)
		else if (hasDirection) {
			editorsToClose = (filter.direction === CloseDirection.LEFT) ?
				editorsToClose.slice(0, this._group.indexOf(filter.except as EditorInput)) :
				editorsToClose.slice(this._group.indexOf(filter.except as EditorInput) + 1);
		}

		// Filter: except
		else if (filter.except) {
			editorsToClose = editorsToClose.filter(e => !e.matches(filter.except));
		}

		return editorsToClose;
	}

	private doCloseEditors(editors: EditorInput[]): void {

		// Close all inactive editors first
		let closeActiveEditor = false;
		editors.forEach(editor => {
			if (!this.isActive(editor)) {
				this.doCloseInactiveEditor(editor);
			} else {
				closeActiveEditor = true;
			}
		});

		// Close active editor last if contained in editors list to close
		if (closeActiveEditor) {
			this.doCloseActiveEditor();
		}

		// Forward to title control
		this.titleAreaControl.closeEditors(editors);
	}

	//#endregion

	//#region closeAllEditors()

	closeAllEditors(): Promise<void> {
		if (this.isEmpty()) {

			// If the group is empty and the request is to close all editors, we still close
			// the editor group is the related setting to close empty groups is enabled for
			// a convinient way of removing empty editor groups for the user.
			if (this.accessor.partOptions.closeEmptyGroups) {
				this.accessor.removeGroup(this);
			}

			return Promise.resolve();
		}

		// Check for dirty and veto
		const editors = this._group.getEditors(true);
		return this.handleDirty(editors.slice(0)).then(veto => {
			if (veto) {
				return;
			}

			// Do close
			this.doCloseAllEditors();
		});
	}

	private doCloseAllEditors(): void {

		// Close all inactive editors first
		this.editors.forEach(editor => {
			if (!this.isActive(editor)) {
				this.doCloseInactiveEditor(editor);
			}
		});

		// Close active editor last
		this.doCloseActiveEditor();

		// Forward to title control
		this.titleAreaControl.closeAllEditors();
	}

	//#endregion

	//#region replaceEditors()

	replaceEditors(editors: EditorReplacement[]): Promise<void> {

		// Extract active vs. inactive replacements
		let activeReplacement: EditorReplacement;
		const inactiveReplacements: EditorReplacement[] = [];
		editors.forEach(({ editor, replacement, options }) => {
			if (editor.isDirty()) {
				return; // we do not handle dirty in this method, so ignore all dirty
			}

			const index = this.getIndexOfEditor(editor);
			if (index >= 0) {
				const isActiveEditor = this.isActive(editor);

				// make sure we respect the index of the editor to replace
				if (options) {
					options.index = index;
				} else {
					options = EditorOptions.create({ index });
				}

				options.inactive = !isActiveEditor;
				options.pinned = true;

				const editorToReplace = { editor, replacement, options };
				if (isActiveEditor) {
					activeReplacement = editorToReplace;
				} else {
					inactiveReplacements.push(editorToReplace);
				}
			}
		});

		// Handle inactive first
		inactiveReplacements.forEach(({ editor, replacement, options }) => {

			// Open inactive editor
			this.doOpenEditor(replacement, options);

			// Close replaced inactive edior
			this.doCloseInactiveEditor(editor);

			// Forward to title control
			this.titleAreaControl.closeEditor(editor);
		});

		// Handle active last
		if (activeReplacement) {

			// Open replacement as active editor
			const openEditorResult = this.doOpenEditor(activeReplacement.replacement, activeReplacement.options);

			// Close previous active editor
			this.doCloseInactiveEditor(activeReplacement.editor);

			// Forward to title control
			this.titleAreaControl.closeEditor(activeReplacement.editor);

			return openEditorResult.then(() => undefined);
		}

		return Promise.resolve();
	}

	//#endregion

	//#endregion

	//#region Themable

	protected updateStyles(): void {
		const isEmpty = this.isEmpty();

		// Container
		if (isEmpty) {
			this.element.style.backgroundColor = this.getColor(EDITOR_GROUP_EMPTY_BACKGROUND);
		} else {
			this.element.style.backgroundColor = null;
		}

		// Title control
		const { showTabs } = this.accessor.partOptions;
		const borderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER) || this.getColor(contrastBorder);

		if (!isEmpty && showTabs && borderColor) {
			addClass(this.titleContainer, 'title-border-bottom');
			this.titleContainer.style.setProperty('--title-border-bottom-color', borderColor.toString());
		} else {
			removeClass(this.titleContainer, 'title-border-bottom');
			this.titleContainer.style.removeProperty('--title-border-bottom-color');
		}

		this.titleContainer.style.backgroundColor = this.getColor(showTabs ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND);

		// Editor container
		this.editorContainer.style.backgroundColor = this.getColor(editorBackground);
	}

	//#endregion

	//#region ISerializableView

	readonly element: HTMLElement = document.createElement('div');

	get minimumWidth(): number { return this.editorControl.minimumWidth; }
	get minimumHeight(): number { return this.editorControl.minimumHeight; }
	get maximumWidth(): number { return this.editorControl.maximumWidth; }
	get maximumHeight(): number { return this.editorControl.maximumHeight; }

	private _onDidChange = this._register(new Relay<{ width: number; height: number; }>());
	readonly onDidChange: Event<{ width: number; height: number; }> = this._onDidChange.event;

	layout(width: number, height: number): void {
		this.dimension = new Dimension(width, height);

		// Ensure editor container gets height as CSS depending
		// on the preferred height of the title control
		this.editorContainer.style.height = `calc(100% - ${this.titleAreaControl.getPreferredHeight()}px)`;

		// Forward to controls
		this.titleAreaControl.layout(new Dimension(this.dimension.width, this.titleAreaControl.getPreferredHeight()));
		this.editorControl.layout(new Dimension(this.dimension.width, this.dimension.height - this.titleAreaControl.getPreferredHeight()));
	}

	relayout(): void {
		if (this.dimension) {
			const { width, height } = this.dimension;
			this.layout(width, height);
		}
	}

	toJSON(): ISerializedEditorGroup {
		return this._group.serialize();
	}

	//#endregion

	dispose(): void {
		this._disposed = true;

		this._onWillDispose.fire();

		this.titleAreaControl.dispose();
		// this.editorControl = null;

		super.dispose();
	}
}

class EditorOpeningEvent implements IEditorOpeningEvent {
	private override: () => Promise<IEditor>;

	constructor(
		private _group: GroupIdentifier,
		private _editor: EditorInput,
		private _options: EditorOptions
	) {
	}

	get groupId(): GroupIdentifier {
		return this._group;
	}

	get editor(): EditorInput {
		return this._editor;
	}

	get options(): EditorOptions {
		return this._options;
	}

	prevent(callback: () => Promise<IEditor>): void {
		this.override = callback;
	}

	isPrevented(): () => Promise<IEditor> {
		return this.override;
	}
}

export interface EditorReplacement {
	editor: EditorInput;
	replacement: EditorInput;
	options?: EditorOptions;
}

registerThemingParticipant((theme, collector, environment) => {

	// Letterpress
	const letterpress = `resources/letterpress${theme.type === 'dark' ? '-dark' : theme.type === 'hc' ? '-hc' : ''}.svg`;
	collector.addRule(`
		.monaco-workbench > .part.editor > .content .editor-group-container.empty .editor-group-letterpress {
			background-image: url('${URI.file(join(environment.appRoot, letterpress)).toString()}')
		}
	`);

	// Focused Empty Group Border
	const focusedEmptyGroupBorder = theme.getColor(EDITOR_GROUP_FOCUSED_EMPTY_BORDER);
	if (focusedEmptyGroupBorder) {
		collector.addRule(`
			.monaco-workbench > .part.editor > .content:not(.empty) .editor-group-container.empty.active:focus {
				outline-width: 1px;
				outline-color: ${focusedEmptyGroupBorder};
				outline-offset: -2px;
				outline-style: solid;
			}

			.monaco-workbench > .part.editor > .content.empty .editor-group-container.empty.active:focus {
				outline: none; /* never show outline for empty group if it is the last */
			}
		`);
	} else {
		collector.addRule(`
			.monaco-workbench > .part.editor > .content .editor-group-container.empty.active:focus {
				outline: none; /* disable focus outline unless active empty group border is defined */
			}
		`);
	}
});
