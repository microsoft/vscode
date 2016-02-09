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
import assert = require('vs/base/common/assert');
import arrays = require('vs/base/common/arrays');
import types = require('vs/base/common/types');
import {IEditorViewState, IEditor} from 'vs/editor/common/editorCommon';
import errors = require('vs/base/common/errors');
import {Scope as MementoScope} from 'vs/workbench/common/memento';
import {Scope, IActionBarRegistry, Extensions as ActionBarExtensions, prepareActions} from 'vs/workbench/browser/actionBarRegistry';
import {IAction} from 'vs/base/common/actions';
import {Part} from 'vs/workbench/browser/part';
import {EventType as WorkbenchEventType, EditorEvent} from 'vs/workbench/common/events';
import {IEditorRegistry, Extensions as EditorExtensions, BaseEditor, IEditorInputActionContext, EditorDescriptor} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput, EditorOptions, TextEditorOptions} from 'vs/workbench/common/editor';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {EventType as SideBySideEventType, SideBySideEditorControl, Rochade} from 'vs/workbench/browser/parts/editor/sideBySideEditorControl';
import {WorkbenchProgressService} from 'vs/workbench/services/progress/browser/progressService';
import {EditorArrangement} from 'vs/workbench/services/editor/common/editorService';
import {IEditorPart} from 'vs/workbench/services/editor/browser/editorService';
import {IPartService} from 'vs/workbench/services/part/common/partService';
import {Position, POSITIONS} from 'vs/platform/editor/common/editor';
import {IStorageService} from 'vs/platform/storage/common/storage';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, IMessageWithAction, Severity} from 'vs/platform/message/common/message';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

const EDITOR_STATE_STORAGE_KEY = 'editorpart.editorState';

interface IEditorActions {
	primary: IAction[];
	secondary: IAction[];
}

interface IEditorStateEntry {
	inputId: string;
	inputValue: string;
	hasFocus: boolean;
}

interface IEditorState {
	editors: IEditorStateEntry[];
	widthRatio: number[];
}

/**
 * The editor part is the container for editors in the workbench. Based on the editor input being opened, it asks the registered
 * editor for the given input to show the contents. The editor part supports up to 3 side-by-side editors.
 */
export class EditorPart extends Part implements IEditorPart {
	private instantiationService: IInstantiationService;
	private dimension: Dimension;
	private sideBySideControl: SideBySideEditorControl;
	private memento: any;

	// The following data structures are partitioned into array of Position as provided by Services.POSITION array
	private visibleInputs: EditorInput[];
	private visibleInputListeners: { (): void; }[];
	private visibleEditors: BaseEditor[];
	private visibleEditorListeners: { (): void; }[][];
	private instantiatedEditors: BaseEditor[][];
	private mapEditorToEditorContainers: { [editorId: string]: Builder; }[];
	private mapActionsToEditors: { [editorId: string]: IEditorActions; }[];
	private mapEditorLoadingPromiseToEditor: { [editorId: string]: TPromise<BaseEditor>; }[];
	private mapEditorCreationPromiseToEditor: { [editorId: string]: TPromise<BaseEditor>; }[];
	private editorOpenToken: number[];
	private editorSetInputErrorCounter: number[];
	private pendingEditorInputsToClose: EditorInput[];
	private pendingEditorInputCloseTimeout: number;

	constructor(
		private messageService: IMessageService,
		private eventService: IEventService,
		private telemetryService: ITelemetryService,
		private storageService: IStorageService,
		private partService: IPartService,
		id: string
	) {
		super(id);

		this.visibleInputs = [];
		this.visibleInputListeners = [];
		this.visibleEditors = [];

		this.editorOpenToken = [];
		for (let i = 0; i < POSITIONS.length; i++) {
			this.editorOpenToken[i] = 0;
		}

		this.editorSetInputErrorCounter = [];
		for (let i = 0; i < POSITIONS.length; i++) {
			this.editorSetInputErrorCounter[i] = 0;
		}

		this.visibleEditorListeners = this.createPositionArray(true);
		this.instantiatedEditors = this.createPositionArray(true);

		this.mapEditorToEditorContainers = this.createPositionArray(false);
		this.mapActionsToEditors = this.createPositionArray(false);
		this.mapEditorLoadingPromiseToEditor = this.createPositionArray(false);
		this.mapEditorCreationPromiseToEditor = this.createPositionArray(false);

		this.pendingEditorInputsToClose = [];
		this.pendingEditorInputCloseTimeout = null;
	}

	public setInstantiationService(service: IInstantiationService): void {
		this.instantiationService = service;
	}

	private createPositionArray(multiArray: boolean): any[] {
		let array: any[] = [];

		for (let i = 0; i < POSITIONS.length; i++) {
			array[i] = multiArray ? [] : {};
		}

		return array;
	}

	public getActiveEditorInput(): EditorInput {
		let lastActiveEditor = this.sideBySideControl.getActiveEditor();

		return lastActiveEditor ? lastActiveEditor.input : null;
	}

	public getActiveEditor(): BaseEditor {
		return this.sideBySideControl.getActiveEditor();
	}

	public getVisibleEditors(): BaseEditor[] {
		return this.visibleEditors ? this.visibleEditors.filter((editor) => !!editor) : [];
	}

	public setEditors(inputs: EditorInput[], options?: EditorOptions[]): TPromise<BaseEditor[]> {
		return this.closeEditors().then(() => {
			return this.restoreEditorState(inputs, options);
		});
	}

	public openEditor(input?: EditorInput, options?: EditorOptions, sideBySide?: boolean): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, position?: Position, widthRatios?: number[]): TPromise<BaseEditor>;
	public openEditor(input?: EditorInput, options?: EditorOptions, arg3?: any, widthRatios?: number[]): TPromise<BaseEditor> {

		// Normalize some values
		if (!input) { input = null; }
		if (!options) { options = null; }

		// Determine position to open editor in (left, center, right)
		let position = this.findPosition(arg3, widthRatios);

		// In case the position is invalid, return early. This can happen when the user tries to open a side editor
		// when the maximum number of allowed editors is reached and no more side editor can be opened.
		if (position === null) {
			return TPromise.as<BaseEditor>(null);
		}

		// Prevent bad UI issues by ignoring any attempt to open an editor if at the same time an editor is
		// either creating or loading at this position. Not very nice, but helpful and typically should not cause issues.
		if (Object.keys(this.mapEditorLoadingPromiseToEditor[position]).length > 0 || Object.keys(this.mapEditorCreationPromiseToEditor[position]).length > 0) {
			return TPromise.as<BaseEditor>(null);
		}

		// Prevent bad UI issues by ignoring openEditor() calls while the user is dragging an editor
		if (this.sideBySideControl.isDragging()) {
			return TPromise.as<BaseEditor>(null);
		}

		// Emit early open event to allow for veto
		let event = new EditorEvent(this.visibleEditors[position], this.visibleEditors[position] && this.visibleEditors[position].getId(), input, options, position);
		this.emit(WorkbenchEventType.EDITOR_INPUT_OPENING, event);
		if (event.isPrevented()) {
			return TPromise.as<BaseEditor>(null);
		}

		// Do ref counting of this method
		this.editorOpenToken[position]++;
		let editorOpenToken = this.editorOpenToken[position];

		// Log side by side use
		if (input && position !== Position.LEFT) {
			this.telemetryService.publicLog('workbenchSideEditorOpened', { position: position });
		}

		// Determine options if the editor opens to the side by looking at same input already opened
		if (input && position !== Position.LEFT) {
			options = this.findSideOptions(input, options, position);
		}

		// Remember as visible input for this position
		this.visibleInputs[position] = input;

		// Dispose previous input listener if any
		if (this.visibleInputListeners[position]) {
			this.visibleInputListeners[position]();
			this.visibleInputListeners[position] = null;
		}

		// Close editor when input provided and input gets disposed
		if (input) {
			this.visibleInputListeners[position] = input.addListener(EventType.DISPOSE, () => {

				// Keep the inputs to close. We use this to support multiple inputs closing
				// right after each other and this helps avoid layout issues with the delayed
				// timeout based closing below
				if (input === this.visibleInputs[position]) {
					this.pendingEditorInputsToClose.push(input);
					this.startDelayedCloseEditorsFromInputDispose();
				}
			});
		}

		// Close any opened editor at position if input is null
		if (input === null) {
			if (this.visibleEditors[position]) {

				// Reset counter
				this.editorSetInputErrorCounter[position] = 0;

				// Emit Input-Changing Event
				this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGING, new EditorEvent(null, null, null, null, position));

				// Hide Editor
				return this.hideEditor(this.visibleEditors[position], position, true).then(() => {

					// Emit Input-Changed Event
					this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(null, null, null, null, position));

					// Focus next editor if there is still an active one left
					let currentActiveEditor = this.sideBySideControl.getActiveEditor();
					if (currentActiveEditor) {
						return this.openEditor(currentActiveEditor.input, null, currentActiveEditor.position).then(() => {

							// Explicitly trigger the focus changed handler because the side by side control will not trigger it unless
							// the user is actively changing focus with the mouse from left to right.
							this.onEditorFocusChanged();

							return currentActiveEditor;
						});
					}

					return TPromise.as<BaseEditor>(null);
				});
			}

			return TPromise.as<BaseEditor>(null);
		}

		// Lookup Editor and Assert
		let editorDescriptor = (<IEditorRegistry>Registry.as(EditorExtensions.Editors)).getEditor(input);
		assert.ok(editorDescriptor, strings.format('Can not find a registered editor for the input {0}', input));

		// Progress Indication
		let loadingPromise: TPromise<void> = TPromise.timeout(this.partService.isCreated() ? 800 : 3200 /* less ugly initial startup */).then(() => {
			if (editorOpenToken === this.editorOpenToken[position]) {
				this.sideBySideControl.getProgressBar(position).infinite().getContainer().show();
				this.sideBySideControl.setLoading(position, input);
			}
		});

		// Handle Active Editor showing
		let activeEditorHidePromise: TPromise<BaseEditor>;
		if (this.visibleEditors[position]) {

			// Editor can handle Input
			if (editorDescriptor.describes(this.visibleEditors[position])) {

				// If the editor is currently being created, join this process to avoid issues
				let pendingEditorCreationPromise = this.mapEditorCreationPromiseToEditor[position][editorDescriptor.getId()];
				if (!pendingEditorCreationPromise) {
					pendingEditorCreationPromise = TPromise.as(null);
				}

				return pendingEditorCreationPromise.then(() => {
					return this.setInput(this.visibleEditors[position], input, options, position, loadingPromise);
				});
			}

			// Editor can not handle Input (Close this Editor)
			activeEditorHidePromise = this.hideEditor(this.visibleEditors[position], position, false);
		} else {
			activeEditorHidePromise = TPromise.as(null);
		}

		return activeEditorHidePromise.then(() => {
			let timerEvent = timer.start(timer.Topic.WORKBENCH, strings.format('Creating Editor: {0}', editorDescriptor.getName()));

			// We need the container for this editor now
			let editorContainer = this.mapEditorToEditorContainers[position][editorDescriptor.getId()];
			let newlyCreatedEditorContainerBuilder: Builder;
			if (!editorContainer) {

				// Build Container off-DOM
				editorContainer = $().div({
					'class': 'editor-container',
					id: editorDescriptor.getId()
				}, (div) => {
					newlyCreatedEditorContainerBuilder = div;
				});

				// Remember editor container
				this.mapEditorToEditorContainers[position][editorDescriptor.getId()] = editorContainer;
			}

			// Create or get editor from cache
			let editor = this.getEditorFromCache(editorDescriptor, position);
			let loadOrGetEditorPromise: TPromise<BaseEditor>;
			if (editor === null) {

				// Check if loading is pending from another openEditor
				let pendingEditorLoad = this.mapEditorLoadingPromiseToEditor[position][editorDescriptor.getId()];
				if (pendingEditorLoad) {
					loadOrGetEditorPromise = pendingEditorLoad;
				}

				// Otherwise load
				else {
					let loaded = false;
					loadOrGetEditorPromise = this.createEditor(editorDescriptor, newlyCreatedEditorContainerBuilder.getHTMLElement(), position).then((editor) => {
						loaded = true;
						this.instantiatedEditors[position].push(editor);
						delete this.mapEditorLoadingPromiseToEditor[position][editorDescriptor.getId()];

						return editor;
					}, (error) => {
						loaded = true;
						delete this.mapEditorLoadingPromiseToEditor[position][editorDescriptor.getId()];

						return TPromise.wrapError(error);
					});

					if (!loaded) {
						this.mapEditorLoadingPromiseToEditor[position][editorDescriptor.getId()] = loadOrGetEditorPromise;
					}
				}
			} else {
				loadOrGetEditorPromise = TPromise.as(editor);
			}

			return loadOrGetEditorPromise.then((editor) => {

				// Make sure that the user meanwhile did not open another editor
				if (editorOpenToken !== this.editorOpenToken[position]) {
					timerEvent.stop();

					// Stop loading promise if any
					loadingPromise.cancel();

					return null;
				}

				// Remember Editor at position
				this.visibleEditors[position] = editor;

				// Register as Emitter to Workbench Bus
				this.visibleEditorListeners[position].push(this.eventService.addEmitter(this.visibleEditors[position], this.visibleEditors[position].getId()));

				let createEditorPromise: TPromise<any>;
				if (newlyCreatedEditorContainerBuilder) { // Editor created for the first time

					// create editor
					let created = false;
					createEditorPromise = editor.create(newlyCreatedEditorContainerBuilder).then(() => {
						created = true;
						delete this.mapEditorCreationPromiseToEditor[position][editorDescriptor.getId()];
					}, (error) => {
						created = true;
						delete this.mapEditorCreationPromiseToEditor[position][editorDescriptor.getId()];

						return TPromise.wrapError(error);
					});

					if (!created) {
						this.mapEditorCreationPromiseToEditor[position][editorDescriptor.getId()] = createEditorPromise;
					}
				}

				// Editor already exists but is hidden or pending to create
				else {

					// Check if create is pending from another openEditor
					let pendingEditorCreate = this.mapEditorCreationPromiseToEditor[position][editorDescriptor.getId()];
					if (pendingEditorCreate) {
						createEditorPromise = pendingEditorCreate;
					} else {
						createEditorPromise = TPromise.as(null);
					}
				}

				// Fill Content and Actions
				return createEditorPromise.then(() => {

					// Make sure that the user meanwhile did not open another editor
					if (!this.visibleEditors[position] || editor.getId() !== this.visibleEditors[position].getId()) {
						timerEvent.stop();

						// Stop loading promise if any
						loadingPromise.cancel();

						return null;
					}

					// Show in side by side control
					this.sideBySideControl.show(editor, editorContainer, position, options && options.preserveFocus, widthRatios);

					// Indicate to editor that it is now visible
					return editor.setVisible(true, position).then(() => {

						// Make sure the editor is layed out
						this.sideBySideControl.layout(position);

						// Emit Editor-Opened Event
						this.emit(WorkbenchEventType.EDITOR_OPENED, new EditorEvent(editor, editor.getId(), input, options, position));

						timerEvent.stop();

						// Set Input
						return this.setInput(editor, input, options, position, loadingPromise);
					});
				}, (e: any) => this.showError(e));
			});
		});
	}

	private startDelayedCloseEditorsFromInputDispose(): void {

		// To prevent race conditions, we call the close in a timeout because it can well be
		// that an input is being disposed with the intent to replace it with some other input
		// right after.
		if (this.pendingEditorInputCloseTimeout === null) {
			this.pendingEditorInputCloseTimeout = setTimeout(() => {
				this.closeEditors(false, this.pendingEditorInputsToClose).done(null, errors.onUnexpectedError);

				// Reset
				this.pendingEditorInputCloseTimeout = null;
				this.pendingEditorInputsToClose = [];
			}, 0);
		}
	}

	public closeEditors(othersOnly?: boolean, inputs?: EditorInput[]): TPromise<void> {
		let promises: TPromise<BaseEditor>[] = [];

		let editors = this.getVisibleEditors().reverse(); // start from the end to prevent layout to happen through rochade
		for (var i = 0; i < editors.length; i++) {
			var editor = editors[i];
			if (othersOnly && this.getActiveEditor() === editor) {
				continue;
			}

			if (!inputs || inputs.some(inp => inp === editor.input)) {
				promises.push(this.openEditor(null, null, editor.position));
			}
		}

		return TPromise.join(promises).then(() => void 0);
	}

	private findPosition(sideBySide?: boolean, widthRatios?: number[]): Position;
	private findPosition(desiredPosition?: Position, widthRatios?: number[]): Position;
	private findPosition(arg1?: any, widthRatios?: number[]): Position {

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

		// Return early if the input is already showing at the position
		if (this.visibleEditors[position] && input.matches(this.visibleEditors[position].input)) {
			return options;
		}

		// Return early if explicit text options are defined
		if (options instanceof TextEditorOptions && (<TextEditorOptions>options).hasOptionsDefined()) {
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
				textEditorOptions.forceOpen = options.forceOpen;
				textEditorOptions.preserveFocus = options.preserveFocus;
			}

			return textEditorOptions;
		}

		return options;
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
					break;
			}
		} else {
			let from = <Position>arg1;
			let to = <Position>arg2;

			this.doRochade(this.visibleInputs, from, to, null);
			this.doRochade(this.visibleInputListeners, from, to, null);
			this.doRochade(this.visibleEditors, from, to, null);
			this.doRochade(this.editorOpenToken, from, to, null);
			this.doRochade(this.mapEditorLoadingPromiseToEditor, from, to, {});
			this.doRochade(this.mapEditorCreationPromiseToEditor, from, to, {});
			this.doRochade(this.visibleEditorListeners, from, to, []);
			this.doRochade(this.instantiatedEditors, from, to, []);
			this.doRochade(this.mapEditorToEditorContainers, from, to, {});
			this.doRochade(this.mapActionsToEditors, from, to, {});
		}
	}

	private doRochade(array: any[], from: Position, to: Position, empty: any): void {
		array[to] = array[from];
		array[from] = empty;
	}

	public moveEditor(from: Position, to: Position): void {
		if (!this.visibleEditors[from] || !this.visibleEditors[to] || from === to) {
			return; // Ignore if we cannot move
		}

		// Move widgets
		this.sideBySideControl.move(from, to);

		// Move data structures
		arrays.move(this.visibleInputs, from, to);
		arrays.move(this.visibleInputListeners, from, to);
		arrays.move(this.visibleEditors, from, to);
		arrays.move(this.visibleEditorListeners, from, to);
		arrays.move(this.editorOpenToken, from, to);
		arrays.move(this.mapEditorLoadingPromiseToEditor, from, to);
		arrays.move(this.mapEditorCreationPromiseToEditor, from, to);
		arrays.move(this.instantiatedEditors, from, to);
		arrays.move(this.mapEditorToEditorContainers, from, to);
		arrays.move(this.mapActionsToEditors, from, to);

		// Update all title areas
		this.updateEditorTitleArea();

		// Restore focus
		let activeEditor = this.sideBySideControl.getActiveEditor();
		this.openEditor(activeEditor.input, null, activeEditor.position).done(null, errors.onUnexpectedError);
	}

	public arrangeEditors(arrangement: EditorArrangement): void {
		this.sideBySideControl.arrangeEditors(arrangement);
	}

	private setInput(editor: BaseEditor, input: EditorInput, options: EditorOptions, position: Position, loadingPromise: TPromise<void>): TPromise<BaseEditor> {

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
			loadingPromise.cancel();

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
					this.updateEditorTitleArea();
					this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(editor, editor.getId(), this.visibleInputs[position], options, position));
				}

				return editor;
			}

			// Focus (unless prevented)
			if (!options || !options.preserveFocus) {
				editor.focus();
			}

			// Otherwise check if we want to activate
			else if (options && options.forceActive) {
				this.sideBySideControl.setActive(editor);
			}

			// Progress Done
			this.sideBySideControl.getProgressBar(position).done().getContainer().hide();

			// Update Title Area if input changed
			if (inputChanged) {
				this.updateEditorTitleArea();
			}

			// Emit Input-Changed Event (if input changed)
			if (inputChanged) {
				this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(editor, editor.getId(), input, options, position));
			}

			timerEvent.stop();

			// Fullfill promise with Editor that is being used
			return editor;
		}, (e: any) => {

			// Keep counter
			this.editorSetInputErrorCounter[position]++;

			// Stop loading promise if any
			loadingPromise.cancel();

			// Report error
			this.onSetInputError(e, editor, input, options, position);

			// Recover from this error by closing the editor if the attempt of setInput failed and we are not having any previous input
			if (!oldInput && this.visibleInputs[position] === input && input) {
				this.openEditor(null, null, position).done(null, errors.onUnexpectedError);
			}

			// We need to check our error counter here to prevent reentrant setInput() calls. If the workbench is in error state
			// to the disk, opening a file would fail and we would try to open the previous file which would fail too. So we
			// stop trying to open a previous file if we detect that we failed more than once already
			else if (this.editorSetInputErrorCounter[position] > 1) {
				this.openEditor(null, null, position).done(null, errors.onUnexpectedError);
			}

			// Otherwise if we had oldInput, properly restore it so that the active input points to the previous one
			else if (oldInput) {
				this.openEditor(oldInput, null, position).done(null, errors.onUnexpectedError);
			}
		});
	}

	private getEditorFromCache(editorDescriptor: EditorDescriptor, position: Position): BaseEditor {

		// Check for existing instantiated editor
		for (let i = 0; i < this.instantiatedEditors[position].length; i++) {
			if (editorDescriptor.describes(this.instantiatedEditors[position][i])) {
				return this.instantiatedEditors[position][i];
			}
		}

		return null;
	}

	private createEditor(editorDescriptor: EditorDescriptor, editorDomNode: HTMLElement, position: Position): TPromise<BaseEditor> {
		let services = {
			progressService: new WorkbenchProgressService(this.eventService, this.sideBySideControl.getProgressBar(position), editorDescriptor.getId(), true)
		};

		let editorInstantiationService = this.instantiationService.createChild(services);

		return editorInstantiationService.createInstance(editorDescriptor);
	}

	private hideEditor(editor: BaseEditor, position: Position, layoutAndRochade: boolean): TPromise<BaseEditor> {
		let editorContainer = this.mapEditorToEditorContainers[position][editor.getId()];

		// Hide in side by side control
		let rochade = this.sideBySideControl.hide(editor, editorContainer, position, layoutAndRochade);

		// Clear any running Progress
		this.sideBySideControl.getProgressBar(position).stop().getContainer().hide();

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

	private updateEditorTitleArea(): void {
		let activePosition = this.sideBySideControl.getActivePosition();

		// Update each position individually
		for (let i = 0; i < POSITIONS.length; i++) {
			let editor = this.visibleEditors[i];
			let input = editor ? editor.input : null;

			if (input && editor) {
				this.doUpdateEditorTitleArea(editor, input, i, activePosition === i);
			}
		}
	}

	private doUpdateEditorTitleArea(editor: BaseEditor, input: EditorInput, position: Position, isActive?: boolean): void {
		let primaryActions: IAction[] = [];
		let secondaryActions: IAction[] = [];

		// Handle toolbar only if side is active
		if (isActive) {

			// Handle Editor Actions
			let editorActions = this.mapActionsToEditors[position][editor.getId()];
			if (!editorActions) {
				editorActions = this.getEditorActionsForContext(editor, editor, position);
				this.mapActionsToEditors[position][editor.getId()] = editorActions;
			}

			primaryActions.push(...editorActions.primary);
			secondaryActions.push(...editorActions.secondary);

			// Handle Editor Input Actions
			let editorInputActions = this.getEditorActionsForContext({ input: input, editor: editor, position: position }, editor, position);

			primaryActions.push(...editorInputActions.primary);
			secondaryActions.push(...editorInputActions.secondary);
		}

		// Apply to title in side by side control
		this.sideBySideControl.setTitle(position, input, prepareActions(primaryActions), prepareActions(secondaryActions), isActive);
	}

	private getEditorActionsForContext(context: BaseEditor, editor: BaseEditor, position: Position): IEditorActions;
	private getEditorActionsForContext(context: IEditorInputActionContext, editor: BaseEditor, position: Position): IEditorActions;
	private getEditorActionsForContext(context: any, editor: BaseEditor, position: Position): IEditorActions {
		let primaryActions: IAction[] = [];
		let secondaryActions: IAction[] = [];

		// From Editor
		if (context instanceof BaseEditor) {
			primaryActions.push(...(<BaseEditor>context).getActions());
			secondaryActions.push(...(<BaseEditor>context).getSecondaryActions());
		}

		// From Contributions
		let actionBarRegistry = <IActionBarRegistry>Registry.as(ActionBarExtensions.Actionbar);
		primaryActions.push(...actionBarRegistry.getActionBarActionsForContext(Scope.EDITOR, context));
		secondaryActions.push(...actionBarRegistry.getSecondaryActionBarActionsForContext(Scope.EDITOR, context));

		return {
			primary: primaryActions,
			secondary: secondaryActions
		};
	}

	public createContentArea(parent: Builder): Builder {

		// Content Container
		let contentArea = $(parent)
			.div()
			.addClass('content');

		// Side by Side Control
		this.sideBySideControl = this.instantiationService.createInstance(SideBySideEditorControl, contentArea);
		this.toUnbind.push(this.sideBySideControl.addListener(SideBySideEventType.EDITOR_FOCUS_CHANGED, () => { this.onEditorFocusChanged(); }));

		// get settings
		this.memento = this.getMemento(this.storageService, MementoScope.WORKSPACE);

		return contentArea;
	}

	public restoreEditorState(inputsToOpen?: EditorInput[], options?: EditorOptions[]): TPromise<BaseEditor[]> {
		let activeInput: EditorInput;
		let inputsToRestore: EditorInput[];
		let widthRatios: number[];

		// Inputs are given, so just use them
		if (inputsToOpen && inputsToOpen.length) {
			if (inputsToOpen.length > 3) {
				inputsToOpen = inputsToOpen.slice(inputsToOpen.length - 3); // make sure to reduce the array to the last 3 elements if n > 3
			}

			inputsToRestore = inputsToOpen;
			widthRatios = (inputsToRestore.length === 3) ? [0.33, 0.33, 0.34] : (inputsToRestore.length === 2) ? [0.5, 0.5] : [1];
		}

		// Otherwise try to load from last session
		else if (this.memento[EDITOR_STATE_STORAGE_KEY]) {
			let editorState: IEditorState = this.memento[EDITOR_STATE_STORAGE_KEY];
			if (editorState && editorState.editors) {

				// Find inputs to restore
				let registry = (<IEditorRegistry>Registry.as(EditorExtensions.Editors));
				let inputs: EditorInput[] = [];

				widthRatios = editorState.widthRatio;

				for (let i = 0; i < editorState.editors.length; i++) {
					let state = editorState.editors[i];
					let factory = registry.getEditorInputFactory(state.inputId);
					if (factory && types.isString(state.inputValue)) {
						let input = factory.deserialize(this.instantiationService, state.inputValue);
						if (input) {
							if (state.hasFocus) {
								activeInput = input;
							}
							inputs.push(input);
						}
					}
				}

				if (inputs.length) {
					inputsToRestore = inputs;
				}
			}
		}

		// Do the restore
		if (inputsToRestore && inputsToRestore.length) {

			// Pick first input if we didnt find any active input from memento
			if (!activeInput && inputsToRestore.length) {
				activeInput = inputsToRestore[0];
			}

			// Reset width ratios if they dont match with the number of editors to restore
			if (widthRatios && widthRatios.length !== inputsToRestore.length) {
				widthRatios = inputsToRestore.length === 2 ? [0.5, 0.5] : null;
			}

			// Open editor inputs in parallel if any
			let promises: TPromise<BaseEditor>[] = [];
			inputsToRestore.forEach((input, index) => {
				let preserveFocus = (input !== activeInput);
				let option: EditorOptions;
				if (options && options[index]) {
					option = options[index];
					option.preserveFocus = preserveFocus;
				} else {
					option = EditorOptions.create({ preserveFocus: preserveFocus });
				}

				promises.push(this.openEditor(input, option, index, widthRatios));
			});

			return TPromise.join(promises).then(editors => {

				// Workaround for bad layout issue: If any of the editors fails to load, reset side by side by closing
				// all editors. This fixes an issue where a side editor might show, but no editor to the left hand side.
				if (this.getVisibleEditors().length !== inputsToRestore.length) {
					this.closeEditors().done(null, errors.onUnexpectedError);
				}

				// Full layout side by side
				this.sideBySideControl.layout(this.dimension);

				return editors;
			});
		}

		return TPromise.as([]);
	}

	public activateEditor(editor: BaseEditor): void {
		if (editor) {
			this.sideBySideControl.setActive(editor);
		}
	}

	private onEditorFocusChanged(): void {

		// Emit as editor input change event so that clients get aware of new active editor
		let activeEditor = this.sideBySideControl.getActiveEditor();
		if (activeEditor) {
			this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGING, new EditorEvent(activeEditor, activeEditor.getId(), activeEditor.input, null, activeEditor.position));
			this.emit(WorkbenchEventType.EDITOR_INPUT_CHANGED, new EditorEvent(activeEditor, activeEditor.getId(), activeEditor.input, null, activeEditor.position));
		}

		// Update Title Area
		this.updateEditorTitleArea();
	}

	public layout(dimension: Dimension): Dimension[] {

		// Pass to super
		let sizes = super.layout(dimension);

		// Pass to Side by Side Control
		this.dimension = sizes[1];
		this.sideBySideControl.layout(this.dimension);

		return sizes;
	}

	private onSetInputError(e: any, editor: BaseEditor, input: EditorInput, options: EditorOptions, position: Position): void {

		// only show an error if this was not us restoring previous error state
		if (this.partService.isCreated() && !errors.isPromiseCanceledError(e)) {
			let errorMessage = nls.localize('editorOpenError', "Unable to open '{0}': {1}.", input.getName(), errors.toErrorMessage(e));

			let error: any;
			if (e && (<IMessageWithAction>e).actions && (<IMessageWithAction>e).actions.length) {
				error = errors.create(errorMessage, { actions: (<IMessageWithAction>e).actions }); // Support error actions from thrower
			} else {
				error = errorMessage;
			}

			this.showError(error);
		}

		this.sideBySideControl.getProgressBar(position).done().getContainer().hide();
		this.emit(WorkbenchEventType.EDITOR_SET_INPUT_ERROR, new EditorEvent(editor, editor.getId(), input, options, position));
	}

	private showError(e: any): () => void {
		return this.messageService.show(Severity.Error, types.isString(e) ? new Error(e) : e);
	}

	public shutdown(): void {

		// Persist Editor State
		this.saveEditorState();

		// Unload all Instantiated Editors
		for (let i = 0; i < this.instantiatedEditors.length; i++) {
			for (let j = 0; j < this.instantiatedEditors[i].length; j++) {
				this.instantiatedEditors[i][j].shutdown();
			}
		}

		// Pass to super
		super.shutdown();
	}

	private saveEditorState(): void {
		let registry = (<IEditorRegistry>Registry.as(EditorExtensions.Editors));
		let editors = this.getVisibleEditors();
		let activeEditor = this.getActiveEditor();

		let widthRatios = this.sideBySideControl.getWidthRatios();
		let editorState: IEditorState = { editors: [], widthRatio: widthRatios };
		this.memento[EDITOR_STATE_STORAGE_KEY] = editorState;

		// For each visible editor
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];
			let input = editor.input;

			// Serialize through factory
			if (input) {
				let factory = registry.getEditorInputFactory(input.getId());
				if (factory) {
					let serialized = factory.serialize(input);
					editorState.editors.push({
						inputId: input.getId(),
						inputValue: serialized,
						hasFocus: activeEditor === editor
					});
				}
			}
		}
	}

	public dispose(): void {
		this.mapEditorToEditorContainers = null;
		this.mapActionsToEditors = null;

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

		// Input listeners
		for (let i = 0; i < this.visibleInputListeners.length; i++) {
			let listener = this.visibleInputListeners[i];
			if (listener) {
				listener();
			}

			this.visibleInputListeners = [];
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
}