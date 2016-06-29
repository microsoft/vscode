/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/editorpart';
import 'vs/workbench/browser/parts/editor/editor.contribution';
import {TPromise} from 'vs/base/common/winjs.base';
import {Registry} from 'vs/platform/platform';
import timer = require('vs/base/common/timer');
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import errors = require('vs/base/common/errors');
import {Scope as MementoScope} from 'vs/workbench/common/memento';
import {Scope} from 'vs/workbench/browser/actionBarRegistry';
import {Part} from 'vs/workbench/browser/part';
import {IEditorRegistry, Extensions as EditorExtensions, BaseEditor, EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, ConfirmResult, EditorInputEvent, IWorkbenchEditorConfiguration} from 'vs/workbench/common/editor';
import {SideBySideEditorControl, Rochade, ISideBySideEditorControl, ProgressState} from 'vs/workbench/browser/parts/editor/sideBySideEditorControl';
import {WorkbenchProgressService} from 'vs/workbench/services/progress/browser/progressService';
import {GroupArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IEditorPart} from 'vs/workbench/services/editor/browser/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, POSITIONS, Direction} from 'vs/platform/editor/common/editor';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IMessageService, IMessageWithAction, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IEditorGroupService} from 'vs/workbench/services/group/common/groupService';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {EditorStacksModel, EditorGroup, EditorIdentifier} from 'vs/workbench/common/editor/editorStacksModel';
import Event, {Emitter} from 'vs/base/common/event';

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
	widthRatio: number[];
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

	public serviceId = IEditorGroupService;

	private static GROUP_LEFT_LABEL = nls.localize('leftGroup', "Left");
	private static GROUP_CENTER_LABEL = nls.localize('centerGroup', "Center");
	private static GROUP_RIGHT_LABEL = nls.localize('rightGroup', "Right");

	private static EDITOR_PART_UI_STATE_STORAGE_KEY = 'editorpart.uiState';

	private dimension: Dimension;
	private sideBySideControl: ISideBySideEditorControl;
	private memento: any;
	private stacks: EditorStacksModel;
	private previewEditors: boolean;

	private _onEditorsChanged: Emitter<void>;
	private _onEditorOpening: Emitter<EditorInputEvent>;
	private _onEditorsMoved: Emitter<void>;
	private _onEditorOpenFail: Emitter<EditorInput>;

	// The following data structures are partitioned into array of Position as provided by Services.POSITION array
	private visibleEditors: BaseEditor[];
	private instantiatedEditors: BaseEditor[][];
	private mapEditorToEditorContainers: { [editorId: string]: Builder; }[];
	private mapEditorInstantiationPromiseToEditor: { [editorId: string]: TPromise<BaseEditor>; }[];
	private editorOpenToken: number[];
	private pendingEditorInputsToClose: EditorIdentifier[];
	private pendingEditorInputCloseTimeout: number;

	constructor(
		id: string,
		@IMessageService private messageService: IMessageService,
		@IEventService private eventService: IEventService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IStorageService private storageService: IStorageService,
		@IPartService private partService: IPartService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id);

		this._onEditorsChanged = new Emitter<void>();
		this._onEditorOpening = new Emitter<EditorInputEvent>();
		this._onEditorsMoved = new Emitter<void>();
		this._onEditorOpenFail = new Emitter<EditorInput>();

		this.visibleEditors = [];

		this.editorOpenToken = arrays.fill(POSITIONS.length, () => 0);

		this.instantiatedEditors = arrays.fill(POSITIONS.length, () => []);

		this.mapEditorToEditorContainers = arrays.fill(POSITIONS.length, () => Object.create(null));
		this.mapEditorInstantiationPromiseToEditor = arrays.fill(POSITIONS.length, () => Object.create(null));

		this.pendingEditorInputsToClose = [];
		this.pendingEditorInputCloseTimeout = null;

		this.stacks = this.instantiationService.createInstance(EditorStacksModel);

		const editorConfig = configurationService.getConfiguration<IWorkbenchEditorConfiguration>().workbench.editor;
		this.previewEditors = editorConfig.enablePreview;

		this.telemetryService.publicLog('workbenchEditorConfiguration', editorConfig);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.stacks.onEditorDirty(identifier => this.onEditorDirty(identifier)));
		this.toUnbind.push(this.stacks.onEditorDisposed(identifier => this.onEditorDisposed(identifier)));
		this.toUnbind.push(this.configurationService.onDidUpdateConfiguration(e => this.onConfigurationUpdated(e.config)));
	}

	private onConfigurationUpdated(configuration: IWorkbenchEditorConfiguration): void {
		const newPreviewEditors = configuration.workbench.editor.enablePreview;

		// Pin all preview editors of the user chose to disable preview
		if (this.previewEditors !== newPreviewEditors && !newPreviewEditors) {
			this.stacks.groups.forEach(group => {
				if (group.previewEditor) {
					this.pinEditor(this.stacks.positionOfGroup(group), group.previewEditor);
				}
			});
		}

		this.previewEditors = newPreviewEditors;
	}

	private onEditorDirty(identifier: EditorIdentifier): void {
		const position = this.stacks.positionOfGroup(identifier.group);

		// we pin every editor that becomes dirty
		this.pinEditor(position, identifier.editor);
	}

	private onEditorDisposed(identifier: EditorIdentifier): void {
		this.pendingEditorInputsToClose.push(identifier);
		this.startDelayedCloseEditorsFromInputDispose();
	}

	public get onEditorsChanged(): Event<void> {
		return this._onEditorsChanged.event;
	}

	public get onEditorOpening(): Event<EditorInputEvent> {
		return this._onEditorOpening.event;
	}

	public get onEditorsMoved(): Event<void> {
		return this._onEditorsMoved.event;
	}

	public get onEditorOpenFail(): Event<EditorInput> {
		return this._onEditorOpenFail.event;
	}

	public openEditor(input: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	public openEditor(input: EditorInput, options?: EditorOptions, position?: Position, widthRatios?: number[]): TPromise<BaseEditor>;
	public openEditor(input: EditorInput, options?: EditorOptions, arg3?: any, widthRatios?: number[]): TPromise<BaseEditor> {

		// Normalize some values
		if (!options) { options = null; }

		// Determine position to open editor in (left, center, right)
		const position = this.validatePosition(arg3, widthRatios);

		// Some conditions under which we prevent the request
		if (
			!input ||																		// no input
			position === null ||															// invalid position
			Object.keys(this.mapEditorInstantiationPromiseToEditor[position]).length > 0 ||	// pending editor load
			this.sideBySideControl.isDragging()												// pending editor DND
		) {
			return TPromise.as<BaseEditor>(null);
		}

		// Emit early open event to allow for veto
		let event = new EditorInputEvent(input);
		this._onEditorOpening.fire(event);
		if (event.isPrevented()) {
			return TPromise.as<BaseEditor>(null);
		}

		// We need an editor descriptor for the input
		let descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(input);
		if (!descriptor) {
			return TPromise.wrapError(new Error(strings.format('Can not find a registered editor for the input {0}', input)));
		}

		// Opened to the side
		if (position !== Position.LEFT) {
			this.telemetryService.publicLog('workbenchSideEditorOpened', { position: position });
		}

		// Open through UI
		return this.doOpenEditor(position, descriptor, input, options, widthRatios);
	}

	private doOpenEditor(position: Position, descriptor: EditorDescriptor, input: EditorInput, options: EditorOptions, widthRatios: number[]): TPromise<BaseEditor> {

		// Update stacks: We do this early on before the UI is there because we want our stacks model to have
		// a consistent view of the editor world and updating it later async after the UI is there will cause
		// issues (e.g. when a closeEditor call is made that expects the openEditor call to have updated the
		// stacks model).
		// This can however cause a race condition where the stacks model indicates the opened editor is there
		// while the UI is not yet ready. Clients have to deal with this fact and we have to make sure that the
		// stacks model gets updated if any of the UI updating fails with an error.
		const group = this.ensureGroup(position, !options || !options.preserveFocus);
		const pinned = !this.previewEditors || (options && (options.pinned || typeof options.index === 'number')) || input.isDirty();
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
			let position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			if (editorOpenToken === this.editorOpenToken[position]) {
				this.sideBySideControl.updateProgress(position, ProgressState.INFINITE);
			}
		}));

		// Show editor
		return this.doShowEditor(group, descriptor, input, options, widthRatios, monitor).then(editor => {
			if (!editor) {
				return TPromise.as<BaseEditor>(null); // canceled or other error
			}

			// Set input to editor
			return this.doSetInput(group, editor, input, options, monitor);
		});
	}

	private doShowEditor(group: EditorGroup, descriptor: EditorDescriptor, input: EditorInput, options: EditorOptions, widthRatios: number[], monitor: ProgressMonitor): TPromise<BaseEditor> {
		let position = this.stacks.positionOfGroup(group);
		const editorAtPosition = this.visibleEditors[position];

		// Return early if the currently visible editor can handle the input
		if (editorAtPosition && descriptor.describes(editorAtPosition)) {
			return TPromise.as(editorAtPosition);
		}

		// Hide active one first
		if (editorAtPosition) {
			this.doHideEditor(position, false);
		}

		// Create Editor
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Creating Editor: {0}', descriptor.getName()));
		return this.doCreateEditor(group, descriptor, monitor).then(editor => {
			let position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			// Make sure that the user meanwhile did not open another editor or something went wrong
			if (!editor || !this.visibleEditors[position] || editor.getId() !== this.visibleEditors[position].getId()) {
				timerEvent.stop();
				monitor.cancel();

				return null;
			}

			// Show in side by side control
			this.sideBySideControl.show(editor, this.mapEditorToEditorContainers[position][descriptor.getId()], position, options && options.preserveFocus, widthRatios);

			// Indicate to editor that it is now visible
			editor.setVisible(true, position);

			// Make sure the editor is layed out
			this.sideBySideControl.layout(position);

			timerEvent.stop();

			return editor;

		}, (e: any) => this.messageService.show(Severity.Error, types.isString(e) ? new Error(e) : e));
	}

	private doCreateEditor(group: EditorGroup, descriptor: EditorDescriptor, monitor: ProgressMonitor): TPromise<BaseEditor> {
		let position = this.stacks.positionOfGroup(group);

		// We need the container for this editor now
		let editorContainer = this.mapEditorToEditorContainers[position][descriptor.getId()];
		let newlyCreatedEditorContainerBuilder: Builder;
		if (!editorContainer) {

			// Build Container off-DOM
			editorContainer = $().div({
				'class': 'editor-container',
				'role': 'tabpanel',
				id: descriptor.getId()
			}, (div) => {
				newlyCreatedEditorContainerBuilder = div;
			});

			// Remember editor container
			this.mapEditorToEditorContainers[position][descriptor.getId()] = editorContainer;
		}

		// Instantiate editor
		return this.doInstantiateEditor(group, descriptor).then(editor => {
			let position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			// Make sure that the user meanwhile did not open another editor
			if (monitor.token !== this.editorOpenToken[position]) {
				monitor.cancel();

				return null;
			}

			// Remember Editor at position
			this.visibleEditors[position] = editor;

			// Create editor as needed
			if (newlyCreatedEditorContainerBuilder) {
				editor.create(newlyCreatedEditorContainerBuilder);
			}

			return editor;
		});
	}

	private doInstantiateEditor(group: EditorGroup, descriptor: EditorDescriptor): TPromise<BaseEditor> {
		let position = this.stacks.positionOfGroup(group);

		// Return early if already instantiated
		let instantiatedEditor = this.instantiatedEditors[position].filter(e => descriptor.describes(e))[0];
		if (instantiatedEditor) {
			return TPromise.as(instantiatedEditor);
		}

		// Return early if editor is being instantiated at the same time from a previous call
		let pendingEditorInstantiate = this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()];
		if (pendingEditorInstantiate) {
			return pendingEditorInstantiate;
		}

		// Otherwise instantiate
		let progressService = new WorkbenchProgressService(this.eventService, this.sideBySideControl.getProgressBar(position), descriptor.getId(), true);
		let editorInstantiationService = this.sideBySideControl.getInstantiationService(position).createChild(new ServiceCollection([IProgressService, progressService]));
		let loaded = false;

		const onInstantiate = (arg: BaseEditor | Error): TPromise<BaseEditor | Error> => {
			let position = this.stacks.positionOfGroup(group); // might have changed due to a rochade meanwhile

			loaded = true;
			delete this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()];

			if (arg instanceof BaseEditor) {
				this.instantiatedEditors[position].push(arg);

				return TPromise.as(arg);
			}

			return TPromise.wrapError(arg);
		};

		let instantiateEditorPromise = editorInstantiationService.createInstance(descriptor).then(onInstantiate, onInstantiate);

		if (!loaded) {
			this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()] = instantiateEditorPromise;
		}

		return instantiateEditorPromise;
	}

	private doSetInput(group: EditorGroup, editor: BaseEditor, input: EditorInput, options: EditorOptions, monitor: ProgressMonitor): TPromise<BaseEditor> {

		// Emit Input-Changed Event as appropiate
		const previousInput = editor.getInput();
		const inputChanged = (!previousInput || !previousInput.matches(input) || (options && options.forceOpen));

		// Call into Editor
		const timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Set Editor Input: {0}', input.getName()));
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
			this.sideBySideControl.updateProgress(position, ProgressState.DONE);

			// Emit Change Event (if input changed)
			if (inputChanged) {
				this._onEditorsChanged.fire();
			}

			timerEvent.stop();

			// Fullfill promise with Editor that is being used
			return editor;

		}, (e: any) => this.doHandleSetInputError(e, group, editor, input, options, monitor));
	}

	private doHandleSetInputError(e: Error | IMessageWithAction, group: EditorGroup, editor: BaseEditor, input: EditorInput, options: EditorOptions, monitor: ProgressMonitor): void {
		const position = this.stacks.positionOfGroup(group);

		// Stop loading promise if any
		monitor.cancel();

		// Report error only if this was not us restoring previous error state
		if (this.partService.isCreated() && !errors.isPromiseCanceledError(e)) {
			let errorMessage = nls.localize('editorOpenError', "Unable to open '{0}': {1}.", input.getName(), errors.toErrorMessage(e));

			let error: any;
			if (e && (<IMessageWithAction>e).actions && (<IMessageWithAction>e).actions.length) {
				error = errors.create(errorMessage, { actions: (<IMessageWithAction>e).actions }); // Support error actions from thrower
			} else {
				error = errorMessage;
			}

			this.messageService.show(Severity.Error, types.isString(error) ? new Error(error) : error);
		}

		this.sideBySideControl.updateProgress(position, ProgressState.DONE);

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
		return this.handleDirty([{ group, editor: input }]).then(veto => {
			if (veto) {
				return;
			}

			// Do close
			this.doCloseEditor(group, input);
		});
	}

	private doCloseEditor(group: EditorGroup, input: EditorInput, focusNext?: boolean): void {

		// Only focus next if the group is the active one
		if (!(typeof focusNext === 'boolean')) {
			focusNext = this.stacks.isActive(group);
		}

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
			this.doCloseGroup(group);
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

	private doCloseGroup(group: EditorGroup): void {
		const position = this.stacks.positionOfGroup(group);

		// Update stacks model
		this.modifyGroups(() => this.stacks.closeGroup(group));

		// Hide Editor
		this.doHideEditor(position, true);

		// Emit Change Event
		this._onEditorsChanged.fire();

		// Focus next group if we have an active one left
		const currentActiveGroup = this.stacks.activeGroup;
		if (currentActiveGroup) {
			this.focusGroup(this.stacks.positionOfGroup(currentActiveGroup));

			// Explicitly trigger the focus changed handler because the side by side control will not trigger it unless
			// the user is actively changing focus with the mouse from left to right.
			this.onGroupFocusChanged();
		}
	}

	private doHideEditor(position: Position, layoutAndRochade: boolean): void {
		let editor = this.visibleEditors[position];
		let editorContainer = this.mapEditorToEditorContainers[position][editor.getId()];

		// Hide in side by side control
		let rochade = this.sideBySideControl.hide(editor, editorContainer, position, layoutAndRochade);

		// Clear any running Progress
		this.sideBySideControl.updateProgress(position, ProgressState.STOP);

		// Indicate to Editor
		editor.clearInput();
		editor.setVisible(false);

		// Clear active editor
		this.visibleEditors[position] = null;

		// Rochade as needed
		this.rochade(rochade);

		// Emit Editor move event
		if (rochade !== Rochade.NONE) {
			this._onEditorsMoved.fire();
		}
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		let groups = this.stacks.groups.reverse(); // start from the end to prevent layout to happen through rochade

		// Remove position to exclude if we have any
		if (typeof except === 'number') {
			groups = groups.filter(group => this.stacks.positionOfGroup(group) !== except);
		}

		// Check for dirty and veto
		let editorsToClose = arrays.flatten(groups.map(group => group.getEditors().map(editor => { return { group, editor }; })));

		return this.handleDirty(editorsToClose).then(veto => {
			if (veto) {
				return;
			}

			groups.forEach(group => this.doCloseEditors(group));
		});
	}

	public closeEditors(position: Position, except?: EditorInput, direction?: Direction): TPromise<void> {
		const group = this.stacks.groupAt(position);
		if (!group) {
			return TPromise.as<void>(null);
		}

		// Check for dirty and veto
		let editorsToClose: EditorInput[];
		if (!direction) {
			editorsToClose = group.getEditors().filter(e => !except || !e.matches(except));
		} else {
			editorsToClose = (direction === Direction.LEFT) ? group.getEditors().slice(0, group.indexOf(except)) : group.getEditors().slice(group.indexOf(except) + 1);
		}

		return this.handleDirty(editorsToClose.map(editor => { return { group, editor }; })).then(veto => {
			if (veto) {
				return;
			}

			this.doCloseEditors(group, except, direction);
		});
	}

	private doCloseEditors(group: EditorGroup, except?: EditorInput, direction?: Direction): void {

		// Close all editors in group
		if (!except) {

			// Update stacks model: remove all non active editors first to prevent opening the next editor in group
			group.closeEditors(group.activeEditor);

			// Now close active editor in group which will close the group
			this.doCloseActiveEditor(group);
		}

		// Close all editors in group except active one
		else if (except.matches(group.activeEditor)) {

			// Update stacks model: close non active editors supporting the direction
			group.closeEditors(group.activeEditor, direction);
		}

		// Finally: we are asked to close editors around a non-active editor
		// Thus we make the non-active one active and then close the others
		else {
			this.openEditor(except, null, this.stacks.positionOfGroup(group)).done(() => {
				this.doCloseEditors(group, except, direction);
			}, errors.onUnexpectedError);
		}
	}

	private handleDirty(identifiers: EditorIdentifier[]): TPromise<boolean /* veto */> {
		if (!identifiers.length) {
			return TPromise.as(false); // no veto
		}

		return this.doHandleDirty(identifiers.shift()).then(veto => {
			if (veto) {
				return veto;
			}

			return this.handleDirty(identifiers);
		});
	}

	private doHandleDirty(identifier: EditorIdentifier): TPromise<boolean /* veto */> {
		if (!identifier || !identifier.editor || !identifier.editor.isDirty()) {
			return TPromise.as(false); // no veto
		}

		const {editor} = identifier;

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

	public getStacksModel(): EditorStacksModel {
		return this.stacks;
	}

	public getActiveEditorInput(): EditorInput {
		let lastActiveEditor = this.getActiveEditor();

		return lastActiveEditor ? lastActiveEditor.input : null;
	}

	public getActiveEditor(): BaseEditor {
		if (!this.sideBySideControl) {
			return null; // too early
		}

		return this.sideBySideControl.getActiveEditor();
	}

	public getVisibleEditors(): BaseEditor[] {
		return this.visibleEditors ? this.visibleEditors.filter((editor) => !!editor) : [];
	}

	public moveGroup(from: Position, to: Position): void {
		const fromGroup = this.stacks.groupAt(from);
		const toGroup = this.stacks.groupAt(to);

		if (!fromGroup || !toGroup || from === to) {
			return; // Ignore if we cannot move
		}

		// Update stacks model
		this.modifyGroups(() => this.stacks.moveGroup(fromGroup, to));

		// Move widgets
		this.sideBySideControl.move(from, to);

		// Move data structures
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.editorOpenToken, from, to);
		arrays.move(this.mapEditorInstantiationPromiseToEditor, from, to);
		arrays.move(this.instantiatedEditors, from, to);
		arrays.move(this.mapEditorToEditorContainers, from, to);

		// Restore focus
		this.focusGroup(this.stacks.positionOfGroup(fromGroup));

		// Events
		this._onEditorsMoved.fire();
	}

	public moveEditor(input: EditorInput, from: Position, to: Position, index?: number): void {
		const fromGroup = this.stacks.groupAt(from);
		const toGroup = this.stacks.groupAt(to);

		if (!fromGroup || !toGroup) {
			return;
		}

		// Move within group
		if (from === to) {
			this.doMoveEditorInsideGroups(input, fromGroup, index);
		}

		// Move across groups
		else {
			this.doMoveEditorAcrossGroups(input, fromGroup, toGroup, index);
		}
	}

	private doMoveEditorInsideGroups(input: EditorInput, group: EditorGroup, toIndex: number): void {
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

	private doMoveEditorAcrossGroups(input: EditorInput, from: EditorGroup, to: EditorGroup, index?: number): void {

		// A move to another group is an open first...
		this.openEditor(input, EditorOptions.create({ pinned: true, index }), this.stacks.positionOfGroup(to)).done(null, errors.onUnexpectedError);

		// and a close afterwards...
		this.doCloseEditor(from, input, false /* do not activate next one behind if any */);
	}

	public arrangeGroups(arrangement: GroupArrangement): void {
		this.sideBySideControl.arrangeGroups(arrangement);
	}

	public createContentArea(parent: Builder): Builder {

		// Content Container
		let contentArea = $(parent)
			.div()
			.addClass('content');

		// Side by Side Control
		this.sideBySideControl = this.instantiationService.createInstance(SideBySideEditorControl, contentArea);

		this.toUnbind.push(this.sideBySideControl.onGroupFocusChanged(() => this.onGroupFocusChanged()));

		// get settings
		this.memento = this.getMemento(this.storageService, MementoScope.WORKSPACE);

		return contentArea;
	}

	private onGroupFocusChanged(): void {

		// Update stacks model
		let activePosition = this.sideBySideControl.getActivePosition();
		if (typeof activePosition === 'number') {
			this.stacks.setActive(this.stacks.groupAt(activePosition));
		}

		// Emit as change event so that clients get aware of new active editor
		let activeEditor = this.sideBySideControl.getActiveEditor();
		if (activeEditor) {
			this._onEditorsChanged.fire();
		}
	}

	public replaceEditors(editors: { toReplace: EditorInput, replaceWith: EditorInput, options?: EditorOptions }[]): TPromise<BaseEditor[]> {
		const activeReplacements: IEditorReplacement[] = [];
		const hiddenReplacements: IEditorReplacement[] = [];

		// Find editors across groups to close
		editors.forEach(editor => {
			if (editor.toReplace.isDirty()) {
				return; // we do not handle dirty in this method, so ignore all dirty
			}

			// For each group
			this.stacks.groups.forEach(group => {
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

		const widthRatios = this.sideBySideControl.getWidthRatios();

		return this.doOpenEditors(editors, activePosition, widthRatios);
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

		let editorState: IEditorPartUIState = this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];

		return this.doOpenEditors(editors, activePosition, editorState && editorState.widthRatio);
	}

	private doOpenEditors(editors: { input: EditorInput, position: Position, options?: EditorOptions }[], activePosition?: number, widthRatios?: number[]): TPromise<BaseEditor[]> {
		const leftEditors = editors.filter(e => e.position === Position.LEFT);
		const centerEditors = editors.filter(e => e.position === Position.CENTER);
		const rightEditors = editors.filter(e => e.position === Position.RIGHT);

		const leftGroup = this.stacks.groupAt(Position.LEFT);
		const centerGroup = this.stacks.groupAt(Position.CENTER);
		const rightGroup = this.stacks.groupAt(Position.RIGHT);

		// Compute the imaginary count if we let all editors open as the way requested
		const leftCount = leftEditors.length + (leftGroup ? leftGroup.count : 0);
		const centerCount = centerEditors.length + (centerGroup ? centerGroup.count : 0);
		const rightCount = rightEditors.length + (rightGroup ? rightGroup.count : 0);

		// Validate we do not produce empty groups given our imaginary count model
		if ((!leftCount && (centerCount || rightCount) || (!centerCount && rightCount))) {
			leftEditors.push(...centerEditors);
			leftEditors.push(...rightEditors);
			centerEditors.splice(0, centerEditors.length);
			rightEditors.splice(0, rightEditors.length);
		}

		// Validate active input
		if (typeof activePosition !== 'number') {
			activePosition = Position.LEFT;
		}

		// Validate width ratios
		const positions = rightEditors.length ? 3 : centerEditors.length ? 2 : 1;
		if (!widthRatios || widthRatios.length !== positions) {
			if (!this.getVisibleEditors().length) {
				widthRatios = (positions === 3) ? [0.33, 0.33, 0.34] : (positions === 2) ? [0.5, 0.5] : [1];
			} else {
				widthRatios = void 0;
			}
		}

		// Open each input respecting the options. Since there can only be one active editor in each
		// position, we have to pick the first input from each position and add the others as inactive
		let promises: TPromise<BaseEditor>[] = [];
		[leftEditors.shift(), centerEditors.shift(), rightEditors.shift()].forEach((editor, position) => {
			if (!editor) {
				return; // unused position
			}

			const input = editor.input;

			// Resolve editor options
			const preserveFocus = activePosition !== position;
			let options: EditorOptions;
			if (editor.options) {
				options = editor.options;
				options.preserveFocus = preserveFocus;
			} else {
				options = EditorOptions.create({ preserveFocus: preserveFocus });
			}

			promises.push(this.openEditor(input, options, position, widthRatios));
		});

		return TPromise.join(promises).then(editors => {

			// Ensure active position
			this.focusGroup(activePosition);

			// Update stacks model for remaining inactive editors
			[leftEditors, centerEditors, rightEditors].forEach((editors, index) => {
				const group = this.stacks.groupAt(index);
				if (group) {
					editors.forEach(editor => group.openEditor(editor.input, { pinned: true })); // group could be null if one openeditor call failed!
				}
			});

			// Full layout side by side
			this.sideBySideControl.layout(this.dimension);

			return editors;
		});
	}

	public activateGroup(position: Position): void {
		const group = this.stacks.groupAt(position);
		if (group) {

			// Update stacks model
			this.stacks.setActive(group);

			// Update UI
			const editor = this.visibleEditors[position];
			if (editor) {
				this.sideBySideControl.setActive(editor);
			}
		}
	}

	public focusGroup(position: Position): void {
		const group = this.stacks.groupAt(position);
		if (group) {

			// Make active
			this.activateGroup(position);

			// Focus Editor
			const editor = this.visibleEditors[position];
			if (editor) {
				editor.focus();
			}
		}
	}

	public pinEditor(position: Position, input: EditorInput): void {
		const group = this.stacks.groupAt(position);
		if (group) {
			if (group.isPinned(input)) {
				return;
			}

			// Update stacks model
			group.pin(input);
		}
	}

	public unpinEditor(position: Position, input: EditorInput): void {
		if (input.isDirty()) {
			return; // we do not allow to unpin dirty editors
		}

		const group = this.stacks.groupAt(position);
		if (group) {
			if (group.isPreview(input)) {
				return;
			}

			// Unpinning an editor closes the preview editor if we have any
			let handlePreviewEditor: TPromise<boolean> = TPromise.as(false);
			if (group.previewEditor) {
				handlePreviewEditor = this.handleDirty([{ group, editor: group.previewEditor }]);
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
		let sizes = super.layout(dimension);

		// Pass to Side by Side Control
		this.dimension = sizes[1];
		this.sideBySideControl.layout(this.dimension);

		return sizes;
	}

	public shutdown(): void {

		// Persist UI State
		let editorState: IEditorPartUIState = { widthRatio: this.sideBySideControl.getWidthRatios() };
		this.memento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] = editorState;

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
		this.mapEditorToEditorContainers = null;

		// Emitters
		this._onEditorsChanged.dispose();
		this._onEditorOpening.dispose();
		this._onEditorsMoved.dispose();
		this._onEditorOpenFail.dispose();

		// Reset Tokens
		this.editorOpenToken = [];
		for (let i = 0; i < POSITIONS.length; i++) {
			this.editorOpenToken[i] = 0;
		}

		// Widgets
		this.sideBySideControl.dispose();

		// Pass to active editors
		this.visibleEditors.forEach((editor) => {
			if (editor) {
				editor.dispose();
			}
		});

		// Pass to instantiated editors
		for (var i = 0; i < this.instantiatedEditors.length; i++) {
			for (var j = 0; j < this.instantiatedEditors[i].length; j++) {
				if (this.visibleEditors.some((editor) => editor === this.instantiatedEditors[i][j])) {
					continue;
				}

				this.instantiatedEditors[i][j].dispose();
			}
		}

		this.visibleEditors = null;

		// Pass to super
		super.dispose();
	}

	private validatePosition(sideBySide?: boolean, widthRatios?: number[]): Position;
	private validatePosition(desiredPosition?: Position, widthRatios?: number[]): Position;
	private validatePosition(arg1?: any, widthRatios?: number[]): Position {

		// With defined width ratios, always trust the provided position
		if (widthRatios && types.isNumber(arg1)) {
			return arg1;
		}

		// No editor open
		let visibleEditors = this.getVisibleEditors();
		let activeEditor = this.getActiveEditor();
		if (visibleEditors.length === 0 || !activeEditor) {
			return Position.LEFT; // can only be LEFT
		}

		// Position is unknown: pick last active or LEFT
		if (types.isUndefinedOrNull(arg1) || arg1 === false) {
			let lastActivePosition = this.sideBySideControl.getActivePosition();

			return lastActivePosition || Position.LEFT;
		}

		// Position is sideBySide: Find position relative to active editor
		if (arg1 === true) {
			switch (activeEditor.position) {
				case Position.LEFT:
					return Position.CENTER;
				case Position.CENTER:
					return Position.RIGHT;
				case Position.RIGHT:
					return null; // Cannot open to the side of the right most editor
			}

			return null; // Prevent opening to the side
		}

		// Position is provided, validate it
		if (arg1 === Position.RIGHT && visibleEditors.length === 1) {
			return Position.CENTER;
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
					const {group, editor} = identifier;

					if (group.isActive(editor)) {
						visibleEditors.push(identifier);
					} else if (group.contains(editor)) {
						hiddenEditors.push(identifier);
					}
				});

				// Close all hidden first
				hiddenEditors.forEach(hidden => this.doCloseEditor(<EditorGroup>hidden.group, hidden.editor));

				// Close visible ones second
				visibleEditors
					.sort((a1, a2) => this.stacks.positionOfGroup(a2.group) - this.stacks.positionOfGroup(a1.group))	// reduce layout work by starting right first
					.forEach(visible => this.doCloseEditor(<EditorGroup>visible.group, visible.editor));

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
			let rochade = <Rochade>arg1;
			switch (rochade) {
				case Rochade.CENTER_TO_LEFT:
					this.rochade(Position.CENTER, Position.LEFT);
					break;
				case Rochade.RIGHT_TO_CENTER:
					this.rochade(Position.RIGHT, Position.CENTER);
					break;
				case Rochade.CENTER_AND_RIGHT_TO_LEFT:
					this.rochade(Position.CENTER, Position.LEFT);
					this.rochade(Position.RIGHT, Position.CENTER);
			}
		} else {
			let from = <Position>arg1;
			let to = <Position>arg2;

			this.doRochade(this.visibleEditors, from, to, null);
			this.doRochade(this.editorOpenToken, from, to, null);
			this.doRochade(this.mapEditorInstantiationPromiseToEditor, from, to, Object.create(null));
			this.doRochade(this.instantiatedEditors, from, to, []);
			this.doRochade(this.mapEditorToEditorContainers, from, to, Object.create(null));
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

			// LEFT | CENTER | RIGHT
			if (groups.length > 2) {
				this.stacks.renameGroup(this.stacks.groupAt(Position.LEFT), EditorPart.GROUP_LEFT_LABEL);
				this.stacks.renameGroup(this.stacks.groupAt(Position.CENTER), EditorPart.GROUP_CENTER_LABEL);
				this.stacks.renameGroup(this.stacks.groupAt(Position.RIGHT), EditorPart.GROUP_RIGHT_LABEL);
			}

			// LEFT | RIGHT
			else if (groups.length > 1) {
				this.stacks.renameGroup(this.stacks.groupAt(Position.LEFT), EditorPart.GROUP_LEFT_LABEL);
				this.stacks.renameGroup(this.stacks.groupAt(Position.CENTER), EditorPart.GROUP_RIGHT_LABEL);
			}

			// LEFT
			else {
				this.stacks.renameGroup(this.stacks.groupAt(Position.LEFT), EditorPart.GROUP_LEFT_LABEL);
			}
		}
	}

	private hasGroup(position: Position): boolean {
		return !!this.stacks.groupAt(position);
	}
}