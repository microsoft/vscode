/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable, dispose } from 'vs/base/common/lifecycle';
import { EditorInput, EditorOptions, IEditorGroup } from 'vs/workbench/common/editor';
import { IOpenEditorResult } from 'vs/workbench/services/editor/common/nextEditorGroupsService';
import { Dimension, show, hide } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorRegistry, Extensions as EditorExtensions, IEditorDescriptor } from 'vs/workbench/browser/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { isPromiseCanceledError, isErrorWithActions, IErrorWithActions } from 'vs/base/common/errors';
import { INotificationActions, INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { once } from 'vs/base/common/event';
import { IProgressService, IProgressRunner } from 'vs/platform/progress/common/progress';

export class NextEditorControl extends Disposable {
	private dimension: Dimension;
	private editorOpenToken: number = 0;

	private _activeControl: BaseEditor;
	private controls: BaseEditor[] = [];

	constructor(
		private parent: HTMLElement,
		private group: IEditorGroup,
		@IPartService private partService: IPartService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@INotificationService private notificationService: INotificationService,
		@IProgressService private progressService: IProgressService
	) {
		super();
	}

	get activeControl(): BaseEditor {
		return this._activeControl;
	}

	openEditor(editor: EditorInput, options?: EditorOptions): IOpenEditorResult {

		// Token and progress monitor
		const editorOpenToken = ++this.editorOpenToken;
		const progressDelay = this.partService.isCreated() ? 800 : 3200; // reduce chance of showing progress right on startup
		const monitor = new ProgressMonitor(editorOpenToken, TPromise.timeout(progressDelay).then(() => {
			if (editorOpenToken === this.editorOpenToken) {
				return this.progressService.show(true);
			}

			return null;
		}));

		// Editor control
		const control = this.doShowEditor(editor, options);

		// Set input
		let whenOpened: TPromise<boolean>;
		if (control) {
			whenOpened = this.doSetInput(control, editor, options, monitor);
		} else {
			whenOpened = TPromise.as(false);
		}

		return { control: control, whenOpened };
	}

	private doShowEditor(editor: EditorInput, options: EditorOptions): BaseEditor {
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(editor);

		// Return early if the currently active editor control can handle the input
		if (this._activeControl && descriptor.describes(this._activeControl)) {
			return this._activeControl;
		}

		// Hide active one first
		this.doHideActiveEditor();

		// Create editor
		const control = this.doCreateEditorControl(descriptor);

		// Remember editor as active
		this._activeControl = control;

		// Show editor
		this.parent.appendChild(control.getContainer());
		show(control.getContainer());

		// Indicate to editor that it is now visible
		control.setVisible(true, this.group.id /* TODO@grid use group id instead of position */);

		// Layout
		control.layout(this.dimension);

		return control;
	}

	private doCreateEditorControl(descriptor: IEditorDescriptor): BaseEditor {

		// Instantiate editor
		const control = this.doInstantiateEditorControl(descriptor);

		// Create editor container as needed
		if (!control.getContainer()) {
			const controlInstanceContainer = document.createElement('div');
			controlInstanceContainer.id = descriptor.getId();

			control.create(controlInstanceContainer);
		}

		return control;
	}

	private doInstantiateEditorControl(descriptor: IEditorDescriptor): BaseEditor {

		// Return early if already instantiated
		const existingControl = this.controls.filter(e => descriptor.describes(e))[0];
		if (existingControl) {
			return existingControl;
		}

		// Otherwise instantiate new
		const control = descriptor.instantiate(this.instantiationService);
		this.controls.push(control);

		return control;
	}

	private doSetInput(control: BaseEditor, editor: EditorInput, options: EditorOptions, monitor: ProgressMonitor): TPromise<boolean> {
		const previousEditor = control.input;
		const editorChanged = (!previousEditor || !previousEditor.matches(editor) || (options && options.forceOpen));

		// Call into editor control
		return control.setInput(editor, options).then(() => {

			// Progress done
			monitor.done();

			// Focus (unless prevented)
			const focus = !options || !options.preserveFocus;
			if (focus) {
				control.focus();
			}

			return editorChanged;
		}, e => {

			// Progress done
			monitor.done();

			// Error handling
			this.doHandleSetInputError(e, control, editor, options, monitor);

			return null;
		});
	}

	private doHandleSetInputError(error: Error, control: BaseEditor, editor: EditorInput, options: EditorOptions, monitor: ProgressMonitor): void {

		// Report error only if this was not us restoring previous error state or
		// we are told to ignore errors that occur from opening an editor
		if (this.partService.isCreated() && !isPromiseCanceledError(error) /* && TODO@grid !this.ignoreOpenEditorErrors */) {
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
	}

	private doHideActiveEditor(): void {
		if (!this._activeControl) {
			return;
		}

		// Remove control from parent and hide
		const controlInstanceContainer = this._activeControl.getContainer();
		this.parent.removeChild(controlInstanceContainer);
		hide(controlInstanceContainer);

		// Indicate to editor control
		this._activeControl.clearInput();
		this._activeControl.setVisible(false);

		// Clear active control
		this._activeControl = null;
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		if (this._activeControl) {
			this._activeControl.layout(this.dimension);
		}
	}

	shutdown(): void {

		// Forward to all editor controls
		this.controls.forEach(editor => editor.shutdown());
	}

	dispose(): void {

		// Forward to all editor controls
		this.controls = dispose(this.controls);

		super.dispose();
	}
}

class ProgressMonitor {
	private isDone: boolean;
	private runner: IProgressRunner;

	constructor(
		private _token: number,
		private progressPromise: TPromise<IProgressRunner>
	) {
		progressPromise.then(runner => this.runner = runner, () => void 0 /* ignore cancellation */);
	}

	get token(): number {
		return this._token;
	}

	cancel(): void {
		this.done();
	}

	done(): void {
		if (!this.isDone) {
			this.isDone = true;

			this.progressPromise.cancel();

			if (this.runner) {
				this.runner.done();
			}
		}
	}
}