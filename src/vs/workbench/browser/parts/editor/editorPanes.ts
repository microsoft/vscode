/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EditorExtensions, EditorInputCapabilities, IEditorOpenContext, IVisibleEditorPane, isEditorOpenError } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { Dimension, show, hide, IDomNodePagePosition, isAncestor, getActiveElement, getWindowById } from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEditorPaneRegistry, IEditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IEditorProgressService, LongRunningOperation } from 'vs/platform/progress/common/progress';
import { IEditorGroupView, DEFAULT_EDITOR_MIN_DIMENSIONS, DEFAULT_EDITOR_MAX_DIMENSIONS, IInternalEditorOpenOptions } from 'vs/workbench/browser/parts/editor/editor';
import { assertIsDefined } from 'vs/base/common/types';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { ErrorPlaceholderEditor, IErrorEditorPlaceholderOptions, WorkspaceTrustRequiredPlaceholderEditor } from 'vs/workbench/browser/parts/editor/editorPlaceholder';
import { EditorOpenSource, IEditorOptions } from 'vs/platform/editor/common/editor';
import { isCancellationError } from 'vs/base/common/errors';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ILogService } from 'vs/platform/log/common/log';
import { IDialogService, IPromptButton, IPromptCancelButton } from 'vs/platform/dialogs/common/dialogs';
import { IBoundarySashes } from 'vs/base/browser/ui/sash/sash';
import { IHostService } from 'vs/workbench/services/host/browser/host';

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
	private pagePosition: IDomNodePagePosition | undefined;
	private boundarySashes: IBoundarySashes | undefined;
	private readonly editorOperation = this._register(new LongRunningOperation(this.editorProgressService));
	private readonly editorPanesRegistry = Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane);

	constructor(
		private readonly editorGroupParent: HTMLElement,
		private readonly editorPanesParent: HTMLElement,
		private readonly groupView: IEditorGroupView,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorProgressService private readonly editorProgressService: IEditorProgressService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@ILogService private readonly logService: ILogService,
		@IDialogService private readonly dialogService: IDialogService,
		@IHostService private readonly hostService: IHostService
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

	async openEditor(editor: EditorInput, options: IEditorOptions | undefined, internalOptions: IInternalEditorOpenOptions | undefined, context: IEditorOpenContext = Object.create(null)): Promise<IOpenEditorResult> {
		try {
			return await this.doOpenEditor(this.getEditorPaneDescriptor(editor), editor, options, internalOptions, context);
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

			return this.doShowError(error, editor, options, internalOptions, context);
		}
	}

	private async doShowError(error: Error, editor: EditorInput, options: IEditorOptions | undefined, internalOptions: IInternalEditorOpenOptions | undefined, context?: IEditorOpenContext): Promise<IOpenEditorResult> {

		// Always log the error to figure out what is going on
		this.logService.error(error);

		// Show as modal dialog when explicit user action unless disabled
		let errorHandled = false;
		if (options?.source === EditorOpenSource.USER && (!isEditorOpenError(error) || error.allowDialog)) {
			errorHandled = await this.doShowErrorDialog(error, editor);
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
			...(await this.doOpenEditor(ErrorPlaceholderEditor.DESCRIPTOR, editor, editorPlaceholderOptions, internalOptions, context)),
			error
		};
	}

	private async doShowErrorDialog(error: Error, editor: EditorInput): Promise<boolean> {
		let severity = Severity.Error;
		let message: string | undefined = undefined;
		let detail: string | undefined = toErrorMessage(error);
		let errorActions: readonly IAction[] | undefined = undefined;

		if (isEditorOpenError(error)) {
			errorActions = error.actions;
			severity = error.forceSeverity ?? Severity.Error;
			if (error.forceMessage) {
				message = error.message;
				detail = undefined;
			}
		}

		if (!message) {
			message = localize('editorOpenErrorDialog', "Unable to open '{0}'", editor.getName());
		}

		const buttons: IPromptButton<IAction | undefined>[] = [];
		if (errorActions && errorActions.length > 0) {
			for (const errorAction of errorActions) {
				buttons.push({
					label: errorAction.label,
					run: () => errorAction
				});
			}
		} else {
			buttons.push({
				label: localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK"),
				run: () => undefined
			});
		}

		let cancelButton: IPromptCancelButton<undefined> | undefined = undefined;
		if (buttons.length === 1) {
			cancelButton = {
				run: () => {
					errorHandled = true; // treat cancel as handled and do not show placeholder

					return undefined;
				}
			};
		}

		let errorHandled = false;  // by default, show placeholder

		const { result } = await this.dialogService.prompt({
			type: severity,
			message,
			detail,
			buttons,
			cancelButton
		});

		if (result) {
			const errorActionResult = result.run();
			if (errorActionResult instanceof Promise) {
				errorActionResult.catch(error => this.dialogService.error(toErrorMessage(error)));
			}

			errorHandled = true; // treat custom error action as handled and do not show placeholder
		}

		return errorHandled;
	}

	private async doOpenEditor(descriptor: IEditorPaneDescriptor, editor: EditorInput, options: IEditorOptions | undefined, internalOptions: IInternalEditorOpenOptions | undefined, context: IEditorOpenContext = Object.create(null)): Promise<IOpenEditorResult> {

		// Editor pane
		const pane = this.doShowEditorPane(descriptor);

		// Remember current active element for deciding to restore focus later
		const activeElement = getActiveElement();

		// Apply input to pane
		const { changed, cancelled } = await this.doSetInput(pane, editor, options, context);

		// Make sure to pass focus to the pane or otherwise
		// make sure that the pane window is visible unless
		// this has been explicitly disabled.
		if (!cancelled) {
			const focus = !options || !options.preserveFocus;
			if (focus && this.shouldRestoreFocus(activeElement)) {
				pane.focus();
			} else if (!internalOptions?.preserveWindowOrder) {
				this.hostService.moveTop(getWindowById(this.groupView.windowId, true).window);
			}
		}

		return { pane, changed, cancelled };
	}

	private shouldRestoreFocus(expectedActiveElement: Element | null): boolean {
		if (!this.layoutService.isRestored()) {
			return true; // restore focus if we are not restored yet on startup
		}

		if (!expectedActiveElement) {
			return true; // restore focus if nothing was focused
		}

		const activeElement = getActiveElement();
		if (!activeElement || activeElement === expectedActiveElement.ownerDocument.body) {
			return true; // restore focus if nothing is focused currently
		}

		const same = expectedActiveElement === activeElement;
		if (same) {
			return true; // restore focus if same element is still active
		}

		if (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {

			// This is to avoid regressions from not restoring focus as we used to:
			// Only allow a different input element (or textarea) to remain focused
			// but not other elements that do not accept text input.

			return true;
		}

		if (isAncestor(activeElement, this.editorGroupParent)) {
			return true; // restore focus if active element is still inside our editor group
		}

		return false; // do not restore focus
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
		this.editorPanesParent.appendChild(container);
		show(container);

		// Indicate to editor that it is now visible
		editorPane.setVisible(true);

		// Layout
		if (this.pagePosition) {
			editorPane.layout(new Dimension(this.pagePosition.width, this.pagePosition.height), { top: this.pagePosition.top, left: this.pagePosition.left });
		}

		// Boundary sashes
		if (this.boundarySashes) {
			editorPane.setBoundarySashes(this.boundarySashes);
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

			// It is cruicial to append the container to its parent before
			// passing on to the create() method of the pane so that the
			// right `window` can be determined in floating window cases.
			this.editorPanesParent.appendChild(editorPaneContainer);

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
		const editorPane = this._register(descriptor.instantiate(this.instantiationService, this.groupView));
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
		} catch (error) {
			if (!operation.isCurrent()) {
				cancelled = true;
			} else {
				throw error;
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
		this.safeRun(() => this._activeEditorPane?.clearInput());
		this.safeRun(() => this._activeEditorPane?.setVisible(false));

		// Remove editor pane from parent
		const editorPaneContainer = this._activeEditorPane.getContainer();
		if (editorPaneContainer) {
			editorPaneContainer.remove();
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
		this.safeRun(() => this._activeEditorPane?.setVisible(visible));
	}

	layout(pagePosition: IDomNodePagePosition): void {
		this.pagePosition = pagePosition;

		this.safeRun(() => this._activeEditorPane?.layout(new Dimension(pagePosition.width, pagePosition.height), pagePosition));
	}

	setBoundarySashes(sashes: IBoundarySashes): void {
		this.boundarySashes = sashes;

		this.safeRun(() => this._activeEditorPane?.setBoundarySashes(sashes));
	}

	private safeRun(fn: () => void): void {

		// We delegate many calls to the active editor pane which
		// can be any kind of editor. We must ensure that our calls
		// do not throw, for example in `layout()` because that can
		// mess with the grid layout.

		try {
			fn();
		} catch (error) {
			this.logService.error(error);
		}
	}
}
