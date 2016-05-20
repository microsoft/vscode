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
import {EventType} from 'vs/base/common/events';
import {Dimension, Builder, $} from 'vs/base/browser/builder';
import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import {IEditorViewState, IEditor} from 'vs/editor/common/editorCommon';
import errors = require('vs/base/common/errors');
import {Scope as MementoScope} from 'vs/workbench/common/memento';
import {Scope} from 'vs/workbench/browser/actionBarRegistry';
import {Part} from 'vs/workbench/browser/part';
import {EventType as WorkbenchEventType, EditorInputEvent, EditorEvent} from 'vs/workbench/common/events';
import {IEditorRegistry, Extensions as EditorExtensions, BaseEditor, EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, TextEditorOptions, ConfirmResult} from 'vs/workbench/common/editor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {SideBySideEditorControl, Rochade, ISideBySideEditorControl, ProgressState, ITitleAreaState} from 'vs/workbench/browser/parts/editor/sideBySideEditorControl';
import {WorkbenchProgressService} from 'vs/workbench/services/progress/browser/progressService';
import {GroupArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IEditorPart} from 'vs/workbench/services/editor/browser/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, POSITIONS, Direction} from 'vs/platform/editor/common/editor';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {IMessageService, IMessageWithAction, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IProgressService} from 'vs/platform/progress/common/progress';
import {EditorStacksModel, EditorGroup, IEditorIdentifier} from 'vs/workbench/common/editor/editorStacksModel';

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

/**
 * The editor part is the container for editors in the workbench. Based on the editor input being opened, it asks the registered
 * editor for the given input to show the contents. The editor part supports up to 3 side-by-side editors.
 */
export class EditorPart extends Part implements IEditorPart {

	private static GROUP_LEFT_LABEL = nls.localize('leftGroup', "Left");
	private static GROUP_CENTER_LABEL = nls.localize('centerGroup', "Center");
	private static GROUP_RIGHT_LABEL = nls.localize('rightGroup', "Right");

	private static EDITOR_PART_UI_STATE_STORAGE_KEY = 'editorpart.uiState';

	private dimension: Dimension;
	private sideBySideControl: ISideBySideEditorControl;
	private memento: any;
	private stacks: EditorStacksModel;

	// The following data structures are partitioned into array of Position as provided by Services.POSITION array
	private visibleInputs: EditorInput[];
	private visibleEditors: BaseEditor[];
	private visibleEditorListeners: Function[][];
	private instantiatedEditors: BaseEditor[][];
	private mapEditorToEditorContainers: { [editorId: string]: Builder; }[];
	private mapEditorInstantiationPromiseToEditor: { [editorId: string]: TPromise<BaseEditor>; }[];
	private mapEditorCreationPromiseToEditor: { [editorId: string]: TPromise<BaseEditor>; }[];
	private editorOpenToken: number[];
	private editorSetInputErrorCounter: number[];
	private pendingEditorInputsToClose: IEditorIdentifier[];
	private pendingEditorInputCloseTimeout: number;

	constructor(
		id: string,
		@IMessageService private messageService: IMessageService,
		@IEventService private eventService: IEventService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IStorageService private storageService: IStorageService,
		@IPartService private partService: IPartService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id);

		this.visibleInputs = [];
		this.visibleEditors = [];

		this.editorOpenToken = arrays.fill(POSITIONS.length, () => 0);
		this.editorSetInputErrorCounter = arrays.fill(POSITIONS.length, () => 0);

		this.visibleEditorListeners = arrays.fill(POSITIONS.length, () => []);
		this.instantiatedEditors = arrays.fill(POSITIONS.length, () => []);

		this.mapEditorToEditorContainers = arrays.fill(POSITIONS.length, () => Object.create(null));
		this.mapEditorInstantiationPromiseToEditor = arrays.fill(POSITIONS.length, () => Object.create(null));
		this.mapEditorCreationPromiseToEditor = arrays.fill(POSITIONS.length, () => Object.create(null));

		this.pendingEditorInputsToClose = [];
		this.pendingEditorInputCloseTimeout = null;

		this.stacks = this.instantiationService.createInstance(EditorStacksModel);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toUnbind.push(this.eventService.addListener(WorkbenchEventType.EDITOR_INPUT_DIRTY_STATE_CHANGED, (event: EditorInputEvent) => this.onEditorInputDirtyStateChanged(event)));

		const unbind = this.stacks.onEditorDisposed(editor => this.onEditorDisposed(editor));
		this.toUnbind.push(() => unbind.dispose());
	}

	private onEditorInputDirtyStateChanged(event: EditorInputEvent): void {
		if (this.sideBySideControl) {
			this.sideBySideControl.updateTitleArea(event.editorInput);
		}
	}

	private onEditorDisposed(identifier: IEditorIdentifier): void {
		this.pendingEditorInputsToClose.push(identifier);
		this.startDelayedCloseEditorsFromInputDispose();
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
			Object.keys(this.mapEditorCreationPromiseToEditor[position]).length > 0 ||		// pending editor create
			this.sideBySideControl.isDragging()												// pending editor DND
		) {
			return TPromise.as<BaseEditor>(null);
		}

		// Emit early open event to allow for veto
		let event = new EditorEvent(null, null, input, options, position);
		this.emit(WorkbenchEventType.EDITOR_INPUT_OPENING, event);
		if (event.isPrevented()) {
			return TPromise.as<BaseEditor>(null);
		}

		// Remember as visible input for this position
		this.visibleInputs[position] = input;

		// Open: input is provided
		return this.doOpenEditor(input, options, position, widthRatios);
	}

	private doOpenEditor(input: EditorInput, options: EditorOptions, position: Position, widthRatios: number[]): TPromise<BaseEditor> {

		// We need an editor descriptor for the input
		let descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(input);
		if (!descriptor) {
			return TPromise.wrapError(new Error(strings.format('Can not find a registered editor for the input {0}', input)));
		}

		// Opened to the side
		if (position !== Position.LEFT) {

			// Log side by side use
			this.telemetryService.publicLog('workbenchSideEditorOpened', { position: position });

			// Determine options if the editor opens to the side by looking at same input already opened
			options = this.findSideOptions(input, options, position);
		}

		// Progress Monitor & Ref Counting
		this.editorOpenToken[position]++;
		const editorOpenToken = this.editorOpenToken[position];
		const monitor = new ProgressMonitor(editorOpenToken, TPromise.timeout(this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */).then(() => {
			if (editorOpenToken === this.editorOpenToken[position]) {
				this.sideBySideControl.updateProgress(position, ProgressState.INFINITE);
				this.sideBySideControl.setLoading(position, input);
			}
		}));

		// Show editor
		return this.doShowEditor(descriptor, input, options, position, widthRatios, monitor).then(editor => {
			if (!editor) {
				return TPromise.as<BaseEditor>(null); // canceled or other error
			}

			// Set input to editor
			return this.doSetInput(editor, input, options, position, monitor);
		});
	}

	private doShowEditor(descriptor: EditorDescriptor, input: EditorInput, options: EditorOptions, position: Position, widthRatios: number[], monitor: ProgressMonitor): TPromise<BaseEditor> {
		const editorAtPosition = this.visibleEditors[position];

		// Return early if the currently visible editor can handle the input
		if (editorAtPosition && descriptor.describes(editorAtPosition)) {
			return this.mapEditorCreationPromiseToEditor[position][descriptor.getId()] || TPromise.as(editorAtPosition);
		}

		// If we have an active editor, hide it first
		return (editorAtPosition ? this.doHideEditor(position, false) : TPromise.as(null)).then(() => {

			// Create Editor
			let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Creating Editor: {0}', descriptor.getName()));
			return this.doCreateEditor(descriptor, position, monitor).then(editor => {

				// Make sure that the user meanwhile did not open another editor or something went wrong
				if (!editor || !this.visibleEditors[position] || editor.getId() !== this.visibleEditors[position].getId()) {
					timerEvent.stop();
					monitor.cancel();

					return null;
				}

				// Show in side by side control
				this.sideBySideControl.show(editor, this.mapEditorToEditorContainers[position][descriptor.getId()], position, options && options.preserveFocus, widthRatios);

				// Indicate to editor that it is now visible
				return editor.setVisible(true, position).then(() => {

					// Make sure the editor is layed out
					this.sideBySideControl.layout(position);

					// Emit Editor-Opened Event
					this.emit(WorkbenchEventType.EDITOR_OPENED, new EditorEvent(editor, editor.getId(), input, options, position));

					timerEvent.stop();

					return editor;
				});
			}, (e: any) => this.messageService.show(Severity.Error, types.isString(e) ? new Error(e) : e));
		});
	}

	private doCreateEditor(descriptor: EditorDescriptor, position: Position, monitor: ProgressMonitor): TPromise<BaseEditor> {

		// We need the container for this editor now
		let editorContainer = this.mapEditorToEditorContainers[position][descriptor.getId()];
		let newlyCreatedEditorContainerBuilder: Builder;
		if (!editorContainer) {

			// Build Container off-DOM
			editorContainer = $().div({
				'class': 'editor-container',
				id: descriptor.getId()
			}, (div) => {
				newlyCreatedEditorContainerBuilder = div;
			});

			// Remember editor container
			this.mapEditorToEditorContainers[position][descriptor.getId()] = editorContainer;
		}

		// Instantiate editor
		return this.doInstantiateEditor(descriptor, position).then(editor => {

			// Make sure that the user meanwhile did not open another editor
			if (monitor.token !== this.editorOpenToken[position]) {
				monitor.cancel();

				return null;
			}

			// Remember Editor at position
			this.visibleEditors[position] = editor;

			// Register as Emitter to Workbench Bus
			this.visibleEditorListeners[position].push(this.eventService.addEmitter(this.visibleEditors[position], this.visibleEditors[position].getId()));

			// Editor already created or pending to be created, just return it
			if (!newlyCreatedEditorContainerBuilder) {
				return (this.mapEditorCreationPromiseToEditor[position][descriptor.getId()] || TPromise.as(null)).then(() => editor);
			}

			// Otherwise Editor needs to be created()
			let created = false;
			let createEditorPromise = editor.create(newlyCreatedEditorContainerBuilder).then(() => {
				created = true;
				delete this.mapEditorCreationPromiseToEditor[position][descriptor.getId()];
			}, (error) => {
				created = true;
				delete this.mapEditorCreationPromiseToEditor[position][descriptor.getId()];

				return TPromise.wrapError(error);
			});

			if (!created) {
				this.mapEditorCreationPromiseToEditor[position][descriptor.getId()] = createEditorPromise.then(() => editor);
			}

			return createEditorPromise.then(() => editor);
		});
	}

	private doInstantiateEditor(descriptor: EditorDescriptor, position: Position): TPromise<BaseEditor> {

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
		let editorInstantiationService = this.instantiationService.createChild(new ServiceCollection([IProgressService, progressService]));
		let loaded = false;

		let instantiateEditorPromise = editorInstantiationService.createInstance(descriptor).then((editor: BaseEditor) => {
			loaded = true;
			this.instantiatedEditors[position].push(editor);
			delete this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()];

			return editor;
		}, (error) => {
			loaded = true;
			delete this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()];

			return TPromise.wrapError(error);
		});

		if (!loaded) {
			this.mapEditorInstantiationPromiseToEditor[position][descriptor.getId()] = instantiateEditorPromise;
		}

		return instantiateEditorPromise;
	}

	private doSetInput(editor: BaseEditor, input: EditorInput, options: EditorOptions, position: Position, monitor: ProgressMonitor): TPromise<BaseEditor> {

		// Emit Input-/Options-Changed Event as appropiate
		let oldInput = editor.getInput();
		let oldOptions = editor.getOptions();
		let inputChanged = (!oldInput || !oldInput.matches(input) || (options && options.forceOpen));
		if (inputChanged) {
			this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGING, new EditorEvent(editor, editor.getId(), input, options, position));
		} else if (!oldOptions || !oldOptions.matches(options)) {
			this.emit(WorkbenchEventType.EDITOR_OPTIONS_CHANGING, new EditorEvent(editor, editor.getId(), input, options, position));
		}

		// Call into Editor
		let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Set Editor Input: {0}', input.getName()));
		return editor.setInput(input, options).then(() => {

			// Reset counter
			this.editorSetInputErrorCounter[position] = 0;

			// Stop loading promise if any
			monitor.cancel();

			// Make sure that the user meanwhile has not opened another input
			if (this.visibleInputs[position] !== input) {
				timerEvent.stop();

				// It can happen that the same editor input is being opened rapidly one after the other
				// (e.g. fast double click on a file). In this case the first open will stop here because
				// we detect that a second open happens. However, since the input is the same, inputChanged
				// is false and we are not doing some things that we typically do when opening a file because
				// we think, the input has not changed.
				// The fix is to detect if the active input matches with this one that gets canceled and only
				// in that case notify others about the input change event as well as to make sure that the
				// editor title area is up to date.
				if (this.visibleInputs[position] && this.visibleInputs[position].matches(input)) {
					this.doUpdateEditorTitleArea();
					this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(editor, editor.getId(), this.visibleInputs[position], options, position));
				}

				return editor;
			}

			const focus = !options || !options.preserveFocus;
			const pinned = options && (options.pinned || typeof options.index === 'number'); // make pinned when index is provided
			const index = options && options.index;

			// Focus (unless prevented)
			if (focus) {
				editor.focus();
			}

			// Update stacks
			const group = this.ensureGroup(position, focus);
			group.openEditor(input, { active: true, pinned, index });

			// Progress Done
			this.sideBySideControl.updateProgress(position, ProgressState.DONE);

			// Emit Input-Changed Event (if input changed)
			if (inputChanged) {
				this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(editor, editor.getId(), input, options, position));
			}

			// Update Title Area
			if (inputChanged) {
				this.doUpdateEditorTitleArea(); // full title update
			} else {
				this.sideBySideControl.updateTitleArea({ position, preview: group.previewEditor, editorCount: group.count }); // little update for position
			}

			timerEvent.stop();

			// Fullfill promise with Editor that is being used
			return editor;

		}, (e: any) => this.doHandleSetInputError(e, editor, input, oldInput, options, position, monitor));
	}

	private doHandleSetInputError(e: Error | IMessageWithAction, editor: BaseEditor, input: EditorInput, oldInput: EditorInput, options: EditorOptions, position: Position, monitor: ProgressMonitor): void {

		// Keep counter
		this.editorSetInputErrorCounter[position]++;

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
		this.emit(WorkbenchEventType.EDITOR_SET_INPUT_ERROR, new EditorEvent(editor, editor.getId(), input, options, position));

		// Recover from this error by closing the editor if the attempt of setInput failed and we are not having any previous input
		if (!oldInput && this.visibleInputs[position] === input && input) {
			this.doCloseActiveEditor(position).done(null, errors.onUnexpectedError);
		}

		// We need to check our error counter here to prevent reentrant setInput() calls. If the workbench is in error state
		// to the disk, opening a file would fail and we would try to open the previous file which would fail too. So we
		// stop trying to open a previous file if we detect that we failed more than once already
		else if (this.editorSetInputErrorCounter[position] > 1) {
			this.doCloseActiveEditor(position).done(null, errors.onUnexpectedError);
		}

		// Otherwise if we had oldInput, properly restore it so that the active input points to the previous one
		else if (oldInput) {
			this.openEditor(oldInput, null, position).done(null, errors.onUnexpectedError);
		}
	}

	public closeEditor(position: Position, input: EditorInput): TPromise<void> {

		// Verify we actually have something to close at the given position
		const editor = this.visibleEditors[position];
		if (!editor) {
			return TPromise.as<void>(null);
		}

		// Check for dirty and veto
		return this.handleDirty([input]).then(veto => {
			if (veto) {
				return;
			}

			return this.doCloseEditor(position, input);
		});
	}

	private doCloseEditor(position: Position, input: EditorInput): TPromise<void> {
		const group = this.groupAt(position);

		// Closing the active editor of the group is a bit more work
		if (group.activeEditor && group.activeEditor.matches(input)) {
			return this.doCloseActiveEditor(position);
		}

		// Closing inactive editor is just a model update
		return this.doCloseInactiveEditor(input, position);
	}

	private doCloseActiveEditor(position: Position): TPromise<void> {

		// Update visible inputs for position
		this.visibleInputs[position] = null;

		// Reset counter
		this.editorSetInputErrorCounter[position] = 0;

		// Update stacks model
		const group = this.groupAt(position);
		group.closeEditor(group.activeEditor);

		// Close group is this is the last editor in group
		if (group.count === 0) {
			return this.doCloseGroup(position);
		}

		// Otherwise open next active
		return this.openEditor(group.activeEditor, null, position).then(() => null);
	}

	private doCloseInactiveEditor(input: EditorInput, position: Position): TPromise<void> {

		// Closing inactive editor is just a model update
		const group = this.groupAt(position);
		group.closeEditor(input);

		return TPromise.as<void>(null);
	}

	private doCloseGroup(position: Position): TPromise<void> {

		// Emit Input-Changing Event
		this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGING, new EditorEvent(null, null, null, null, position));

		// Hide Editor
		return this.doHideEditor(position, true).then(() => {

			// Update stacks model
			const group = this.groupAt(position);
			this.modifyGroups(() => this.stacks.closeGroup(group));

			// Emit Input-Changed Event
			this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(null, null, null, null, position));

			// Focus next editor if there is still an active one left
			let currentActiveEditor = this.sideBySideControl.getActiveEditor();
			if (currentActiveEditor) {
				return this.openEditor(currentActiveEditor.input, null, currentActiveEditor.position).then(() => {

					// Explicitly trigger the focus changed handler because the side by side control will not trigger it unless
					// the user is actively changing focus with the mouse from left to right.
					this.onGroupFocusChanged();
				});
			}
		});
	}

	private doHideEditor(position: Position, layoutAndRochade: boolean): TPromise<BaseEditor> {
		let editor = this.visibleEditors[position];
		let editorContainer = this.mapEditorToEditorContainers[position][editor.getId()];

		// Hide in side by side control
		let rochade = this.sideBySideControl.hide(editor, editorContainer, position, layoutAndRochade);

		// Clear any running Progress
		this.sideBySideControl.updateProgress(position, ProgressState.STOP);

		// Clear Listeners
		while (this.visibleEditorListeners[position].length) {
			this.visibleEditorListeners[position].pop()();
		}

		// Indicate to Editor
		editor.clearInput();
		return editor.setVisible(false).then(() => {

			// Clear active editor
			this.visibleEditors[position] = null;

			// Rochade as needed
			this.rochade(rochade);

			// Clear Title Area for Position
			this.sideBySideControl.clearTitle(position);

			// Emit Editor Closed Event
			this.emit(WorkbenchEventType.EDITOR_CLOSED, new EditorEvent(editor, editor.getId(), null, null, position));

			return editor;
		});
	}

	public closeEditors(position: Position, except?: EditorInput, direction?: Direction): TPromise<void> {

		// Verify we actually have something to close at the given position
		const editor = this.visibleEditors[position];
		if (!editor) {
			return TPromise.as<void>(null);
		}

		const group = this.groupAt(position);

		// Check for dirty and veto
		let editorsToClose: EditorInput[];
		if (!direction) {
			editorsToClose = group.getEditors().filter(e => !except || !e.matches(except));
		} else {
			editorsToClose = (direction === Direction.LEFT) ? group.getEditors().slice(0, group.indexOf(except)) : group.getEditors().slice(group.indexOf(except) + 1);
		}

		return this.handleDirty(editorsToClose).then(veto => {
			if (veto) {
				return;
			}

			// Close all editors in group
			if (!except) {

				// Update stacks model: remove all non active editors first to prevent opening the next editor in group
				group.closeEditors(group.activeEditor);

				// Now close active editor in group which will close the group
				return this.doCloseActiveEditor(position);
			}

			// Close all editors in group except active one
			if (except.matches(group.activeEditor)) {

				// Update stacks model: close non active editors supporting the direction
				group.closeEditors(group.activeEditor, direction);

				// No UI update needed
				return TPromise.as(null);
			}

			// Finally: we are asked to close editors around a non-active editor
			// Thus we make the non-active one active and then close the others
			return this.openEditor(except, null, position).then(() => {
				return this.closeEditors(position, except, direction);
			});
		});
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		let editors = this.getVisibleEditors().reverse(); // start from the end to prevent layout to happen through rochade

		// Remove position to exclude if we have any
		if (typeof except === 'number') {
			editors = editors.filter(e => e.position !== except);
		}

		return TPromise.join(editors.map(e => this.closeEditors(e.position))).then(() => void 0);
	}

	private handleDirty(inputs: EditorInput[]): TPromise<boolean /* veto */> {
		if (!inputs.length) {
			return TPromise.as(false); // no veto
		}

		return this.doHandleDirty(inputs.shift()).then(veto => {
			if (veto) {
				return veto;
			}

			return this.handleDirty(inputs);
		});
	}

	private doHandleDirty(input: EditorInput): TPromise<boolean /* veto */> {
		if (!input || !input.isDirty()) {
			return TPromise.as(false); // no veto
		}

		const res = input.confirmSave();
		switch (res) {
			case ConfirmResult.SAVE:
				return input.save().then(ok => !ok);

			case ConfirmResult.DONT_SAVE:
				return input.revert().then(ok => !ok);

			case ConfirmResult.CANCEL:
				return TPromise.as(true); // veto
		}
	}

	public getStacksModel(): EditorStacksModel {
		return this.stacks;
	}

	public getActiveEditorInput(): EditorInput {
		if (!this.sideBySideControl) {
			return null; // too early
		}

		let lastActiveEditor = this.sideBySideControl.getActiveEditor();

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
		if (!this.visibleEditors[from] || !this.visibleEditors[to] || from === to) {
			return; // Ignore if we cannot move
		}

		// Update stacks model
		this.modifyGroups(() => this.stacks.moveGroup(this.groupAt(from), to));

		// Move widgets
		this.sideBySideControl.move(from, to);

		// Move data structures
		arrays.move(this.visibleInputs, from, to);
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.visibleEditorListeners, from, to);
		arrays.move(this.editorOpenToken, from, to);
		arrays.move(this.mapEditorInstantiationPromiseToEditor, from, to);
		arrays.move(this.mapEditorCreationPromiseToEditor, from, to);
		arrays.move(this.instantiatedEditors, from, to);
		arrays.move(this.mapEditorToEditorContainers, from, to);

		// Restore focus
		let position = this.sideBySideControl.getActivePosition();
		this.focusGroup(position);

		// Update all title areas
		this.doUpdateEditorTitleArea();
	}

	public moveEditor(input: EditorInput, from: Position, to: Position, index?: number): TPromise<BaseEditor> {
		const editor = this.visibleEditors[from];
		const fromGroup = this.groupAt(from);
		const toGroup = this.groupAt(to);

		if (!editor || !fromGroup || !toGroup) {
			return TPromise.as<BaseEditor>(null);
		}

		// Move within group
		if (from === to) {
			return this.doMoveEditorInsideGroups(input, from, index);
		}

		// Move across groups
		return this.doMoveEditorAcrossGroups(input, from, to, index);
	}

	private doMoveEditorInsideGroups(input: EditorInput, position: Position, toIndex: number): TPromise<BaseEditor> {
		if (typeof toIndex !== 'number') {
			return TPromise.as<BaseEditor>(null); // do nothing if we move into same group without index
		}

		const group = this.groupAt(position);
		const currentIndex = group.indexOf(input);
		if (currentIndex === toIndex) {
			return TPromise.as<BaseEditor>(null); // do nothing if editor is already at the given index
		}

		// Update stacks model
		group.moveEditor(input, toIndex);
		group.pin(input);

		// Update UI
		this.doUpdateEditorTitleArea();
	}

	private doMoveEditorAcrossGroups(input: EditorInput, from: Position, to: Position, index?: number): TPromise<BaseEditor> {

		// A move to another group is a close first and an open in the target group
		return this.doCloseEditor(from, input).then(() => {
			return this.openEditor(input, EditorOptions.create({ pinned: true, index }), to);
		});
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

		const focusListener = this.sideBySideControl.onGroupFocusChanged(() => this.onGroupFocusChanged());
		this.toUnbind.push(() => focusListener.dispose());

		const titleClickListener = this.sideBySideControl.onEditorTitleDoubleclick((position) => this.onEditorTitleDoubleclick(position));
		this.toUnbind.push(() => titleClickListener.dispose());

		// get settings
		this.memento = this.getMemento(this.storageService, MementoScope.WORKSPACE);

		return contentArea;
	}

	private onGroupFocusChanged(): void {

		// Update stacks model
		let activePosition = this.sideBySideControl.getActivePosition();
		if (typeof activePosition === 'number') {
			this.stacks.setActive(this.groupAt(activePosition));
		}

		// Emit as editor input change event so that clients get aware of new active editor
		let activeEditor = this.sideBySideControl.getActiveEditor();
		if (activeEditor) {
			this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGING, new EditorEvent(activeEditor, activeEditor.getId(), activeEditor.input, null, activeEditor.position));
			this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(activeEditor, activeEditor.getId(), activeEditor.input, null, activeEditor.position));
		}

		// Update Title Area
		this.doUpdateEditorTitleArea();
	}

	private onEditorTitleDoubleclick(position: Position): void {
		const editor = this.visibleEditors[position];
		if (editor) {
			this.pinEditor(position, editor.input);
		}
	}

	public openEditors(editors: { input: EditorInput, position: Position, options?: EditorOptions }[]): TPromise<BaseEditor[]> {
		if (!editors.length) {
			return TPromise.as<BaseEditor[]>([]);
		}

		return this.doOpenEditors(editors);
	}

	public restoreEditors(): TPromise<BaseEditor[]> {
		const editors = this.stacks.groups.map((group, index) => {
			return {
				input: group.activeEditor,
				position: index
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

		// Validate we do not produce empty groups
		if ((!leftEditors.length && (centerEditors.length || rightEditors.length) || (!centerEditors.length && rightEditors.length))) {
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
			widthRatios = (positions === 3) ? [0.33, 0.33, 0.34] : (positions === 2) ? [0.5, 0.5] : [1];
		}

		// Open each input respecting the options. Since there can only be one active editor in each
		// position, we have to pick the first input from each position and add the others as inactive
		let promises: TPromise<BaseEditor>[] = [];
		[leftEditors.shift(), centerEditors.shift(), rightEditors.shift()].forEach((editor, index) => {
			if (!editor) {
				return; // unused position
			}

			const input = editor.input;

			// Resolve editor options
			const preserveFocus = activePosition !== index;
			let options: EditorOptions;
			if (editor.options) {
				options = editor.options;
				options.preserveFocus = preserveFocus;
			} else {
				options = EditorOptions.create({ preserveFocus: preserveFocus });
			}

			promises.push(this.openEditor(input, options, index, widthRatios));
		});

		return TPromise.join(promises).then(editors => {

			// Update stacks model for remaining inactive editors
			[leftEditors, centerEditors, rightEditors].forEach((editors, index) => {
				const group = this.groupAt(index);
				if (group) {
					editors.forEach(editor => group.openEditor(editor.input, { pinned: true })); // group could be null if one openeditor call failed!
				}
			});

			// Full layout side by side
			this.sideBySideControl.layout(this.dimension);

			return editors;
		});
	}

	public groupAt(position: Position): EditorGroup {
		return this.stacks.groups[position];
	}

	public activateGroup(position: Position): void {
		const editor = this.visibleEditors[position];
		if (editor) {

			// Update stacks model
			this.stacks.setActive(this.groupAt(position));

			// Update UI
			this.sideBySideControl.setActive(editor);
		}
	}

	public focusGroup(position: Position): void {
		const editor = this.visibleEditors[position];
		if (editor) {

			// Make active
			this.activateGroup(position);

			// Focus
			editor.focus();
		}
	}

	public pinEditor(position: Position, input: EditorInput): void {
		const group = this.groupAt(position);
		if (group) {
			if (group.isPinned(input)) {
				return;
			}

			// Update stacks model
			group.pin(input);

			// Update UI
			this.sideBySideControl.updateTitleArea({ position, preview: group.previewEditor, editorCount: group.count });
		}
	}

	public unpinEditor(position: Position, input: EditorInput): void {
		const group = this.groupAt(position);
		if (group) {
			if (group.isPreview(input)) {
				return;
			}

			// Unpinning an editor closes the preview editor if we have any
			let handlePreviewEditor: TPromise<boolean> = TPromise.as(false);
			if (group.previewEditor) {
				handlePreviewEditor = this.handleDirty([group.previewEditor]);
			}

			handlePreviewEditor.done(veto => {
				if (veto) {
					return;
				}

				// The active editor is the preview editor and we are asked to make
				// another editor the preview editor. So we need to take care of closing
				// the active editor first
				let closeActivePromise: TPromise<void> = TPromise.as(null);
				if (group.isPreview(group.activeEditor) && !group.activeEditor.matches(input)) {
					closeActivePromise = this.doCloseActiveEditor(position);
				}

				closeActivePromise.done(() => {

					// Update stacks model
					group.unpin(input);

					// Update UI
					this.sideBySideControl.updateTitleArea({ position, preview: group.previewEditor, editorCount: group.count });

				}, errors.onUnexpectedError);
			});
		}
	}

	private doUpdateEditorTitleArea(): void {
		if (this.sideBySideControl) {
			const titleAreaState: ITitleAreaState[] = this.getVisibleEditors().map((e, index) => {
				const group = this.groupAt(index);

				return {
					position: e.position,
					preview: group && group.previewEditor,
					editorCount: group ? group.count : 0
				};
			});

			this.sideBySideControl.recreateTitleArea(titleAreaState);
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

		// Reset Tokens
		this.editorOpenToken = [];
		for (let i = 0; i < POSITIONS.length; i++) {
			this.editorOpenToken[i] = 0;
		}

		// Widgets
		this.sideBySideControl.dispose();

		// Editor listeners
		for (let i = 0; i < this.visibleEditorListeners.length; i++) {
			while (this.visibleEditorListeners[i].length) {
				this.visibleEditorListeners[i].pop()();
			}
		}

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
		this.visibleInputs = null;

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

	private findSideOptions(input: EditorInput, options: EditorOptions, position: Position): EditorOptions {
		if (
			(this.visibleEditors[position] && input.matches(this.visibleEditors[position].input)) ||	// Return early if the input is already showing at the position
			(options instanceof TextEditorOptions && (<TextEditorOptions>options).hasOptionsDefined())	// Return early if explicit text options are defined
		) {
			return options;
		}

		// Otherwise try to copy viewstate over from an existing opened editor with same input
		let viewState: IEditorViewState = null;
		let editors = this.getVisibleEditors();
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];

			if (!(editor instanceof BaseTextEditor)) {
				continue; // Only works with text editors
			}

			// Found a match
			if (input.matches(editor.input)) {
				let codeEditor = <IEditor>editor.getControl();
				viewState = <IEditorViewState>codeEditor.saveViewState();

				break;
			}
		}

		// Found view state
		if (viewState) {
			let textEditorOptions: TextEditorOptions = null;

			// Merge into existing text editor options if given
			if (options instanceof TextEditorOptions) {
				textEditorOptions = <TextEditorOptions>options;
				textEditorOptions.viewState(viewState);

				return textEditorOptions;
			}

			// Otherwise create new
			textEditorOptions = new TextEditorOptions();
			textEditorOptions.viewState(viewState);
			if (options) {
				textEditorOptions.mixin(options);
			}

			return textEditorOptions;
		}

		return options;
	}

	private startDelayedCloseEditorsFromInputDispose(): void {

		// To prevent race conditions, we call the close in a timeout because it can well be
		// that an input is being disposed with the intent to replace it with some other input
		// right after.
		if (this.pendingEditorInputCloseTimeout === null) {
			this.pendingEditorInputCloseTimeout = setTimeout(() => {

				// Split between active and inactive editors
				const activeEditors: IEditorIdentifier[] = [];
				const inactiveEditors: IEditorIdentifier[] = [];
				this.pendingEditorInputsToClose.forEach(identifier => {
					if (identifier.group.isActive(identifier.editor)) {
						activeEditors.push(identifier);
					} else {
						inactiveEditors.push(identifier);
					}
				});

				// Close all inactive first
				TPromise.join(inactiveEditors.map(inactive => this.closeEditor(this.stacks.positionOfGroup(inactive.group), inactive.editor))).done(() => {

					// Close active ones second
					TPromise.join(activeEditors
						.sort((a1, a2) => this.stacks.positionOfGroup(a2.group) - this.stacks.positionOfGroup(a1.group))	// reduce layout work by starting right first
						.map(active => this.closeEditor(this.stacks.positionOfGroup(active.group), active.editor))
					).done(null, errors.onUnexpectedError);

				}, errors.onUnexpectedError);

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

			this.doRochade(this.visibleInputs, from, to, null);
			this.doRochade(this.visibleEditors, from, to, null);
			this.doRochade(this.editorOpenToken, from, to, null);
			this.doRochade(this.mapEditorInstantiationPromiseToEditor, from, to, Object.create(null));
			this.doRochade(this.mapEditorCreationPromiseToEditor, from, to, Object.create(null));
			this.doRochade(this.visibleEditorListeners, from, to, []);
			this.doRochade(this.instantiatedEditors, from, to, []);
			this.doRochade(this.mapEditorToEditorContainers, from, to, Object.create(null));
		}
	}

	private doRochade(array: any[], from: Position, to: Position, empty: any): void {
		array[to] = array[from];
		array[from] = empty;
	}

	private ensureGroup(position: Position, activate = true): EditorGroup {
		let group = this.groupAt(position);
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
				this.stacks.renameGroup(this.groupAt(Position.LEFT), EditorPart.GROUP_LEFT_LABEL);
				this.stacks.renameGroup(this.groupAt(Position.CENTER), EditorPart.GROUP_CENTER_LABEL);
				this.stacks.renameGroup(this.groupAt(Position.RIGHT), EditorPart.GROUP_RIGHT_LABEL);
			}

			// LEFT | RIGHT
			else if (groups.length > 1) {
				this.stacks.renameGroup(this.groupAt(Position.LEFT), EditorPart.GROUP_LEFT_LABEL);
				this.stacks.renameGroup(this.groupAt(Position.CENTER), EditorPart.GROUP_RIGHT_LABEL);
			}

			// LEFT
			else {
				this.stacks.renameGroup(this.groupAt(Position.LEFT), EditorPart.GROUP_LEFT_LABEL);
			}
		}
	}

	private hasGroup(position: Position): boolean {
		return !!this.groupAt(position);
	}
}