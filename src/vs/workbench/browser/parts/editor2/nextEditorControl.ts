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

	private _activeEditor: BaseEditor;
	private instantiatedEditors: BaseEditor[] = [];

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

	get activeEditor(): BaseEditor {
		return this._activeEditor;
	}

	openEditor(input: EditorInput, options?: EditorOptions): IOpenEditorResult {

		// Token and progress monitor
		const editorOpenToken = ++this.editorOpenToken;
		const progressDelay = this.partService.isCreated() ? 800 : 3200; // reduce chance of showing progress right on startup
		const monitor = new ProgressMonitor(editorOpenToken, TPromise.timeout(progressDelay).then(() => {
			if (editorOpenToken === this.editorOpenToken) {
				return this.progressService.show(true);
			}

			return null;
		}));

		// Editor widget
		const editor = this.doShowEditor(input, options);

		// Set input
		let whenInputSet: TPromise<boolean>;
		if (editor) {
			whenInputSet = this.doSetInput(editor, input, options, monitor);
		} else {
			whenInputSet = TPromise.as(false);
		}

		return { editor, whenInputSet };
	}

	private doShowEditor(input: EditorInput, options: EditorOptions): BaseEditor {
		const descriptor = Registry.as<IEditorRegistry>(EditorExtensions.Editors).getEditor(input);

		// Return early if the currently active editor can handle the input
		if (this._activeEditor && descriptor.describes(this._activeEditor)) {
			return this._activeEditor;
		}

		// Hide active one first
		this.doHideActiveEditor();

		// Create editor
		const editor = this.doCreateEditor(descriptor);

		// Remember editor as active
		this._activeEditor = editor;

		// Show editor
		this.parent.appendChild(editor.getContainer());
		show(editor.getContainer());

		// Indicate to editor that it is now visible
		editor.setVisible(true, this.group.id /* TODO@grid use group id instead of position */);

		// Layout
		editor.layout(this.dimension);

		return editor;
	}

	private doCreateEditor(descriptor: IEditorDescriptor): BaseEditor {

		// Instantiate editor
		const editor = this.doInstantiateEditor(descriptor);

		// Create editor container as needed
		if (!editor.getContainer()) {
			const editorInstanceContainer = document.createElement('div');
			editorInstanceContainer.id = descriptor.getId();

			editor.create(editorInstanceContainer);
		}

		return editor;
	}

	private doInstantiateEditor(descriptor: IEditorDescriptor): BaseEditor {

		// Return early if already instantiated
		const instantiatedEditor = this.instantiatedEditors.filter(e => descriptor.describes(e))[0];
		if (instantiatedEditor) {
			return instantiatedEditor;
		}

		// Otherwise instantiate new
		const editor = descriptor.instantiate(this.instantiationService);
		this.instantiatedEditors.push(editor);

		return editor;
	}

	private doSetInput(editor: BaseEditor, input: EditorInput, options: EditorOptions, monitor: ProgressMonitor): TPromise<boolean> {
		const previousInput = editor.input;
		const inputChanged = (!previousInput || !previousInput.matches(input) || (options && options.forceOpen));

		// Call into editor
		return editor.setInput(input, options).then(() => {

			// Progress done
			monitor.done();

			// Focus (unless prevented)
			const focus = !options || !options.preserveFocus;
			if (focus) {
				editor.focus();
			}

			return inputChanged;
		}, e => {

			// Progress done
			monitor.done();

			// Error handling
			this.doHandleSetInputError(e, editor, input, options, monitor);

			return null;
		});
	}

	private doHandleSetInputError(error: Error, editor: BaseEditor, input: EditorInput, options: EditorOptions, monitor: ProgressMonitor): void {

		// Report error only if this was not us restoring previous error state or
		// we are told to ignore errors that occur from opening an editor
		if (this.partService.isCreated() && !isPromiseCanceledError(error) /* && TODO@grid !this.ignoreOpenEditorErrors */) {
			const actions: INotificationActions = { primary: [] };
			if (isErrorWithActions(error)) {
				actions.primary = (error as IErrorWithActions).actions;
			}

			const handle = this.notificationService.notify({
				severity: Severity.Error,
				message: localize('editorOpenError', "Unable to open '{0}': {1}.", input.getName(), toErrorMessage(error)),
				actions
			});

			once(handle.onDidClose)(() => dispose(actions.primary));
		}
	}

	private doHideActiveEditor(): void {
		if (!this._activeEditor) {
			return;
		}

		// Remove control from parent and hide
		const editorInstanceContainer = this._activeEditor.getContainer();
		this.parent.removeChild(editorInstanceContainer);
		hide(editorInstanceContainer);

		// Indicate to editor
		this._activeEditor.clearInput();
		this._activeEditor.setVisible(false);

		// Clear active editor
		this._activeEditor = null;
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		if (this._activeEditor) {
			this._activeEditor.layout(this.dimension);
		}
	}

	shutdown(): void {

		// Forward to all editors
		this.instantiatedEditors.forEach(editor => editor.shutdown());
	}

	dispose(): void {

		// Forward to all editors
		this.instantiatedEditors = dispose(this.instantiatedEditors);

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