/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dispose, Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { EditorInput, EditorOptions } from 'vs/workbench/common/editor';
import { Dimension, show, hide, addClass } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorRegistry, Extensions as EditorExtensions, IEditorDescriptor } from 'vs/workbench/browser/editor';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgressService, LongRunningOperation } from 'vs/platform/progress/common/progress';
import { IEditorGroupView, DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { Event, Emitter } from 'vs/base/common/event';

export interface IOpenEditorResult {
	readonly control: BaseEditor;
	readonly editorChanged: boolean;
}

export class EditorControl extends Disposable {

	get minimumWidth() { return this._activeControl ? this._activeControl.minimumWidth : DEFAULT_EDITOR_MIN_DIMENSIONS.width; }
	get minimumHeight() { return this._activeControl ? this._activeControl.minimumHeight : DEFAULT_EDITOR_MIN_DIMENSIONS.height; }
	get maximumWidth() { return this._activeControl ? this._activeControl.maximumWidth : DEFAULT_EDITOR_MAX_DIMENSIONS.width; }
	get maximumHeight() { return this._activeControl ? this._activeControl.maximumHeight : DEFAULT_EDITOR_MAX_DIMENSIONS.height; }

	private _onDidFocus: Emitter<void> = this._register(new Emitter<void>());
	get onDidFocus(): Event<void> { return this._onDidFocus.event; }

	private _onDidSizeConstraintsChange = this._register(new Emitter<{ width: number; height: number; } | undefined>());
	get onDidSizeConstraintsChange(): Event<{ width: number; height: number; } | undefined> { return this._onDidSizeConstraintsChange.event; }

	private _activeControl: BaseEditor | null;
	private controls: BaseEditor[] = [];

	private activeControlDisposeables: IDisposable[] = [];
	private dimension: Dimension;
	private editorOperation: LongRunningOperation;

	constructor(
		private parent: HTMLElement,
		private groupView: IEditorGroupView,
		@IPartService private readonly partService: IPartService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProgressService progressService: IProgressService
	) {
		super();

		this.editorOperation = this._register(new LongRunningOperation(progressService));
	}

	get activeControl() {
		return this._activeControl;
	}

	openEditor(editor: EditorInput, options?: EditorOptions): Promise<IOpenEditorResult> {

		// Editor control
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(editor);
		if (!descriptor) {
			throw new Error('No editor descriptor found');
		}
		const control = this.doShowEditorControl(descriptor);

		// Set input
		return this.doSetInput(control, editor, options || null).then((editorChanged => (({ control, editorChanged } as IOpenEditorResult))));
	}

	private doShowEditorControl(descriptor: IEditorDescriptor): BaseEditor {

		// Return early if the currently active editor control can handle the input
		if (this._activeControl && descriptor.describes(this._activeControl)) {
			return this._activeControl;
		}

		// Hide active one first
		this.doHideActiveEditorControl();

		// Create editor
		const control = this.doCreateEditorControl(descriptor);

		// Set editor as active
		this.doSetActiveControl(control);

		// Show editor
		this.parent.appendChild(control.getContainer());
		show(control.getContainer());

		// Indicate to editor that it is now visible
		control.setVisible(true, this.groupView);

		// Layout
		if (this.dimension) {
			control.layout(this.dimension);
		}

		return control;
	}

	private doCreateEditorControl(descriptor: IEditorDescriptor): BaseEditor {

		// Instantiate editor
		const control = this.doInstantiateEditorControl(descriptor);

		// Create editor container as needed
		if (!control.getContainer()) {
			const controlInstanceContainer = document.createElement('div');
			addClass(controlInstanceContainer, 'editor-instance');
			controlInstanceContainer.id = descriptor.getId();

			control.create(controlInstanceContainer);
		}

		return control;
	}

	private doInstantiateEditorControl(descriptor: IEditorDescriptor): BaseEditor {

		// Return early if already instantiated
		const existingControl = this.controls.filter(control => descriptor.describes(control))[0];
		if (existingControl) {
			return existingControl;
		}

		// Otherwise instantiate new
		const control = this._register(descriptor.instantiate(this.instantiationService));
		this.controls.push(control);

		return control;
	}

	private doSetActiveControl(control: BaseEditor | null) {
		this._activeControl = control;

		// Clear out previous active control listeners
		this.activeControlDisposeables = dispose(this.activeControlDisposeables);

		// Listen to control changes
		if (control) {
			this.activeControlDisposeables.push(control.onDidSizeConstraintsChange(e => this._onDidSizeConstraintsChange.fire(e)));
			this.activeControlDisposeables.push(control.onDidFocus(() => this._onDidFocus.fire()));
		}

		// Indicate that size constraints could have changed due to new editor
		this._onDidSizeConstraintsChange.fire(undefined);
	}

	private doSetInput(control: BaseEditor, editor: EditorInput, options: EditorOptions | null): Promise<boolean> {

		// If the input did not change, return early and only apply the options
		// unless the options instruct us to force open it even if it is the same
		const forceReload = options && options.forceReload;
		const inputMatches = control.input && control.input.matches(editor);
		if (inputMatches && !forceReload) {

			// Forward options
			control.setOptions(options);

			// Still focus as needed
			const focus = !options || !options.preserveFocus;
			if (focus) {
				control.focus();
			}

			return Promise.resolve(false);
		}

		// Show progress while setting input after a certain timeout. If the workbench is opening
		// be more relaxed about progress showing by increasing the delay a little bit to reduce flicker.
		const operation = this.editorOperation.start(this.partService.isRestored() ? 800 : 3200);

		// Call into editor control
		const editorWillChange = !inputMatches;
		return control.setInput(editor, options, operation.token).then(() => {

			// Focus (unless prevented or another operation is running)
			if (operation.isCurrent()) {
				const focus = !options || !options.preserveFocus;
				if (focus) {
					control.focus();
				}
			}

			// Operation done
			operation.stop();

			return editorWillChange;
		}, e => {

			// Operation done
			operation.stop();

			return Promise.reject(e);
		});
	}

	private doHideActiveEditorControl(): void {
		if (!this._activeControl) {
			return;
		}

		// Stop any running operation
		this.editorOperation.stop();

		// Remove control from parent and hide
		const controlInstanceContainer = this._activeControl.getContainer();
		this.parent.removeChild(controlInstanceContainer);
		hide(controlInstanceContainer);

		// Indicate to editor control
		this._activeControl.clearInput();
		this._activeControl.setVisible(false, this.groupView);

		// Clear active control
		this.doSetActiveControl(null);
	}

	closeEditor(editor: EditorInput): void {
		if (this._activeControl && editor.matches(this._activeControl.input)) {
			this.doHideActiveEditorControl();
		}
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		if (this._activeControl && this.dimension) {
			this._activeControl.layout(this.dimension);
		}
	}

	dispose(): void {
		this.activeControlDisposeables = dispose(this.activeControlDisposeables);

		super.dispose();
	}
}
