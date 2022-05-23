/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EditorExtensions, EditorInputCapabilities, IEditorOpenContext, IVisibleEditorPane } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Dimension, show, hide } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorPaneRegistry, IEditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorProgressService, LongRunningOperation } from 'vs/platform/progress/common/progress';
import { IEditorGroupView, DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS } from 'vs/workbench/browser/parts/editor/editor';
import { assertIsDefined } from 'vs/base/common/types';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { ErrorPlaceholderEditor, IErrorEditorPlaceholderOptions, WorkspaceTrustRequiredPlaceholderEditor } from 'vs/workbench/browser/parts/editor/editorPlaceholder';
import { EditorOpenSource, IEditorOptions } from 'vs/platform/editor/common/editor';
import { isCancellationError } from 'vs/base/common/errors';
import { isErrorWithActions, toErrorMessage } from 'vs/base/common/errorMessage';
import { ILogService } from 'vs/platform/log/common/log';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export interface IOpenEditorResult {

	/**
	 * The editor pane used for opening. This can be a generic
	 * placeholder in certain cases, e.g. when workspace trust
	 * is required, or an editor fails to restore.
	 *
	 * Will be `undefined` if an error occurred while trying to
	 * open the editor and in cases where no placeholder is being
	 * used.
	 */
	readonly pane?: EditorPane;

	/**
	 * Whether the editor changed as a result of opening.
	 */
	readonly changed?: boolean;

	/**
	 * This property is set when an editor fails to restore and
	 * is shown with a generic place holder. It allows callers
	 * to still present the error to the user in that case.
	 */
	readonly error?: Error;

	/**
	 * This property indicates whether the open editor operation was
	 * cancelled or not. The operation may have been cancelled
	 * in case another editor open operation was triggered right
	 * after cancelling this one out.
	 */
	readonly cancelled?: boolean;
}

export class EditorPanes extends Disposable {

	//#region Events

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeSizeConstraints = this._register(new Emitter<{ width: number; height: number } | undefined>());
	readonly onDidChangeSizeConstraints = this._onDidChangeSizeConstraints.event;

	//#endregion

	get minimumWidth() { return this._activeEditorPane?.minimumWidth ?? DEFAULT_EDITOR_MIN_DIMENSIONS.width; }
	get minimumHeight() { return this._activeEditorPane?.minimumHeight ?? DEFAULT_EDITOR_MIN_DIMENSIONS.height; }
	get maximumWidth() { return this._activeEditorPane?.maximumWidth ?? DEFAULT_EDITOR_MAX_DIMENSIONS.width; }
	get maximumHeight() { return this._activeEditorPane?.maximumHeight ?? DEFAULT_EDITOR_MAX_DIMENSIONS.height; }

	private _activeEditorPane: EditorPane | null = null;
	get activeEditorPane(): IVisibleEditorPane | null { return this._activeEditorPane as IVisibleEditorPane | null; }

	private readonly editorPanes: EditorPane[] = [];

	private readonly activeEditorPaneDisposables = this._register(new DisposableStore());
	private dimension: Dimension | undefined;
	private readonly editorOperation = this._register(new LongRunningOperation(this.editorProgressService));
	private readonly editorPanesRegistry = Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane);

	constructor(
		private parent: HTMLElement,
		private groupView: IEditorGroupView,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.workspaceTrustService.onDidChangeTrust(() => this.onDidChangeWorkspaceTrust()));
	}

	private onDidChangeWorkspaceTrust() {

		// If the active editor pane requires workspace trust
		// we need to re-open it anytime trust changes to
		// account for it.
		// For that we explicitly call into the group-view
		// to handle errors properly.
		const editor = this._activeEditorPane?.input;
		const options = this._activeEditorPane?.options;
		if (editor?.hasCapability(EditorInputCapabilities.RequiresTrust)) {
			this.groupView.openEditor(editor, options);
		}
	}

	async openEditor(editor: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext = Object.create(null)): Promise<IOpenEditorResult> {
		try {
			return await this.doOpenEditor(this.getEditorPaneDescriptor(editor), editor, options, context);
		} catch (error) {

			// First check if caller instructed us to ignore error handling
			if (options?.ignoreError) {
				return { error };
			}

			// In case of an error when opening an editor, we still want to show
			// an editor in the desired location to preserve the user intent and
			// view state (e.g. when restoring).
			//
			// For that reason we have place holder editors that can convey a
			// message with actions the user can click on.

			return this.doShowError(error, editor, options, context);
		}
	}

	private async doShowError(error: Error, editor: EditorInput, options?: IEditorOptions, context?: IEditorOpenContext): Promise<IOpenEditorResult> {

		// Always log the error to figure out what is going on
		this.logService.error(error);

		// Show as modal dialog when explicit user action
		let errorHandled = false;
		if (options?.source === EditorOpenSource.USER) {

			// Extract possible error actions from the error
			let errorActions: readonly IAction[] | undefined = undefined;
			if (isErrorWithActions(error)) {
				errorActions = error.actions;
			}

			const buttons: string[] = [];
			if (errorActions && errorActions.length > 0) {
				for (const errorAction of errorActions) {
					buttons.push(errorAction.label);
				}
			} else {
				buttons.push(localize('ok', 'OK'));
			}

			let cancelId: number | undefined = undefined;
			if (buttons.length === 1) {
				buttons.push(localize('cancel', "Cancel"));
				cancelId = 1;
			}

			const result = await this.dialogService.show(
				Severity.Error,
				localize('editorOpenErrorDialog', "Unable to open '{0}'", editor.getName()),
				buttons,
				{
					detail: toErrorMessage(error),
					cancelId
				}
			);

			// Make sure to run any error action if present
			if (result.choice !== cancelId && errorActions) {
				const errorAction = errorActions[result.choice];
				if (errorAction) {
					const result = errorAction.run();
					if (result instanceof Promise) {
						result.catch(error => this.dialogService.show(Severity.Error, toErrorMessage(error)));
					}

					errorHandled = true; // consider the error as handled!
				}
			}
		}

		// Return early if the user dealt with the error already
		if (errorHandled) {
			return { error };
		}

		// Show as editor placeholder: pass over the error to display
		const editorPlaceholderOptions: IErrorEditorPlaceholderOptions = { ...options };
		if (!isCancellationError(error)) {
			editorPlaceholderOptions.error = error;
		}

		return {
			...(await this.doOpenEditor(ErrorPlaceholderEditor.DESCRIPTOR, editor, editorPlaceholderOptions, context)),
			error
		};
	}

	private async doOpenEditor(descriptor: IEditorPaneDescriptor, editor: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext = Object.create(null)): Promise<IOpenEditorResult> {

		// Editor pane
		const pane = this.doShowEditorPane(descriptor);

		// Apply input to pane
		const { changed, cancelled } = await this.doSetInput(pane, editor, options, context);

		// Focus unless cancelled
		if (!cancelled) {
			const focus = !options || !options.preserveFocus;
			if (focus) {
				pane.focus();
			}
		}

		return { pane, changed, cancelled };
	}

	private getEditorPaneDescriptor(editor: EditorInput): IEditorPaneDescriptor {
		if (editor.hasCapability(EditorInputCapabilities.RequiresTrust) && !this.workspaceTrustService.isWorkspaceTrusted()) {
			// Workspace trust: if an editor signals it needs workspace trust
			// but the current workspace is untrusted, we fallback to a generic
			// editor descriptor to indicate this an do NOT load the registered
			// editor.
			return WorkspaceTrustRequiredPlaceholderEditor.DESCRIPTOR;
		}

		return assertIsDefined(this.editorPanesRegistry.getEditorPane(editor));
	}

	private doShowEditorPane(descriptor: IEditorPaneDescriptor): EditorPane {

		// Return early if the currently active editor pane can handle the input
		if (this._activeEditorPane && descriptor.describes(this._activeEditorPane)) {
			return this._activeEditorPane;
		}

		// Hide active one first
		this.doHideActiveEditorPane();

		// Create editor pane
		const editorPane = this.doCreateEditorPane(descriptor);

		// Set editor as active
		this.doSetActiveEditorPane(editorPane);

		// Show editor
		const container = assertIsDefined(editorPane.getContainer());
		this.parent.appendChild(container);
		show(container);

		// Indicate to editor that it is now visible
		editorPane.setVisible(true, this.groupView);

		// Layout
		if (this.dimension) {
			editorPane.layout(this.dimension);
		}

		return editorPane;
	}

	private doCreateEditorPane(descriptor: IEditorPaneDescriptor): EditorPane {

		// Instantiate editor
		const editorPane = this.doInstantiateEditorPane(descriptor);

		// Create editor container as needed
		if (!editorPane.getContainer()) {
			const editorPaneContainer = document.createElement('div');
			editorPaneContainer.classList.add('editor-instance');

			editorPane.create(editorPaneContainer);
		}

		return editorPane;
	}

	private doInstantiateEditorPane(descriptor: IEditorPaneDescriptor): EditorPane {

		// Return early if already instantiated
		const existingEditorPane = this.editorPanes.find(editorPane => descriptor.describes(editorPane));
		if (existingEditorPane) {
			return existingEditorPane;
		}

		// Otherwise instantiate new
		const editorPane = this._register(descriptor.instantiate(this.instantiationService));
		this.editorPanes.push(editorPane);

		return editorPane;
	}

	private doSetActiveEditorPane(editorPane: EditorPane | null) {
		this._activeEditorPane = editorPane;

		// Clear out previous active editor pane listeners
		this.activeEditorPaneDisposables.clear();

		// Listen to editor pane changes
		if (editorPane) {
			this.activeEditorPaneDisposables.add(editorPane.onDidChangeSizeConstraints(e => this._onDidChangeSizeConstraints.fire(e)));
			this.activeEditorPaneDisposables.add(editorPane.onDidFocus(() => this._onDidFocus.fire()));
		}

		// Indicate that size constraints could have changed due to new editor
		this._onDidChangeSizeConstraints.fire(undefined);
	}

	private async doSetInput(editorPane: EditorPane, editor: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext): Promise<{ changed: boolean; cancelled: boolean }> {

		// If the input did not change, return early and only
		// apply the options unless the options instruct us to
		// force open it even if it is the same
		const inputMatches = editorPane.input?.matches(editor);
		if (inputMatches && !options?.forceReload) {
			editorPane.setOptions(options);

			return { changed: false, cancelled: false };
		}

		// Start a new editor input operation to report progress
		// and to support cancellation. Any new operation that is
		// started will cancel the previous one.
		const operation = this.editorOperation.start(this.layoutService.isRestored() ? 800 : 3200);

		let cancelled = false;
		try {

			// Clear the current input before setting new input
			// This ensures that a slow loading input will not
			// be visible for the duration of the new input to
			// load (https://github.com/microsoft/vscode/issues/34697)
			editorPane.clearInput();

			// Set the input to the editor pane
			await editorPane.setInput(editor, options, context, operation.token);

			if (!operation.isCurrent()) {
				cancelled = true;
			}
		} finally {
			operation.stop();
		}

		return { changed: !inputMatches, cancelled };
	}

	private doHideActiveEditorPane(): void {
		if (!this._activeEditorPane) {
			return;
		}

		// Stop any running operation
		this.editorOperation.stop();

		// Indicate to editor pane before removing the editor from
		// the DOM to give a chance to persist certain state that
		// might depend on still being the active DOM element.
		this._activeEditorPane.clearInput();
		this._activeEditorPane.setVisible(false, this.groupView);

		// Remove editor pane from parent
		const editorPaneContainer = this._activeEditorPane.getContainer();
		if (editorPaneContainer) {
			this.parent.removeChild(editorPaneContainer);
			hide(editorPaneContainer);
		}

		// Clear active editor pane
		this.doSetActiveEditorPane(null);
	}

	closeEditor(editor: EditorInput): void {
		if (this._activeEditorPane?.input && editor.matches(this._activeEditorPane.input)) {
			this.doHideActiveEditorPane();
		}
	}

	setVisible(visible: boolean): void {
		this._activeEditorPane?.setVisible(visible, this.groupView);
	}

	layout(dimension: Dimension): void {
		this.dimension = dimension;

		this._activeEditorPane?.layout(dimension);
	}
}
