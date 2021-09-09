/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
import { Emitter } from 'vs/base/common/event';
import { assertIsDefined } from 'vs/base/common/types';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { UnavailableResourceErrorEditor, UnknownErrorEditor, WorkspaceTrustRequiredEditor } from 'vs/workbench/browser/parts/editor/editorPlaceholder';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';

export interface IOpenEditorResult {

	/**
	 * The editor pane used for opening. This can be a generic
	 * placeholder in certain cases, e.g. when workspace trust
	 * is required, or an editor fails to restore.
	 *
	 * Will be `undefined` if an error occured while trying to
	 * open the editor and in cases where no placeholder is being
	 * used.
	 */
	readonly editorPane?: EditorPane;

	/**
	 * Whether the editor changed as a result of opening.
	 */
	readonly editorChanged?: boolean;

	/**
	 * This property is set when an editor fails to restore and
	 * is shown with a generic place holder. It allows callers
	 * to still present the error to the user in that case.
	 */
	readonly error?: Error;
}

export class EditorPanes extends Disposable {

	//#region Events

	private readonly _onDidFocus = this._register(new Emitter<void>());
	readonly onDidFocus = this._onDidFocus.event;

	private _onDidChangeSizeConstraints = this._register(new Emitter<{ width: number; height: number; } | undefined>());
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
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService
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
			if (!context.newInGroup) {
				const isUnavailableResource = (<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND;
				const editorPlaceholder = isUnavailableResource ? UnavailableResourceErrorEditor.DESCRIPTOR : UnknownErrorEditor.DESCRIPTOR;

				// The editor is restored (as opposed to being newly opened) and as
				// such we want to preserve the fact that an editor was opened here
				// before by falling back to a editor placeholder that allows the
				// user to retry the operation.
				//
				// This is especially important when an editor is dirty and fails to
				// restore after a restart to prevent the impression that any user
				// data is lost.
				//
				// Related: https://github.com/microsoft/vscode/issues/110062
				return {
					...(await this.doOpenEditor(editorPlaceholder, editor, options, context)),
					error
				};
			}

			return { error };
		}
	}

	private async doOpenEditor(descriptor: IEditorPaneDescriptor, editor: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext = Object.create(null)): Promise<IOpenEditorResult> {

		// Editor pane
		const editorPane = this.doShowEditorPane(descriptor);

		// Apply input to pane
		const editorChanged = await this.doSetInput(editorPane, editor, options, context);
		return { editorPane, editorChanged };
	}

	private getEditorPaneDescriptor(editor: EditorInput): IEditorPaneDescriptor {
		if (editor.hasCapability(EditorInputCapabilities.RequiresTrust) && !this.workspaceTrustService.isWorkspaceTrusted()) {
			// Workspace trust: if an editor signals it needs workspace trust
			// but the current workspace is untrusted, we fallback to a generic
			// editor descriptor to indicate this an do NOT load the registered
			// editor.
			return WorkspaceTrustRequiredEditor.DESCRIPTOR;
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

	private async doSetInput(editorPane: EditorPane, editor: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext): Promise<boolean> {

		// If the input did not change, return early and only apply the options
		// unless the options instruct us to force open it even if it is the same
		const forceReload = options?.forceReload;
		const inputMatches = editorPane.input && editorPane.input.matches(editor);
		if (inputMatches && !forceReload) {

			// Forward options
			editorPane.setOptions(options);

			// Still focus as needed
			const focus = !options || !options.preserveFocus;
			if (focus) {
				editorPane.focus();
			}

			return false;
		}

		// Show progress while setting input after a certain timeout. If the workbench is opening
		// be more relaxed about progress showing by increasing the delay a little bit to reduce flicker.
		const operation = this.editorOperation.start(this.layoutService.isRestored() ? 800 : 3200);

		// Call into editor pane
		const editorWillChange = !inputMatches;
		try {
			await editorPane.setInput(editor, options, context, operation.token);

			// Focus (unless prevented or another operation is running)
			if (operation.isCurrent()) {
				const focus = !options || !options.preserveFocus;
				if (focus) {
					editorPane.focus();
				}
			}

			return editorWillChange;
		} finally {
			operation.stop();
		}
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
		if (this._activeEditorPane && this._activeEditorPane.input && editor.matches(this._activeEditorPane.input)) {
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
