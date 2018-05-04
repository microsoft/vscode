/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/nextEditorGroupView';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorGroup, IEditorOpenOptions, EditorCloseEvent } from 'vs/workbench/common/editor/editorStacksModel';
import { EditorInput, EditorOptions, GroupIdentifier, ConfirmResult, SideBySideEditorInput, IEditorOpeningEvent, EditorOpeningEvent, TextEditorOptions } from 'vs/workbench/common/editor';
import { Event, Emitter, once } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { addClass, addClasses, Dimension, trackFocus, toggleClass, removeClass, addDisposableListener, EventType, EventHelper, findParentWithClass } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorBackground, contrastBorder, focusBorder } from 'vs/platform/theme/common/colorRegistry';
import { Themable, EDITOR_GROUP_HEADER_TABS_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND, EDITOR_GROUP_BACKGROUND } from 'vs/workbench/common/theme';
import { INextEditorGroup, IMoveEditorOptions } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { NextTabsTitleControl } from 'vs/workbench/browser/parts/editor2/nextTabsTitleControl';
import { NextEditorControl } from 'vs/workbench/browser/parts/editor2/nextEditorControl';
import { IView } from 'vs/base/browser/ui/grid/gridview';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ProgressService } from 'vs/workbench/services/progress/browser/progressService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { localize } from 'vs/nls';
import { onUnexpectedError, isPromiseCanceledError, isErrorWithActions, IErrorWithActions } from 'vs/base/common/errors';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { dispose } from 'vs/base/common/lifecycle';
import { Severity, INotificationService, INotificationActions } from 'vs/platform/notification/common/notification';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { RunOnceWorker } from 'vs/base/common/async';
import { IConfigurationService, IConfigurationChangeEvent } from 'vs/platform/configuration/common/configuration';
import { getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { EventType as TouchEventType, GestureEvent } from 'vs/base/browser/touch';
import { NextTitleControl } from 'vs/workbench/browser/parts/editor2/nextTitleControl';

export interface IGroupsAccessor {
	readonly groups: NextEditorGroupView[];
	readonly activeGroup: NextEditorGroupView;

	getGroup(identifier: GroupIdentifier): NextEditorGroupView;
}

export class NextEditorGroupView extends Themable implements IView, INextEditorGroup {

	private static readonly EDITOR_TITLE_HEIGHT = 35;
	private static readonly ENABLE_PREVIEW_SETTING = 'workbench.editor.enablePreview';

	//#region factory

	static createNew(groupsAccessor: IGroupsAccessor, instantiationService: IInstantiationService): NextEditorGroupView {
		return instantiationService.createInstance(NextEditorGroupView, groupsAccessor, null);
	}

	static createCopy(copyFrom: NextEditorGroupView, groupsAccessor: IGroupsAccessor, instantiationService: IInstantiationService): NextEditorGroupView {
		return instantiationService.createInstance(NextEditorGroupView, groupsAccessor, copyFrom);
	}

	//#endregion

	//#region events

	private _onDidFocus: Emitter<void> = this._register(new Emitter<void>());
	get onDidFocus(): Event<void> { return this._onDidFocus.event; }

	private _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	get onWillDispose(): Event<void> { return this._onWillDispose.event; }

	private _onDidActiveEditorChange: Emitter<void> = this._register(new Emitter<void>());
	get onDidActiveEditorChange(): Event<void> { return this._onDidActiveEditorChange.event; }

	private _onWillOpenEditor: Emitter<IEditorOpeningEvent> = this._register(new Emitter<IEditorOpeningEvent>());
	get onWillOpenEditor(): Event<IEditorOpeningEvent> { return this._onWillOpenEditor.event; }

	private _onWillCloseEditor: Emitter<EditorInput> = this._register(new Emitter<EditorInput>());
	get onWillCloseEditor(): Event<EditorInput> { return this._onWillCloseEditor.event; }

	private _onDidCloseEditor: Emitter<EditorInput> = this._register(new Emitter<EditorInput>());
	get onDidCloseEditor(): Event<EditorInput> { return this._onDidCloseEditor.event; }

	private _onDidOpenEditorFail: Emitter<EditorInput> = this._register(new Emitter<EditorInput>());
	get onDidOpenEditorFail(): Event<EditorInput> { return this._onDidOpenEditorFail.event; }

	//#endregion

	private group: EditorGroup;

	private _dimension: Dimension;
	private scopedInstantiationService: IInstantiationService;

	private titleContainer: HTMLElement;
	private titleAreaControl: NextTitleControl;

	private progressBar: ProgressBar;

	private editorContainer: HTMLElement;
	private editorControl: NextEditorControl;

	private ignoreOpenEditorErrors: boolean;
	private disposedEditorsWorker: RunOnceWorker<EditorInput>;

	constructor(
		private groupsAccessor: IGroupsAccessor,
		copyFromView: NextEditorGroupView,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IPartService private partService: IPartService,
		@INotificationService private notificationService: INotificationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(themeService);

		if (copyFromView) {
			this.group = this._register(copyFromView.group.clone());
		} else {
			this.group = this._register(instantiationService.createInstance(EditorGroup, ''));
		}
		this.group.label = `Group <${this.group.id}>`; // TODO@grid find a way to have a proper label

		this.disposedEditorsWorker = this._register(new RunOnceWorker(editors => this.handleDisposedEditors(editors), 0));

		this.doCreate();
		this.registerListeners();
	}

	//#region event handling

	private registerListeners(): void {

		// Model Events
		this._register(this.group.onDidEditorOpen(editor => this.onDidEditorOpen(editor)));
		this._register(this.group.onDidEditorClose(editor => this.onDidEditorClose(editor)));
		this._register(this.group.onDidEditorDispose(editor => this.onDidEditorDispose(editor)));
		this._register(this.group.onDidEditorBecomeDirty(editor => this.onDidEditorBecomeDirty(editor)));
		this._register(this.group.onDidEditorLabelChange(editor => this.onDidEditorLabelChange(editor)));

		// Configuration Changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onDidChangeConfiguration(e)));
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
	}

	private onDidEditorClose(event: EditorCloseEvent): void {

		// Before close
		this._onWillCloseEditor.fire(event.editor);

		// Handle event
		const editor = event.editor;
		const editorsToClose = [editor];

		// Include both sides of side by side editors when being closed and not opened multiple times
		if (editor instanceof SideBySideEditorInput && !this.groupsAccessor.groups.some(groupView => groupView.group.contains(editor))) {
			editorsToClose.push(editor.master, editor.details);
		}

		// Close the editor when it is no longer open in any group including diff editors
		editorsToClose.forEach(editorToClose => {
			const resource = editorToClose ? editorToClose.getResource() : void 0; // prefer resource to not close right-hand side editors of a diff editor
			if (!this.groupsAccessor.groups.some(groupView => groupView.group.contains(resource || editorToClose))) {
				editorToClose.close();
			}
		});

		// After close
		this._onDidCloseEditor.fire(event.editor);

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
			if (this.group.isActive(editor)) {
				activeEditor = editor;
			} else if (this.group.contains(editor)) {
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

	private onDidChangeConfiguration(event: IConfigurationChangeEvent): void {

		// Pin preview editor once user disables preview
		if (event.affectsConfiguration(NextEditorGroupView.ENABLE_PREVIEW_SETTING)) {
			if (!this.configurationService.getValue<string>(NextEditorGroupView.ENABLE_PREVIEW_SETTING)) {
				this.pinEditor(this.group.previewEditor);
			}
		}

		// TODO@grid handle title area related settings (tabs, etc, see EditorGroupsControl#updateTabOptions())
	}

	private onDidEditorBecomeDirty(editor: EditorInput): void {

		// Always show dirty editors pinned
		this.pinEditor(editor);

		// Forward to title control
		if (this.titleAreaControl) {
			this.titleAreaControl.updateEditorDirty(editor);
		}
	}

	private onDidEditorLabelChange(editor: EditorInput): void {

		// Forward to title control
		if (this.titleAreaControl) {
			this.titleAreaControl.updateEditorLabel(editor);
		}
	}

	//#endregion

	private doCreate(): void {

		// Container
		addClasses(this.element, 'editor-group-container');

		// Title container
		this.titleContainer = document.createElement('div');
		addClasses(this.titleContainer, 'title', 'tabs', 'show-file-icons'); // TODO@grid support tab/icon options
		this.element.appendChild(this.titleContainer);

		// Progress bar
		this.progressBar = this._register(new ProgressBar(this.element));
		this._register(attachProgressBarStyler(this.progressBar, this.themeService));
		this.progressBar.hide();

		// Editor container
		this.editorContainer = document.createElement('div');
		addClass(this.editorContainer, 'editor-container');
		this.element.appendChild(this.editorContainer);

		// Update styles
		this.updateStyles();

		// Update container
		this.updateContainer();

		// Track Focus
		this.doTrackFocus();
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
					return void 0; // only for left mouse click
				}

				target = e.target as HTMLElement;
			} else {
				target = (e as GestureEvent).initialTarget as HTMLElement;
			}

			if (findParentWithClass(target, 'monaco-action-bar', this.titleContainer)) {
				return; // not when clicking on actions
			}

			EventHelper.stop(e);

			this.focus();
		};

		this._register(addDisposableListener(this.titleContainer, EventType.MOUSE_UP, e => handleTitleClickOrTouch(e)));
		this._register(addDisposableListener(this.titleContainer, TouchEventType.Tap, e => handleTitleClickOrTouch(e)));

		// Editor Container
		const editorFocusTracker = this._register(trackFocus(this.editorContainer));
		this._register(editorFocusTracker.onDidFocus(() => {
			this._onDidFocus.fire();
		}));
	}

	private updateContainer(): void {

		// Empty Container: allow to focus
		if (this.isEmpty()) {
			addClass(this.element, 'empty');
			this.element.tabIndex = 0;
			this.element.setAttribute('aria-label', localize('emptyEditorGroup', "Empty Editor Group"));
		}

		// Non-Empty Container: revert empty container attributes
		else {
			removeClass(this.element, 'empty');
			this.element.removeAttribute('tabIndex');
			this.element.removeAttribute('aria-label');
		}
	}

	get dimension(): Dimension {
		return this._dimension;
	}

	setActive(isActive: boolean): void {

		// Update container
		toggleClass(this.element, 'active', isActive);
		toggleClass(this.element, 'inactive', !isActive);

		// Update title control
		if (this.titleAreaControl) {
			this.titleAreaControl.setActive(isActive);
		}
	}

	isEmpty(): boolean {
		return this.group.count === 0;
	}

	//#region INextEditorGroup

	get id(): GroupIdentifier {
		return this.group.id;
	}

	get editors(): EditorInput[] {
		return this.group.getEditors();
	}

	get count(): number {
		return this.group.count;
	}

	get activeControl(): BaseEditor {
		return this.editorControl ? this.editorControl.activeControl : void 0;
	}

	get activeEditor(): EditorInput {
		return this.group.activeEditor;
	}

	isPinned(editor: EditorInput): boolean {
		return this.group.isPinned(editor);
	}

	isActive(editor: EditorInput): boolean {
		return this.group.isActive(editor);
	}

	getEditor(index: number): EditorInput {
		return this.group.getEditor(index);
	}

	getIndexOfEditor(editor: EditorInput): number {
		return this.group.indexOf(editor);
	}

	//#region openEditor()

	openEditor(editor: EditorInput, options?: EditorOptions): Thenable<void> {

		// Editor opening event allows for prevention
		const event = new EditorOpeningEvent(editor, options, this.group.id); // TODO@grid position => group ID
		this._onWillOpenEditor.fire(event);
		const prevented = event.isPrevented();
		if (prevented) {
			return prevented().then(() => void 0); // TODO@grid do we need the BaseEditor return type still in the event?
		}

		// Proceed with opening
		return this.doOpenEditor(editor, options);
	}

	private doOpenEditor(editor: EditorInput, options?: EditorOptions): Thenable<void> {

		// Update model
		const openEditorOptions: IEditorOpenOptions = {
			index: options ? options.index : void 0,
			pinned: editor.isDirty() || (options && options.pinned) || (options && typeof options.index === 'number'), // TODO@grid respect editor.previewEditors setting
			active: this.group.count === 0 || !options || !options.inactive
		};
		this.group.openEditor(editor, openEditorOptions);

		// Forward to title control
		this.doCreateOrGetTitleControl().openEditor(editor);

		// Forward to editor control if the editor should become active
		let openEditorPromise: Thenable<void>;
		if (openEditorOptions.active) {
			openEditorPromise = this.doCreateOrGetEditorControl().openEditor(editor, options).then(result => {

				// Editor change event
				if (result.editorChanged) {
					this._onDidActiveEditorChange.fire();
				}
			}, error => {

				// Handle errors but do not bubble them up
				this.doHandleOpenEditorError(error, editor, options);
			});
		} else {
			openEditorPromise = TPromise.as(void 0);
		}

		return openEditorPromise;
	}

	private doHandleOpenEditorError(error: Error, editor: EditorInput, options?: EditorOptions): void {

		// Report error only if this was not us restoring previous error state or
		// we are told to ignore errors that occur from opening an editor
		if (this.partService.isCreated() && !isPromiseCanceledError(error) && !this.ignoreOpenEditorErrors) {
			const actions: INotificationActions = { primary: [] };
			if (isErrorWithActions(error)) {
				actions.primary = (error as IErrorWithActions).actions;
			}

			const handle = this.notificationService.notify({
				severity: Severity.Error,
				message: localize('editorOpenError', "Unable to open '{0}': {1}.", editor.getName(), toErrorMessage(error)),
				actions
			});

			once(handle.onDidClose)(() => dispose(actions.primary));
		}

		// Event
		this._onDidOpenEditorFail.fire(editor);

		// Recover by closing the active editor (if the input is still the active one)
		if (this.activeEditor === editor) {
			this.doCloseActiveEditor(!(options && options.preserveFocus) /* still preserve focus as needed */, true /* from error */);
		}
	}

	private doCreateOrGetScopedInstantiationService(): IInstantiationService {
		if (!this.scopedInstantiationService) {
			this.scopedInstantiationService = this.instantiationService.createChild(new ServiceCollection(
				[IContextKeyService, this._register(this.contextKeyService.createScoped(this.element))],
				[IProgressService, new ProgressService(this.progressBar)]
			));
		}

		return this.scopedInstantiationService;
	}

	private doCreateOrGetTitleControl(): NextTitleControl {
		if (!this.titleAreaControl) {
			this.titleAreaControl = this._register(this.doCreateOrGetScopedInstantiationService().createInstance(NextTabsTitleControl, this.titleContainer, this.groupsAccessor, this));
			this.doLayoutTitleControl();
		}

		return this.titleAreaControl;
	}

	private doCreateOrGetEditorControl(): NextEditorControl {
		if (!this.editorControl) {
			this.editorControl = this._register(this.doCreateOrGetScopedInstantiationService().createInstance(NextEditorControl, this.editorContainer, this.group.id));
			this.doLayoutEditorControl();
		}

		return this.editorControl;
	}

	//#endregion

	//#region moveEditor()

	moveEditor(editor: EditorInput, target: NextEditorGroupView, options?: IMoveEditorOptions): void {

		// Move within same group
		if (this === target) {
			this.doMoveEditorInsideGroup(editor, options);
		}

		// Move across groups
		else {
			this.doMoveEditorAcrossGroups(editor, target, options);
		}
	}

	private doMoveEditorInsideGroup(editor: EditorInput, moveOptions?: IMoveEditorOptions): void {
		const moveToIndex = moveOptions ? moveOptions.index : void 0;
		if (typeof moveToIndex !== 'number') {
			return; // do nothing if we move into same group without index
		}

		const currentIndex = this.group.indexOf(editor);
		if (currentIndex === moveToIndex) {
			return; // do nothing if editor is already at the given index
		}

		// Update model
		this.group.moveEditor(editor, moveToIndex);
		this.group.pin(editor);

		// Forward to title area
		if (this.titleAreaControl) {
			this.titleAreaControl.moveEditor(editor, currentIndex, moveToIndex);
			this.titleAreaControl.pinEditor(editor);
		}
	}

	private doMoveEditorAcrossGroups(editor: EditorInput, target: NextEditorGroupView, moveOptions: IMoveEditorOptions = Object.create(null)): void {
		let options: EditorOptions;

		// When moving an editor, try to preserve as much view state as possible by checking
		// for the editor to be a text editor and creating the options accordingly if so
		const codeEditor = getCodeEditor(this.activeControl);
		if (codeEditor && editor.matches(this.activeEditor)) {
			options = TextEditorOptions.fromEditor(codeEditor, moveOptions);
		} else {
			options = EditorOptions.create(moveOptions);
		}

		// A move to another group is an open first...
		target.openEditor(editor, options);

		// ...and a close afterwards
		this.doCloseEditor(editor, false /* do not activate next one behind if any */);
	}

	//#endregion

	//#region closeEditor()

	closeEditor(editor: EditorInput = this.activeEditor): Thenable<void> {

		// Check for dirty and veto
		return this.handleDirty([editor], true /* ignore if opened in other group */).then(veto => {
			if (veto) {
				return;
			}

			// Do close
			this.doCloseEditor(editor);
		});
	}

	private doCloseEditor(editor: EditorInput, focusNext = this.groupsAccessor.activeGroup === this): void {

		// Closing the active editor of the group is a bit more work
		if (this.activeEditor && this.activeEditor.matches(editor)) {
			this.doCloseActiveEditor(focusNext);
		}

		// Closing inactive editor is just a model update
		else {
			this.doCloseInactiveEditor(editor);
		}
	}

	private doCloseActiveEditor(focusNext = this.groupsAccessor.activeGroup === this, fromError?: boolean): void {

		// Update model
		const index = this.group.closeEditor(this.activeEditor);

		// Forward to title control
		if (this.titleAreaControl) {
			this.titleAreaControl.closeEditor(this.activeEditor, index);
		}

		// Open next active if possible
		const nextActiveEditor = this.group.activeEditor;
		if (nextActiveEditor) {

			// When closing an editor due to an error we can end up in a loop where we continue closing
			// editors that fail to open (e.g. when the file no longer exists). We do not want to show
			// repeated errors in this case to the user. As such, if we open the next editor and we are
			// in a scope of a previous editor failing, we silence the input errors until the editor is
			// opened.
			if (fromError) {
				this.ignoreOpenEditorErrors = true;
			}

			this.openEditor(nextActiveEditor, !focusNext ? EditorOptions.create({ preserveFocus: true }) : null).then(() => {
				this.ignoreOpenEditorErrors = false;
			}, error => {
				onUnexpectedError(error);

				this.ignoreOpenEditorErrors = false;
			});
		} else {

			// Editor Change Event
			this._onDidActiveEditorChange.fire();

			// TODO@grid introduce and support a setting to close the group when the last editor closes
		}
	}

	private doCloseInactiveEditor(editor: EditorInput): void {

		// Update model
		const index = this.group.closeEditor(editor);

		// Forward to title control
		if (this.titleAreaControl) {
			this.titleAreaControl.closeEditor(editor, index); // TODO@grid avoid calling this for many editors to avoid perf issues
		}
	}

	private handleDirty(editors: EditorInput[], ignoreIfOpenedInOtherGroup?: boolean): Thenable<boolean /* veto */> {
		if (!editors.length) {
			return TPromise.as(false); // no veto
		}

		return this.doHandleDirty(editors.shift(), ignoreIfOpenedInOtherGroup).then(veto => {
			if (veto) {
				return veto;
			}

			return this.handleDirty(editors, ignoreIfOpenedInOtherGroup);
		});
	}

	private doHandleDirty(editor: EditorInput, ignoreIfOpenedInOtherGroup?: boolean): Thenable<boolean /* veto */> {

		// Return quickly if editor is not dirty
		if (!editor.isDirty()) {
			return TPromise.as(false); // no veto
		}

		// Return if editor is opened in other group and we are OK with it
		if (ignoreIfOpenedInOtherGroup) {
			const containedInOtherGroup = this.groupsAccessor.groups.some(groupView => groupView !== this && groupView.group.contains(editor, true /* support side by side */));
			if (containedInOtherGroup) {
				return TPromise.as(false); // no veto
			}
		}

		// Switch to editor that we want to handle
		return this.openEditor(editor).then(() => {
			return editor.confirmSave().then(res => {

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
			});
		});
	}

	//#endregion

	//#region other INextEditorGroup methods

	isOpened(editor: EditorInput): boolean {
		return this.group.contains(editor);
	}

	focus(): void {
		if (this.activeControl) {
			this.activeControl.focus();
		} else {
			this.element.focus();
		}
	}

	pinEditor(editor: EditorInput = this.activeEditor): void {
		if (editor && !this.group.isPinned(editor)) {

			// Update model
			this.group.pin(editor);

			// Forward to title control
			if (this.titleAreaControl) {
				this.titleAreaControl.pinEditor(editor);
			}
		}
	}

	//#endregion

	//#endregion

	//#region Themable

	protected updateStyles(): void {

		// Container
		this.element.style.backgroundColor = this.getColor(EDITOR_GROUP_BACKGROUND);
		this.element.style.outlineColor = this.getColor(focusBorder);

		// Title control (TODO@grid respect tab options)
		const borderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER) || this.getColor(contrastBorder);
		this.titleContainer.style.backgroundColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
		this.titleContainer.style.borderBottomWidth = borderColor ? '1px' : null;
		this.titleContainer.style.borderBottomStyle = borderColor ? 'solid' : null;
		this.titleContainer.style.borderBottomColor = borderColor;

		// Editor container
		this.editorContainer.style.backgroundColor = this.getColor(editorBackground);
	}

	//#endregion

	//#region IView

	readonly element: HTMLElement = document.createElement('div');

	readonly minimumWidth = 170;
	readonly minimumHeight = 70;
	readonly maximumWidth = Number.POSITIVE_INFINITY;
	readonly maximumHeight = Number.POSITIVE_INFINITY;

	get onDidChange() { return Event.None; }

	layout(width: number, height: number): void {
		this._dimension = new Dimension(width, height);

		// Forward to controls
		this.doLayoutTitleControl();
		this.doLayoutEditorControl();
	}

	private doLayoutTitleControl(): void {
		if (this.titleAreaControl) {
			this.titleAreaControl.layout(new Dimension(this._dimension.width, NextEditorGroupView.EDITOR_TITLE_HEIGHT));
		}
	}

	private doLayoutEditorControl(): void {
		if (this.editorControl) {
			this.editorControl.layout(new Dimension(this._dimension.width, this._dimension.height - NextEditorGroupView.EDITOR_TITLE_HEIGHT));
		}
	}

	//#endregion

	shutdown(): void {
		if (this.editorControl) {
			this.editorControl.shutdown();
		}
	}

	dispose(): void {
		this._onWillDispose.fire();

		super.dispose();
	}
}