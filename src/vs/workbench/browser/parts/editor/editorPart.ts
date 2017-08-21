/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/editorpart';
import 'vs/workbench/browser/parts/editor/editor.contribution';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import * as objects from 'vs/base/common/objects';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Scope as MementoScope } from 'vs/workbench/common/memento';
import { Part } from 'vs/workbench/browser/part';
import { BaseEditor, EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions, EditorInput, EditorOptions, ConfirmResult, IWorkbenchEditorConfiguration, IEditorDescriptor, TextEditorOptions, SideBySideEditorInput, TextCompareEditorVisible, TEXT_DIFF_EDITOR_ID } from 'vs/workbench/common/editor';
import { EditorGroupsControl, Rochade, IEditorGroupsControl, ProgressState } from 'vs/workbench/browser/parts/editor/editorGroupsControl';
import { WorkbenchProgressService } from 'vs/workbench/services/progress/browser/progressService';
import { IEditorGroupService, GroupOrientation, GroupArrangement, ITabOptions, IMoveOptions } from 'vs/workbench/services/group/common/groupService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorPart } from 'vs/workbench/services/editor/browser/editorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { Position, POSITIONS, Direction } from 'vs/platform/editor/common/editor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IMessageService, IMessageWithAction, Severity } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { EditorStacksModel, EditorGroup, EditorIdentifier, EditorCloseEvent } from 'vs/workbench/common/editor/editorStacksModel';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { EDITOR_GROUP_BACKGROUND } from 'vs/workbench/common/theme';
import { createCSSRule } from 'vs/base/browser/dom';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join } from 'vs/base/common/paths';

class ProgressMonitor {

	constructor(private _token: number, private progressPromise: TPromise<void>) { }

	public get token(): number {
		return this._token;
	}

	public cancel(): void {
		this.progressPromise.cancel();
	}
}

interface IEditorPartUIState {
	ratio: number[];
	groupOrientation: GroupOrientation;
}

interface IEditorReplacement extends EditorIdentifier {
	group: EditorGroup;
	editor: EditorInput;
	replaceWith: EditorInput;
	options?: EditorOptions;
}

/**
 * The editor part is the container for editors in the workbench. Based on the editor input being opened, it asks the registered
 * editor for the given input to show the contents. The editor part supports up to 3 side-by-side editors.
 */
export class EditorPart extends Part implements IEditorPart, IEditorGroupService {

	public _serviceBrand: any;

	private static GROUP_LEFT = nls.localize('groupOneVertical', "Left");
	private static GROUP_CENTER = nls.localize('groupTwoVertical', "Center");
	private static GROUP_RIGHT = nls.localize('groupThreeVertical', "Right");
	private static GROUP_TOP = nls.localize('groupOneHorizontal', "Top");
	private static GROUP_MIDDLE = nls.localize('groupTwoHorizontal', "Center");
	private static GROUP_BOTTOM = nls.localize('groupThreeHorizontal', "Bottom");

	private static EDITOR_PART_UI_STATE_STORAGE_KEY = 'editorpart.uiState';

	private dimension: Dimension;
	private editorGroupsControl: IEditorGroupsControl;
	private memento: object;
	private stacks: EditorStacksModel;
	private tabOptions: ITabOptions;
	private forceHideTabs: boolean;
	private doNotFireTabOptionsChanged: boolean;
	private revealIfOpen: boolean;

	private _onEditorsChanged: Emitter<void>;
	private _onEditorsMoved: Emitter<void>;
	private _onEditorOpenFail: Emitter<EditorInput>;
	private _onGroupOrientationChanged: Emitter<void>;
	private _onTabOptionsChanged: Emitter<ITabOptions>;

	private textCompareEditorVisible: IContextKey<boolean>;

	// The following data structures are partitioned into array of Position as provided by Services.POSITION array
	private visibleEditors: BaseEditor[];
	private instantiatedEditors: BaseEditor[][];
	private mapEditorInstantiationPromiseToEditor: { [editorId: string]: TPromise<BaseEditor>; }[];
	private editorOpenToken: number[];
	private pendingEditorInputsToClose: EditorIdentifier[];
	private pendingEditorInputCloseTimeout: number;

	private onLayoutEmitter = new Emitter<Dimension>();
	public onLayout = this.onLayoutEmitter.event;

	constructor(
		id: string,
		restoreFromStorage: boolean,
		@IMessageService private messageService: IMessageService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IStorageService private storageService: IStorageService,
		@IPartService private partService: IPartService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super(id, { hasTitle: false }, themeService);

		this._onEditorsChanged = new Emitter<void>();
		this._onEditorsMoved = new Emitter<void>();
		this._onEditorOpenFail = new Emitter<EditorInput>();
		this._onGroupOrientationChanged = new Emitter<void>();
		this._onTabOptionsChanged = new Emitter<ITabOptions>();

		this.visibleEditors = [];

		this.editorOpenToken = arrays.fill(POSITIONS.length, () => 0);

		this.instantiatedEditors = arrays.fill(POSITIONS.length, () => []);

		this.mapEditorInstantiationPromiseToEditor = arrays.fill(POSITIONS.length, () => Object.create(null));

		this.pendingEditorInputsToClose = [];
		this.pendingEditorInputCloseTimeout = null;

		this.stacks = this.instantiationService.createInstance(EditorStacksModel, restoreFromStorage);

		this.textCompareEditorVisible = TextCompareEditorVisible.bindTo(contextKeyService);

		const config = configurationService.getConfiguration<IWorkbenchEditorConfiguration>();
		if (config && config.workbench && config.workbench.editor) {
			const editorConfig = config.workbench.editor;

			this.tabOptions = {
				previewEditors: editorConfig.enablePreview,
				showIcons: editorConfig.showIcons,
				showTabs: editorConfig.showTabs,
				tabCloseButton: editorConfig.tabCloseButton
			};

			this.revealIfOpen = editorConfig.revealIfOpen;

			this.telemetryService.publicLog('workbenchEditorConfiguration', editorConfig);
		} else {
			this.tabOptions = {
				previewEditors: true,
				showIcons: false,
				showTabs: true,
				tabCloseButton: 'right'
			};

			this.revealIfOpen = false;
		}

		this.initStyles();
		this.registerListeners();
	}

	private initStyles(): void {

		// Letterpress Background when Empty
		createCSSRule('.vs .monaco-workbench > .part.editor.empty', `background-image: url('${join(this.environmentService.appRoot, 'resources/letterpress.svg')}')`);
		createCSSRule('.vs-dark .monaco-workbench > .part.editor.empty', `background-image: url('${join(this.environmentService.appRoot, 'resources/letterpress-dark.svg')}')`);
		createCSSRule('.hc-black .monaco-workbench > .part.editor.empty', `background-image: url('${join(this.environmentService.appRoot, 'resources/letterpress-hc.svg')}')`);
	}

	private registerListeners(): void {
		this.toUnbind.push(this.stacks.onEditorDirty(identifier => this.onEditorDirty(identifier)));
		this.toUnbind.push(this.stacks.onEditorDisposed(identifier => this.onEditorDisposed(identifier)));
		this.toUnbind.push(this.stacks.onEditorOpened(identifier => this.onEditorOpened(identifier)));
		this.toUnbind.push(this.stacks.onEditorClosed(event => this.onEditorClosed(event)));
		this.toUnbind.push(this.stacks.onGroupOpened(event => this.onEditorGroupOpenedOrClosed()));
		this.toUnbind.push(this.stacks.onGroupClosed(event => this.onEditorGroupOpenedOrClosed()));
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>())));
	}

	private onEditorGroupOpenedOrClosed(): void {
		this.updateStyles();
	}

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		if (configuration && configuration.workbench && configuration.workbench.editor) {
			const editorConfig = configuration.workbench.editor;

			// Pin all preview editors of the user chose to disable preview
			const newPreviewEditors = editorConfig.enablePreview;
			if (this.tabOptions.previewEditors !== newPreviewEditors && !newPreviewEditors) {
				this.stacks.groups.forEach(group => {
					if (group.previewEditor) {
						this.pinEditor(group, group.previewEditor);
					}
				});
			}

			const oldTabOptions = objects.clone(this.tabOptions);
			this.tabOptions = {
				previewEditors: newPreviewEditors,
				showIcons: editorConfig.showIcons,
				tabCloseButton: editorConfig.tabCloseButton,
				showTabs: this.forceHideTabs ? false : editorConfig.showTabs
			};

			if (!this.doNotFireTabOptionsChanged && !objects.equals(oldTabOptions, this.tabOptions)) {
				this._onTabOptionsChanged.fire(this.tabOptions);
			}

			this.revealIfOpen = editorConfig.revealIfOpen;
		}
	}

	private onEditorDirty(identifier: EditorIdentifier): void {

		// we pin every editor that becomes dirty
		this.pinEditor(identifier.group, identifier.editor);
	}

	private onEditorDisposed(identifier: EditorIdentifier): void {
		this.pendingEditorInputsToClose.push(identifier);
		this.startDelayedCloseEditorsFromInputDispose();
	}

	private onEditorOpened(identifier: EditorIdentifier): void {
		this.telemetryService.publicLog('editorOpened', identifier.editor.getTelemetryDescriptor());
	}

	private onEditorClosed(event: EditorCloseEvent): void {
		this.telemetryService.publicLog('editorClosed', event.editor.getTelemetryDescriptor());
	}

	public hideTabs(forceHide: boolean): void {
		this.forceHideTabs = forceHide;
		const config = this.configurationService.getConfiguration<IWorkbenchEditorConfiguration>();
		this.tabOptions.showTabs = forceHide ? false : config && config.workbench && config.workbench.editor && config.workbench.editor.showTabs;
		this._onTabOptionsChanged.fire(this.tabOptions);
	}

	public resizeGroup(position: Position, groupSizeChange: number): void {
		this.editorGroupsControl.resizeGroup(position, groupSizeChange);
	}

	public get onEditorsChanged(): Event<void> {
		return this._onEditorsChanged.event;
	}

	public get onEditorsMoved(): Event<void> {
		return this._onEditorsMoved.event;
	}

	public get onEditorOpenFail(): Event<EditorInput> {
		return this._onEditorOpenFail.event;
	}

	public get onGroupOrientationChanged(): Event<void> {
		return this._onGroupOrientationChanged.event;
	}

	public get onTabOptionsChanged(): Event<ITabOptions> {
		return this._onTabOptionsChanged.event;
	}

	public getTabOptions(): ITabOptions {
		return this.tabOptions;
	}

	public openEditor(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	public openEditor(input: EditorInput, options?: EditorOptions, position?: Position, ratio?: number[]): TPromise<BaseEditor>;
	public openEditor(input: EditorInput, options?: EditorOptions, arg3?: any, ratio?: number[]): TPromise<BaseEditor> {

		// Normalize some values
		if (!options) { options = null; }

		// Determine position to open editor in (one, two, three)
		const position = this.findPosition(input, options, arg3, ratio);

		// Some conditions under which we prevent the request
		if (
			!input ||																		// no input
			position === null ||															// invalid position
			Object.keys(this.mapEditorInstantiationPromiseToEditor[position]).length > 0 ||	// pending editor load
			!this.editorGroupsControl ||													// too early
			this.editorGroupsControl.isDragging()											// pending editor DND
		) {
			return TPromise.as<BaseEditor>(null);
		}

		// We need an editor descriptor for the input
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(input);
		if (!descriptor) {
			return TPromise.wrapError<BaseEditor>(new Error(strings.format('Can not find a registered editor for the input {0}', input)));
		}

		// Opened to the side
		if (position !== Position.ONE) {
			this.telemetryService.publicLog('workbenchSideEditorOpened', { position: position });
		}

		// Open through UI
		return this.doOpenEditor(position, descriptor, input, options, ratio);
	}

	private doOpenEditor(position: Position, descriptor: IEditorDescriptor, input: EditorInput, options: EditorOptions, ratio: number[]): TPromise<BaseEditor> {

		// Update stacks: We do this early on before the UI is there because we want our stacks model to have
		// a consistent view of the editor world and updating it later async after the UI is there will cause
		// issues (e.g. when a closeEditor call is made that expects the openEditor call to have updated the
		// stacks model).
		// This can however cause a race condition where the stacks model indicates the opened editor is there
		// while the UI is not yet ready. Clients have to deal with this fact and we have to make sure that the
		// stacks model gets updated if any of the UI updating fails with an error.
		const group = this.ensureGroup(position, !options || !options.preserveFocus);
		const pinned = !this.tabOptions.previewEditors || (options && (options.pinned || typeof options.index === 'number')) || input.isDirty();

		const active = (group.count === 0) || !options || !options.inactive;
		group.openEditor(input, { active, pinned, index: options && options.index });

		// Return early if the editor is to be open inactive and there are other editors in this group to show
		if (!active) {
			return TPromise.as<BaseEditor>(null);
		}

		// Progress Monitor & Ref Counting
		this.editorOpenToken[position]++;
		const editorOpenToken = this.editorOpenToken[position];
		const monitor = new ProgressMonitor(editorOpenToken, TPromise.timeout(this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */).then(() => {
			const position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			if (editorOpenToken === this.editorOpenToken[position]) {
				this.editorGroupsControl.updateProgress(position, ProgressState.INFINITE);
			}
		}));

		// Show editor
		return this.doShowEditor(group, descriptor, input, options, ratio, monitor).then(editor => {
			if (!editor) {
				return TPromise.as<BaseEditor>(null); // canceled or other error
			}

			// Set input to editor
			return this.doSetInput(group, editor, input, options, monitor);
		});
	}

	private doShowEditor(group: EditorGroup, descriptor: IEditorDescriptor, input: EditorInput, options: EditorOptions, ratio: number[], monitor: ProgressMonitor): TPromise<BaseEditor> {
		const position = this.stacks.positionOfGroup(group);
		const editorAtPosition = this.visibleEditors[position];

		// Return early if the currently visible editor can handle the input
		if (editorAtPosition && descriptor.describes(editorAtPosition)) {
			return TPromise.as(editorAtPosition);
		}

		// Hide active one first
		if (editorAtPosition) {
			this.doHideEditor(editorAtPosition, position, false);
		}

		// Create Editor
		return this.doCreateEditor(group, descriptor, monitor).then(editor => {
			const position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			// Make sure that the user meanwhile did not open another editor or something went wrong
			if (!editor || !this.visibleEditors[position] || editor.getId() !== this.visibleEditors[position].getId()) {
				monitor.cancel();

				return null;
			}

			// Show in side by side control
			this.editorGroupsControl.show(editor, position, options && options.preserveFocus, ratio);

			// Indicate to editor that it is now visible
			editor.setVisible(true, position);

			// Update text compare editor visible context
			this.updateTextCompareEditorVisible();

			// Make sure the editor is layed out
			this.editorGroupsControl.layout(position);

			return editor;

		}, e => {
			this.messageService.show(Severity.Error, types.isString(e) ? new Error(e) : e);
			return null;
		});
	}

	private doCreateEditor(group: EditorGroup, descriptor: IEditorDescriptor, monitor: ProgressMonitor): TPromise<BaseEditor> {

		// Instantiate editor
		return this.doInstantiateEditor(group, descriptor).then(editor => {
			const position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			// Make sure that the user meanwhile did not open another editor
			if (monitor.token !== this.editorOpenToken[position]) {
				monitor.cancel();

				return null;
			}

			// Remember Editor at position
			this.visibleEditors[position] = editor;

			// Create editor as needed
			if (!editor.getContainer()) {
				editor.create($().div({
					'class': 'editor-container',
					'role': 'tabpanel',
					id: descriptor.getId()
				}));
			}

			return editor;
		});
	}

	private doInstantiateEditor(group: EditorGroup, descriptor: IEditorDescriptor): TPromise<BaseEditor> {
		const position = this.stacks.positionOfGroup(group);

		// Return early if already instantiated
		const instantiatedEditor = this.instantiatedEditors[position].filter(e => descriptor.describes(e))[0];
		if (instantiatedEditor) {
			return TPromise.as(instantiatedEditor);
		}

		// Return early if editor is being instantiated at the same time from a previous call
		const pendingEditorInstantiate = this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()];
		if (pendingEditorInstantiate) {
			return pendingEditorInstantiate;
		}

		// Otherwise instantiate
		const progressService = this.instantiationService.createInstance(WorkbenchProgressService, this.editorGroupsControl.getProgressBar(position), descriptor.getId(), true);
		const editorInstantiationService = this.editorGroupsControl.getInstantiationService(position).createChild(new ServiceCollection([IProgressService, progressService]));
		let loaded = false;

		const onInstantiate = (arg: BaseEditor): TPromise<BaseEditor> => {
			const position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			loaded = true;
			delete this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()];

			this.instantiatedEditors[position].push(arg);

			return TPromise.as(arg);
		};

		const instantiateEditorPromise = editorInstantiationService.createInstance(<EditorDescriptor>descriptor).then(onInstantiate);

		if (!loaded) {
			this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()] = instantiateEditorPromise;
		}

		return instantiateEditorPromise.then(result => {
			progressService.dispose();

			return result;
		});
	}

	private doSetInput(group: EditorGroup, editor: BaseEditor, input: EditorInput, options: EditorOptions, monitor: ProgressMonitor): TPromise<BaseEditor> {

		// Emit Input-Changed Event as appropiate
		const previousInput = editor.input;
		const inputChanged = (!previousInput || !previousInput.matches(input) || (options && options.forceOpen));

		// Call into Editor
		return editor.setInput(input, options).then(() => {

			// Stop loading promise if any
			monitor.cancel();

			const position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile
			if (position === -1) {
				return null; // in theory a call to editor.setInput() could have resulted in the editor being closed due to an error, so we guard against it here
			}

			// Focus (unless prevented)
			const focus = !options || !options.preserveFocus;
			if (focus) {
				editor.focus();
			}

			// Progress Done
			this.editorGroupsControl.updateProgress(position, ProgressState.DONE);

			// Emit Change Event (if input changed)
			if (inputChanged) {
				this._onEditorsChanged.fire();
			}

			// Fullfill promise with Editor that is being used
			return editor;

		}, e => {
			this.doHandleSetInputError(e, group, editor, input, options, monitor);
			return null;
		});
	}

	private doHandleSetInputError(e: Error | IMessageWithAction, group: EditorGroup, editor: BaseEditor, input: EditorInput, options: EditorOptions, monitor: ProgressMonitor): void {
		const position = this.stacks.positionOfGroup(group);

		// Stop loading promise if any
		monitor.cancel();

		// Report error only if this was not us restoring previous error state
		if (this.partService.isCreated() && !errors.isPromiseCanceledError(e)) {
			const errorMessage = nls.localize('editorOpenError', "Unable to open '{0}': {1}.", input.getName(), toErrorMessage(e));

			let error: any;
			if (e && (<IMessageWithAction>e).actions && (<IMessageWithAction>e).actions.length) {
				error = errors.create(errorMessage, { actions: (<IMessageWithAction>e).actions }); // Support error actions from thrower
			} else {
				error = errorMessage;
			}

			this.messageService.show(Severity.Error, types.isString(error) ? new Error(error) : error);
		}

		this.editorGroupsControl.updateProgress(position, ProgressState.DONE);

		// Event
		this._onEditorOpenFail.fire(input);

		// Recover by closing the active editor (if the input is still the active one)
		if (group.activeEditor === input) {
			this.doCloseActiveEditor(group);
		}
	}

	public closeEditor(position: Position, input: EditorInput): TPromise<void> {
		const group = this.stacks.groupAt(position);
		if (!group) {
			return TPromise.as<void>(null);
		}

		// Check for dirty and veto
		return this.handleDirty([{ group, editor: input }], true /* ignore if opened in other group */).then(veto => {
			if (veto) {
				return;
			}

			// Do close
			this.doCloseEditor(group, input);
		});
	}

	private doCloseEditor(group: EditorGroup, input: EditorInput, focusNext = this.stacks.isActive(group)): void {

		// Closing the active editor of the group is a bit more work
		if (group.activeEditor && group.activeEditor.matches(input)) {
			this.doCloseActiveEditor(group, focusNext);
		}

		// Closing inactive editor is just a model update
		else {
			this.doCloseInactiveEditor(group, input);
		}
	}

	private doCloseActiveEditor(group: EditorGroup, focusNext = true): void {
		const position = this.stacks.positionOfGroup(group);

		// Update stacks model
		group.closeEditor(group.activeEditor);

		// Close group is this is the last editor in group
		if (group.count === 0) {
			this.doCloseGroup(group, focusNext);
		}

		// Otherwise open next active
		else {
			this.openEditor(group.activeEditor, !focusNext ? EditorOptions.create({ preserveFocus: true }) : null, position).done(null, errors.onUnexpectedError);
		}
	}

	private doCloseInactiveEditor(group: EditorGroup, input: EditorInput): void {

		// Closing inactive editor is just a model update
		group.closeEditor(input);
	}

	private doCloseGroup(group: EditorGroup, focusNext = true): void {
		const position = this.stacks.positionOfGroup(group);

		// Update stacks model
		this.modifyGroups(() => this.stacks.closeGroup(group));

		// Hide Editor if there is one
		const editor = this.visibleEditors[position];
		if (editor) {
			this.doHideEditor(editor, position, true);
		}

		// Emit Change Event
		this._onEditorsChanged.fire();

		// Focus next group if we have an active one left
		const currentActiveGroup = this.stacks.activeGroup;
		if (currentActiveGroup) {
			if (focusNext) {
				this.focusGroup(currentActiveGroup);
			} else {
				this.activateGroup(currentActiveGroup);
			}

			// Explicitly trigger the focus changed handler because the side by side control will not trigger it unless
			// the user is actively changing focus with the mouse from left/top to right/bottom.
			this.onGroupFocusChanged();
		}
	}

	private doHideEditor(editor: BaseEditor, position: Position, layoutAndRochade: boolean): void {

		// Hide in side by side control
		const rochade = this.editorGroupsControl.hide(editor, position, layoutAndRochade);

		// Clear any running Progress
		this.editorGroupsControl.updateProgress(position, ProgressState.STOP);

		// Indicate to Editor
		editor.clearInput();
		editor.setVisible(false);

		// Update text compare editor visible context
		this.updateTextCompareEditorVisible();

		// Clear active editor
		this.visibleEditors[position] = null;

		// Rochade as needed
		this.rochade(rochade);

		// Emit Editor move event
		if (rochade !== Rochade.NONE) {
			this._onEditorsMoved.fire();
		}
	}

	private updateTextCompareEditorVisible(): void {
		this.textCompareEditorVisible.set(this.visibleEditors.some(e => e && e.isVisible() && e.getId() === TEXT_DIFF_EDITOR_ID));
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		let groups = this.stacks.groups.reverse(); // start from the end to prevent layout to happen through rochade

		// Remove position to exclude if we have any
		if (typeof except === 'number') {
			groups = groups.filter(group => this.stacks.positionOfGroup(group) !== except);
		}

		// Check for dirty and veto
		const editorsToClose = arrays.flatten(groups.map(group => group.getEditors().map(editor => { return { group, editor }; })));

		return this.handleDirty(editorsToClose).then(veto => {
			if (veto) {
				return;
			}

			groups.forEach(group => this.doCloseEditors(group));
		});
	}

	public closeEditors(position: Position, filter: { except?: EditorInput, direction?: Direction, unmodifiedOnly?: boolean } = Object.create(null)): TPromise<void> {
		const group = this.stacks.groupAt(position);
		if (!group) {
			return TPromise.as<void>(null);
		}

		let editors = group.getEditors();
		if (filter.unmodifiedOnly) {
			editors = editors.filter(e => !e.isDirty());
		}

		// Check for dirty and veto
		let editorsToClose: EditorInput[];
		if (types.isUndefinedOrNull(filter.direction)) {
			editorsToClose = editors.filter(e => !filter.except || !e.matches(filter.except));
		} else {
			editorsToClose = (filter.direction === Direction.LEFT) ? editors.slice(0, group.indexOf(filter.except)) : editors.slice(group.indexOf(filter.except) + 1);
		}

		return this.handleDirty(editorsToClose.map(editor => { return { group, editor }; }), true /* ignore if opened in other group */).then(veto => {
			if (veto) {
				return;
			}

			this.doCloseEditors(group, filter);
		});
	}

	private doCloseEditors(group: EditorGroup, filter: { except?: EditorInput, direction?: Direction, unmodifiedOnly?: boolean } = Object.create(null)): void {

		// Close all editors if there is no editor to except and
		// we either are not only closing unmodified editors or
		// there are no dirty editors.
		let closeAllEditors = false;
		if (!filter.except) {
			if (!filter.unmodifiedOnly) {
				closeAllEditors = true;
			} else {
				closeAllEditors = !group.getEditors().some(e => e.isDirty());
			}
		}

		// Close all editors in group
		if (closeAllEditors) {

			// Update stacks model: remove all non active editors first to prevent opening the next editor in group
			group.closeEditors(group.activeEditor);

			// Now close active editor in group which will close the group
			this.doCloseActiveEditor(group);
		}

		// Close unmodified editors in group
		else if (filter.unmodifiedOnly) {

			// We can just close all unmodified editors around the currently active dirty one
			if (group.activeEditor.isDirty()) {
				group.getEditors().filter(editor => !editor.isDirty() && !editor.matches(filter.except)).forEach(editor => this.doCloseInactiveEditor(group, editor));
			}

			// Active editor is also a candidate to close, thus we make the first dirty editor
			// active and then close the other ones
			else {
				const firstDirtyEditor = group.getEditors().filter(editor => editor.isDirty())[0];

				this.openEditor(firstDirtyEditor, null, this.stacks.positionOfGroup(group)).done(() => {
					this.doCloseEditors(group, filter);
				}, errors.onUnexpectedError);
			}
		}

		// Close all editors in group except active one
		else if (filter.except && filter.except.matches(group.activeEditor)) {

			// Update stacks model: close non active editors supporting the direction
			group.closeEditors(group.activeEditor, filter.direction);
		}

		// Finally: we are asked to close editors around a non-active editor
		// Thus we make the non-active one active and then close the others
		else {
			this.openEditor(filter.except, null, this.stacks.positionOfGroup(group)).done(() => {

				// since the opening might have failed, we have to check again for the active editor
				// being the expected one, otherwise we end up in an endless loop trying to open the
				// editor
				if (filter.except.matches(group.activeEditor)) {
					this.doCloseEditors(group, filter);
				}
			}, errors.onUnexpectedError);
		}
	}

	private handleDirty(identifiers: EditorIdentifier[], ignoreIfOpenedInOtherGroup?: boolean): TPromise<boolean /* veto */> {
		if (!identifiers.length) {
			return TPromise.as(false); // no veto
		}

		return this.doHandleDirty(identifiers.shift(), ignoreIfOpenedInOtherGroup).then(veto => {
			if (veto) {
				return veto;
			}

			return this.handleDirty(identifiers, ignoreIfOpenedInOtherGroup);
		});
	}

	private doHandleDirty(identifier: EditorIdentifier, ignoreIfOpenedInOtherGroup?: boolean): TPromise<boolean /* veto */> {
		if (!identifier || !identifier.editor || !identifier.editor.isDirty() || (ignoreIfOpenedInOtherGroup && this.countEditors(identifier.editor) > 1 /* allow to close a dirty editor if it is opened in another group */)) {
			return TPromise.as(false); // no veto
		}

		const { editor } = identifier;

		const res = editor.confirmSave();
		switch (res) {
			case ConfirmResult.SAVE:
				return editor.save().then(ok => !ok);

			case ConfirmResult.DONT_SAVE:
				return editor.revert().then(ok => !ok);

			case ConfirmResult.CANCEL:
				return TPromise.as(true); // veto
		}
	}

	private countEditors(editor: EditorInput): number {
		const editors = [editor];
		if (editor instanceof SideBySideEditorInput) {
			editors.push(editor.master);
		}

		return editors.reduce((prev, e) => prev += this.stacks.count(e), 0);
	}

	public getStacksModel(): EditorStacksModel {
		return this.stacks;
	}

	public getActiveEditorInput(): EditorInput {
		const lastActiveEditor = this.getActiveEditor();

		return lastActiveEditor ? lastActiveEditor.input : null;
	}

	public getActiveEditor(): BaseEditor {
		if (!this.editorGroupsControl) {
			return null; // too early
		}

		return this.editorGroupsControl.getActiveEditor();
	}

	public getVisibleEditors(): BaseEditor[] {
		return this.visibleEditors ? this.visibleEditors.filter(editor => !!editor) : [];
	}

	public moveGroup(from: EditorGroup, to: EditorGroup): void;
	public moveGroup(from: Position, to: Position): void;
	public moveGroup(arg1: any, arg2: any): void {
		const fromGroup = (typeof arg1 === 'number') ? this.stacks.groupAt(arg1) : arg1;
		const toGroup = (typeof arg2 === 'number') ? this.stacks.groupAt(arg2) : arg2;

		if (!fromGroup || !toGroup || fromGroup === toGroup) {
			return; // Ignore if we cannot move
		}

		const fromPosition = this.stacks.positionOfGroup(fromGroup);
		const toPosition = this.stacks.positionOfGroup(toGroup);

		// Update stacks model
		this.modifyGroups(() => this.stacks.moveGroup(fromGroup, toPosition));

		// Move widgets
		this.editorGroupsControl.move(fromPosition, toPosition);

		// Move data structures
		arrays.move(this.visibleEditors, fromPosition, toPosition);
		arrays.move(this.editorOpenToken, fromPosition, toPosition);
		arrays.move(this.mapEditorInstantiationPromiseToEditor, fromPosition, toPosition);
		arrays.move(this.instantiatedEditors, fromPosition, toPosition);

		// Restore focus
		this.focusGroup(fromGroup);

		// Events
		this._onEditorsMoved.fire();
	}

	public moveEditor(input: EditorInput, from: EditorGroup, to: EditorGroup, moveOptions?: IMoveOptions): void;
	public moveEditor(input: EditorInput, from: Position, to: Position, moveOptions?: IMoveOptions): void;
	public moveEditor(input: EditorInput, arg2: any, arg3: any, moveOptions?: IMoveOptions): void {
		const fromGroup = (typeof arg2 === 'number') ? this.stacks.groupAt(arg2) : arg2;
		if (!fromGroup) {
			return;
		}

		// Move within group
		if (arg2 === arg3) {
			this.doMoveEditorInsideGroups(input, fromGroup, moveOptions);
		}

		// Move across groups
		else {
			const toPosition = (typeof arg3 === 'number') ? arg3 : this.stacks.positionOfGroup(arg3);

			this.doMoveEditorAcrossGroups(input, fromGroup, toPosition, moveOptions);
		}
	}

	private doMoveEditorInsideGroups(input: EditorInput, group: EditorGroup, moveOptions?: IMoveOptions): void {
		let toIndex = moveOptions && moveOptions.index;

		if (typeof toIndex !== 'number') {
			return; // do nothing if we move into same group without index
		}

		const currentIndex = group.indexOf(input);
		if (currentIndex === toIndex) {
			return; // do nothing if editor is already at the given index
		}

		// Update stacks model
		group.moveEditor(input, toIndex);
		group.pin(input);
	}

	private doMoveEditorAcrossGroups(input: EditorInput, fromGroup: EditorGroup, to: Position, moveOptions?: IMoveOptions): void {
		if (fromGroup.count === 1) {
			const toGroup = this.stacks.groupAt(to);
			if (!toGroup && this.stacks.positionOfGroup(fromGroup) < to) {
				return; // do nothing if the group to move only has one editor and is the last group already
			}
		}

		const index = moveOptions && moveOptions.index;
		const inactive = moveOptions && moveOptions.inactive;
		const preserveFocus = moveOptions && moveOptions.preserveFocus;

		// When moving an editor, try to preserve as much view state as possible by checking
		// for the editor to be a text editor and creating the options accordingly if so
		let options = EditorOptions.create({ pinned: true, index, inactive, preserveFocus });
		const activeEditor = this.getActiveEditor();
		const codeEditor = getCodeEditor(activeEditor);
		if (codeEditor && activeEditor.position === this.stacks.positionOfGroup(fromGroup) && input.matches(activeEditor.input)) {
			options = TextEditorOptions.fromEditor(codeEditor, { pinned: true, index, inactive, preserveFocus });
		}

		// A move to another group is an open first...
		this.openEditor(input, options, to).done(null, errors.onUnexpectedError);

		// and a close afterwards...
		this.doCloseEditor(fromGroup, input, false /* do not activate next one behind if any */);
	}

	public arrangeGroups(arrangement: GroupArrangement): void {
		this.editorGroupsControl.arrangeGroups(arrangement);
	}

	public setGroupOrientation(orientation: GroupOrientation): void {
		this.editorGroupsControl.setGroupOrientation(orientation);
		this._onGroupOrientationChanged.fire();

		// Rename groups when layout changes
		this.renameGroups();
	}

	public getGroupOrientation(): GroupOrientation {
		return this.editorGroupsControl.getGroupOrientation();
	}

	public createContentArea(parent: Builder): Builder {

		// Content Container
		const contentArea = $(parent)
			.div()
			.addClass('content');

		// get settings
		this.memento = this.getMemento(this.storageService, MementoScope.WORKSPACE);

		// Side by Side Control
		const editorPartState: IEditorPartUIState = this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
		this.editorGroupsControl = this.instantiationService.createInstance(EditorGroupsControl, contentArea, editorPartState && editorPartState.groupOrientation);
		this.toUnbind.push(this.editorGroupsControl.onGroupFocusChanged(() => this.onGroupFocusChanged()));

		return contentArea;
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();
		container.style('background-color', this.getColor(editorBackground));

		// Content area
		const content = this.getContentArea();

		const groupCount = this.stacks.groups.length;
		if (groupCount > 1) {
			content.addClass('multiple-groups');
		} else {
			content.removeClass('multiple-groups');
		}

		content.style('background-color', groupCount > 0 ? this.getColor(EDITOR_GROUP_BACKGROUND) : null);
	}

	private onGroupFocusChanged(): void {

		// Update stacks model
		const activePosition = this.editorGroupsControl.getActivePosition();
		if (typeof activePosition === 'number') {
			this.stacks.setActive(this.stacks.groupAt(activePosition));
		}

		// Emit as change event so that clients get aware of new active editor
		const activeEditor = this.editorGroupsControl.getActiveEditor();
		if (activeEditor) {
			this._onEditorsChanged.fire();
		}
	}

	public replaceEditors(editors: { toReplace: EditorInput, replaceWith: EditorInput, options?: EditorOptions }[], position?: Position): TPromise<BaseEditor[]> {
		const activeReplacements: IEditorReplacement[] = [];
		const hiddenReplacements: IEditorReplacement[] = [];

		// Find editors across groups to close
		editors.forEach(editor => {
			if (editor.toReplace.isDirty()) {
				return; // we do not handle dirty in this method, so ignore all dirty
			}

			// For each group
			this.stacks.groups.forEach(group => {
				if (position === void 0 || this.stacks.positionOfGroup(group) === position) {
					const index = group.indexOf(editor.toReplace);
					if (index >= 0) {
						if (editor.options) {
							editor.options.index = index; // make sure we respect the index of the editor to replace!
						} else {
							editor.options = EditorOptions.create({ index });
						}

						const replacement = { group, editor: editor.toReplace, replaceWith: editor.replaceWith, options: editor.options };
						if (group.activeEditor.matches(editor.toReplace)) {
							activeReplacements.push(replacement);
						} else {
							hiddenReplacements.push(replacement);
						}
					}
				}
			});
		});

		// Deal with hidden replacements first
		hiddenReplacements.forEach(replacement => {
			const group = replacement.group;

			group.openEditor(replacement.replaceWith, { active: false, pinned: true, index: replacement.options.index });
			group.closeEditor(replacement.editor);
		});

		// Now deal with active editors to be opened
		const res = this.openEditors(activeReplacements.map(replacement => {
			const group = replacement.group;

			return {
				input: replacement.replaceWith,
				position: this.stacks.positionOfGroup(group),
				options: replacement.options
			};
		}));

		// Close active editors to be replaced now (they are no longer active)
		activeReplacements.forEach(replacement => {
			this.doCloseEditor(replacement.group, replacement.editor, false);
		});

		return res;
	}

	public openEditors(editors: { input: EditorInput, position: Position, options?: EditorOptions }[]): TPromise<BaseEditor[]> {
		if (!editors.length) {
			return TPromise.as<BaseEditor[]>([]);
		}

		let activePosition: Position;
		if (this.stacks.activeGroup) {
			activePosition = this.stacks.positionOfGroup(this.stacks.activeGroup);
		}

		const ratio = this.editorGroupsControl.getRatio();

		return this.doOpenEditors(editors, activePosition, ratio);
	}

	public hasEditorsToRestore(): boolean {
		return this.stacks.groups.some(g => g.count > 0);
	}

	public restoreEditors(): TPromise<BaseEditor[]> {
		const editors = this.stacks.groups.map((group, index) => {
			return {
				input: group.activeEditor,
				position: index,
				options: group.isPinned(group.activeEditor) ? EditorOptions.create({ pinned: true }) : void 0
			};
		});

		if (!editors.length) {
			return TPromise.as<BaseEditor[]>([]);
		}

		let activePosition: Position;
		if (this.stacks.groups.length) {
			activePosition = this.stacks.positionOfGroup(this.stacks.activeGroup);
		}

		const editorState: IEditorPartUIState = this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];

		return this.doOpenEditors(editors, activePosition, editorState && editorState.ratio);
	}

	private doOpenEditors(editors: { input: EditorInput, position: Position, options?: EditorOptions }[], activePosition?: number, ratio?: number[]): TPromise<BaseEditor[]> {
		const positionOneEditors = editors.filter(e => e.position === Position.ONE);
		const positionTwoEditors = editors.filter(e => e.position === Position.TWO);
		const positionThreeEditors = editors.filter(e => e.position === Position.THREE);

		const groupOne = this.stacks.groupAt(Position.ONE);
		const groupTwo = this.stacks.groupAt(Position.TWO);
		const groupThree = this.stacks.groupAt(Position.THREE);

		// Compute the imaginary count if we const all editors open as the way requested
		const oneCount = positionOneEditors.length + (groupOne ? groupOne.count : 0);
		const twoCount = positionTwoEditors.length + (groupTwo ? groupTwo.count : 0);
		const threeCount = positionThreeEditors.length + (groupThree ? groupThree.count : 0);

		// Validate we do not produce empty groups given our imaginary count model
		if ((!oneCount && (twoCount || threeCount) || (!twoCount && threeCount))) {
			positionOneEditors.push(...positionTwoEditors);
			positionOneEditors.push(...positionThreeEditors);
			positionTwoEditors.splice(0, positionTwoEditors.length);
			positionThreeEditors.splice(0, positionThreeEditors.length);
		}

		// Validate active input
		if (typeof activePosition !== 'number') {
			activePosition = Position.ONE;
		}

		// Validate ratios
		const positions = positionThreeEditors.length ? 3 : positionTwoEditors.length ? 2 : 1;
		if (!ratio || ratio.length !== positions) {
			if (!this.getVisibleEditors().length) {
				ratio = (positions === 3) ? [0.33, 0.33, 0.34] : (positions === 2) ? [0.5, 0.5] : [1];
			} else {
				ratio = void 0;
			}
		}

		let focusGroup = false;
		const activeGroup = this.stacks.groupAt(activePosition);
		if (!this.stacks.activeGroup || !activeGroup) {
			focusGroup = true; // always focus group if this is the first group or we are about to open a new group
		} else {
			focusGroup = editors.some(e => !e.options || (!e.options.inactive && !e.options.preserveFocus)); // only focus if the editors to open are not opening as inactive or preserveFocus
		}

		// Open each input respecting the options. Since there can only be one active editor in each
		// position, we have to pick the first input from each position and add the others as inactive
		const promises: TPromise<BaseEditor>[] = [];
		[positionOneEditors.shift(), positionTwoEditors.shift(), positionThreeEditors.shift()].forEach((editor, position) => {
			if (!editor) {
				return; // unused position
			}

			const input = editor.input;

			// Resolve editor options
			const preserveFocus = (activePosition !== position);
			let options: EditorOptions;
			if (editor.options) {
				options = editor.options;
				if (typeof options.preserveFocus !== 'boolean') {
					options.preserveFocus = preserveFocus;
				}
			} else {
				options = EditorOptions.create({ preserveFocus });
			}

			promises.push(this.openEditor(input, options, position, ratio));
		});

		return TPromise.join(promises).then(editors => {

			// Adjust focus as needed
			if (focusGroup) {
				this.focusGroup(activePosition);
			}

			// Update stacks model for remaining inactive editors
			[positionOneEditors, positionTwoEditors, positionThreeEditors].forEach((editors, index) => {
				const group = this.stacks.groupAt(index);
				if (group) {
					editors.forEach(editor => group.openEditor(editor.input, { pinned: true })); // group could be null if one openeditor call failed!
				}
			});

			// Full layout side by side
			this.editorGroupsControl.layout(this.dimension);

			return editors;
		});
	}

	public activateGroup(group: EditorGroup): void;
	public activateGroup(position: Position): void;
	public activateGroup(arg1: any): void {
		const group = (typeof arg1 === 'number') ? this.stacks.groupAt(arg1) : arg1;
		if (group) {

			// Update stacks model
			this.stacks.setActive(group);

			// Update UI
			const editor = this.visibleEditors[this.stacks.positionOfGroup(group)];
			if (editor) {
				this.editorGroupsControl.setActive(editor);
			}
		}
	}

	public focusGroup(group: EditorGroup): void;
	public focusGroup(position: Position): void;
	public focusGroup(arg1: any): void {
		const group = (typeof arg1 === 'number') ? this.stacks.groupAt(arg1) : arg1;
		if (group) {

			// Make active
			this.activateGroup(group);

			// Focus Editor
			const editor = this.visibleEditors[this.stacks.positionOfGroup(group)];
			if (editor) {
				editor.focus();
			}
		}
	}

	public pinEditor(group: EditorGroup, input: EditorInput): void;
	public pinEditor(position: Position, input: EditorInput): void;
	public pinEditor(arg1: any, input: EditorInput): void {
		const group = (typeof arg1 === 'number') ? this.stacks.groupAt(arg1) : arg1;
		if (group) {
			if (group.isPinned(input)) {
				return;
			}

			// Update stacks model
			group.pin(input);
		}
	}

	public unpinEditor(group: EditorGroup, input: EditorInput): void;
	public unpinEditor(position: Position, input: EditorInput): void;
	public unpinEditor(arg1: any, input: EditorInput): void {
		if (input.isDirty()) {
			return; // we do not allow to unpin dirty editors
		}

		const group = (typeof arg1 === 'number') ? this.stacks.groupAt(arg1) : arg1;
		if (group) {
			if (group.isPreview(input)) {
				return;
			}

			// Unpinning an editor closes the preview editor if we have any
			let handlePreviewEditor: TPromise<boolean> = TPromise.as(false);
			if (group.previewEditor) {
				handlePreviewEditor = this.handleDirty([{ group, editor: group.previewEditor }], true /* ignore if opened in other group */);
			}

			handlePreviewEditor.done(veto => {
				if (veto) {
					return;
				}

				// The active editor is the preview editor and we are asked to make
				// another editor the preview editor. So we need to take care of closing
				// the active editor first
				if (group.isPreview(group.activeEditor) && !group.activeEditor.matches(input)) {
					this.doCloseActiveEditor(group);
				}

				// Update stacks model
				group.unpin(input);
			});
		}
	}

	public layout(dimension: Dimension): Dimension[] {

		// Pass to super
		const sizes = super.layout(dimension);

		// Pass to Side by Side Control
		this.dimension = sizes[1];
		this.editorGroupsControl.layout(this.dimension);

		this.onLayoutEmitter.fire(dimension);

		return sizes;
	}

	public shutdown(): void {

		// Persist UI State
		const editorState: IEditorPartUIState = { ratio: this.editorGroupsControl.getRatio(), groupOrientation: this.editorGroupsControl.getGroupOrientation() };
		if (editorState.ratio.length || editorState.groupOrientation !== 'vertical') {
			this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] = editorState;
		} else {
			delete this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
		}

		// Unload all Instantiated Editors
		for (let i = 0; i < this.instantiatedEditors.length; i++) {
			for (let j = 0; j < this.instantiatedEditors[i].length; j++) {
				this.instantiatedEditors[i][j].shutdown();
			}
		}

		// Pass to super
		super.shutdown();
	}

	public dispose(): void {

		// Emitters
		this._onEditorsChanged.dispose();
		this._onEditorsMoved.dispose();
		this._onEditorOpenFail.dispose();

		// Reset Tokens
		this.editorOpenToken = [];
		for (let i = 0; i < POSITIONS.length; i++) {
			this.editorOpenToken[i] = 0;
		}

		// Widgets
		this.editorGroupsControl.dispose();

		// Pass to active editors
		this.visibleEditors.forEach(editor => {
			if (editor) {
				editor.dispose();
			}
		});

		// Pass to instantiated editors
		for (let i = 0; i < this.instantiatedEditors.length; i++) {
			for (let j = 0; j < this.instantiatedEditors[i].length; j++) {
				if (this.visibleEditors.some(editor => editor === this.instantiatedEditors[i][j])) {
					continue;
				}

				this.instantiatedEditors[i][j].dispose();
			}
		}

		this.visibleEditors = null;

		// Pass to super
		super.dispose();
	}

	private findPosition(input: EditorInput, options?: EditorOptions, sideBySide?: boolean, ratio?: number[]): Position;
	private findPosition(input: EditorInput, options?: EditorOptions, desiredPosition?: Position, ratio?: number[]): Position;
	private findPosition(input: EditorInput, options?: EditorOptions, arg1?: any, ratio?: number[]): Position {

		// With defined ratios, always trust the provided position
		if (ratio && types.isNumber(arg1)) {
			return arg1;
		}

		// No editor open
		const visibleEditors = this.getVisibleEditors();
		const activeEditor = this.getActiveEditor();
		if (visibleEditors.length === 0 || !activeEditor) {
			return Position.ONE; // can only be ONE
		}

		// Respect option to reveal an editor if it is already visible
		if (options && options.revealIfVisible) {
			const group = this.stacks.findGroup(input, true);
			if (group) {
				return this.stacks.positionOfGroup(group);
			}
		}

		// Respect option to reveal an editor if it is open (not necessarily visible)
		const skipRevealIfOpen = (options && options.index) || arg1 === true /* open to side */ || typeof arg1 === 'number' /* open specific group */;
		if (!skipRevealIfOpen && (this.revealIfOpen || (options && options.revealIfOpened))) {
			const group = this.stacks.findGroup(input);
			if (group) {
				return this.stacks.positionOfGroup(group);
			}
		}

		// Position is unknown: pick last active or ONE
		if (types.isUndefinedOrNull(arg1) || arg1 === false) {
			const lastActivePosition = this.editorGroupsControl.getActivePosition();

			return lastActivePosition || Position.ONE;
		}

		// Position is sideBySide: Find position relative to active editor
		if (arg1 === true) {
			switch (activeEditor.position) {
				case Position.ONE:
					return Position.TWO;
				case Position.TWO:
					return Position.THREE;
				case Position.THREE:
					return null; // Cannot open to the side of the right/bottom most editor
			}

			return null; // Prevent opening to the side
		}

		// Position is provided, validate it
		if (arg1 === Position.THREE && visibleEditors.length === 1) {
			return Position.TWO;
		}

		return arg1;
	}

	private startDelayedCloseEditorsFromInputDispose(): void {

		// To prevent race conditions, we call the close in a timeout because it can well be
		// that an input is being disposed with the intent to replace it with some other input
		// right after.
		if (this.pendingEditorInputCloseTimeout === null) {
			this.pendingEditorInputCloseTimeout = setTimeout(() => {

				// Split between visible and hidden editors
				const visibleEditors: EditorIdentifier[] = [];
				const hiddenEditors: EditorIdentifier[] = [];
				this.pendingEditorInputsToClose.forEach(identifier => {
					const { group, editor } = identifier;

					if (group.isActive(editor)) {
						visibleEditors.push(identifier);
					} else if (group.contains(editor)) {
						hiddenEditors.push(identifier);
					}
				});

				// Close all hidden first
				hiddenEditors.forEach(hidden => this.doCloseEditor(<EditorGroup>hidden.group, hidden.editor, false));

				// Close visible ones second
				visibleEditors
					.sort((a1, a2) => this.stacks.positionOfGroup(a2.group) - this.stacks.positionOfGroup(a1.group))	// reduce layout work by starting right/bottom first
					.forEach(visible => this.doCloseEditor(<EditorGroup>visible.group, visible.editor, false));

				// Reset
				this.pendingEditorInputCloseTimeout = null;
				this.pendingEditorInputsToClose = [];
			}, 0);
		}
	}

	private rochade(rochade: Rochade): void;
	private rochade(from: Position, to: Position): void;
	private rochade(arg1: any, arg2?: any): void {
		if (types.isUndefinedOrNull(arg2)) {
			const rochade = <Rochade>arg1;
			switch (rochade) {
				case Rochade.TWO_TO_ONE:
					this.rochade(Position.TWO, Position.ONE);
					break;
				case Rochade.THREE_TO_TWO:
					this.rochade(Position.THREE, Position.TWO);
					break;
				case Rochade.TWO_AND_THREE_TO_ONE:
					this.rochade(Position.TWO, Position.ONE);
					this.rochade(Position.THREE, Position.TWO);
			}
		} else {
			const from = <Position>arg1;
			const to = <Position>arg2;

			this.doRochade(this.visibleEditors, from, to, null);
			this.doRochade(this.editorOpenToken, from, to, null);
			this.doRochade(this.mapEditorInstantiationPromiseToEditor, from, to, Object.create(null));
			this.doRochade(this.instantiatedEditors, from, to, []);
		}
	}

	private doRochade(array: any[], from: Position, to: Position, empty: any): void {
		array[to] = array[from];
		array[from] = empty;
	}

	private ensureGroup(position: Position, activate = true): EditorGroup {
		let group = this.stacks.groupAt(position);
		if (!group) {

			// Race condition: it could be that someone quickly opens editors one after
			// the other and we are asked to open an editor in position 2 before position
			// 1 was opened. Therefor we must ensure that all groups are created up to
			// the point where we are asked for.
			this.modifyGroups(() => {
				for (let i = 0; i < position; i++) {
					if (!this.hasGroup(i)) {
						this.stacks.openGroup('', false, i);
					}
				}

				group = this.stacks.openGroup('', activate, position);
			});
		} else {
			this.renameGroups(); // ensure group labels are proper
		}

		if (activate) {
			this.stacks.setActive(group);
		}

		return group;
	}

	private modifyGroups(modification: () => void) {

		// Run the modification
		modification();

		// Adjust group labels as needed
		this.renameGroups();
	}

	private renameGroups(): void {
		const groups = this.stacks.groups;
		if (groups.length > 0) {
			const layoutVertically = (this.editorGroupsControl.getGroupOrientation() !== 'horizontal');

			// ONE | TWO | THREE
			if (groups.length > 2) {
				this.stacks.renameGroup(this.stacks.groupAt(Position.ONE), layoutVertically ? EditorPart.GROUP_LEFT : EditorPart.GROUP_TOP);
				this.stacks.renameGroup(this.stacks.groupAt(Position.TWO), layoutVertically ? EditorPart.GROUP_CENTER : EditorPart.GROUP_MIDDLE);
				this.stacks.renameGroup(this.stacks.groupAt(Position.THREE), layoutVertically ? EditorPart.GROUP_RIGHT : EditorPart.GROUP_BOTTOM);
			}

			// ONE | TWO
			else if (groups.length > 1) {
				this.stacks.renameGroup(this.stacks.groupAt(Position.ONE), layoutVertically ? EditorPart.GROUP_LEFT : EditorPart.GROUP_TOP);
				this.stacks.renameGroup(this.stacks.groupAt(Position.TWO), layoutVertically ? EditorPart.GROUP_RIGHT : EditorPart.GROUP_BOTTOM);
			}

			// ONE
			else {
				this.stacks.renameGroup(this.stacks.groupAt(Position.ONE), layoutVertically ? EditorPart.GROUP_LEFT : EditorPart.GROUP_TOP);
			}
		}
	}

	private hasGroup(position: Position): boolean {
		return !!this.stacks.groupAt(position);
	}
}