/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorplaceholder';
import { localize } from 'vs/nls';
import Severity from 'vs/base/common/severity';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Dimension, size, clearNode, $ } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { assertIsDefined, assertAllDefined } from 'vs/base/common/types';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceContextService, isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { EditorOpenSource, IEditorOptions } from 'vs/platform/editor/common/editor';
import { computeEditorAriaLabel, EditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Link } from 'vs/platform/opener/browser/link';
import { SimpleIconLabel } from 'vs/base/browser/ui/iconLabel/simpleIconLabel';
import { editorErrorForeground, editorInfoForeground, editorWarningForeground } from 'vs/platform/theme/common/colorRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { FileChangeType, FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { isErrorWithActions, toErrorMessage } from 'vs/base/common/errorMessage';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

export interface IEditorPlaceholderContents {
	icon: string;
	label: string;
	actions: IEditorPlaceholderContentsAction[];
}

export interface IEditorPlaceholderContentsAction {
	label: string;
	run: () => unknown;
}

export interface IErrorEditorPlaceholderOptions extends IEditorOptions {
	error?: Error;
}

export abstract class EditorPlaceholder extends EditorPane {

	private container: HTMLElement | undefined;
	private scrollbar: DomScrollableElement | undefined;
	private inputDisposable = this._register(new MutableDisposable());

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super(id, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {

		// Container
		this.container = document.createElement('div');
		this.container.className = 'monaco-editor-pane-placeholder';
		this.container.style.outline = 'none';
		this.container.tabIndex = 0; // enable focus support from the editor part (do not remove)

		// Custom Scrollbars
		this.scrollbar = this._register(new DomScrollableElement(this.container, { horizontal: ScrollbarVisibility.Auto, vertical: ScrollbarVisibility.Auto }));
		parent.appendChild(this.scrollbar.getDomNode());
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		// Check for cancellation
		if (token.isCancellationRequested) {
			return;
		}

		// Render Input
		this.inputDisposable.value = await this.renderInput(input, options);
	}

	private async renderInput(input: EditorInput, options: IEditorOptions | undefined): Promise<IDisposable> {
		const [container, scrollbar] = assertAllDefined(this.container, this.scrollbar);

		// Reset any previous contents
		clearNode(container);

		// Delegate to implementation for contents
		const disposables = new DisposableStore();
		const { icon, label, actions } = await this.getContents(input, options, disposables);

		// Icon
		const iconContainer = container.appendChild($('.editor-placeholder-icon-container'));
		const iconWidget = new SimpleIconLabel(iconContainer);
		iconWidget.text = icon;

		// Label
		const labelContainer = container.appendChild($('.editor-placeholder-label-container'));
		const labelWidget = document.createElement('span');
		labelWidget.textContent = label;
		labelContainer.appendChild(labelWidget);

		// ARIA label
		container.setAttribute('aria-label', `${computeEditorAriaLabel(input, undefined, this.group, undefined)}, ${label}`);

		// Actions
		const actionsContainer = container.appendChild($('.editor-placeholder-actions-container'));
		for (const action of actions) {
			disposables.add(this.instantiationService.createInstance(Link, actionsContainer, {
				label: action.label,
				href: ''
			}, {
				opener: () => action.run()
			}));
		}

		// Adjust scrollbar
		scrollbar.scanDomNode();

		return disposables;
	}

	protected abstract getContents(input: EditorInput, options: IEditorOptions | undefined, disposables: DisposableStore): Promise<IEditorPlaceholderContents>;

	override clearInput(): void {
		if (this.container) {
			clearNode(this.container);
		}

		this.inputDisposable.clear();

		super.clearInput();
	}

	layout(dimension: Dimension): void {
		const [container, scrollbar] = assertAllDefined(this.container, this.scrollbar);

		// Pass on to Container
		size(container, dimension.width, dimension.height);

		// Adjust scrollbar
		scrollbar.scanDomNode();

		// Toggle responsive class
		container.classList.toggle('max-height-200px', dimension.height <= 200);
	}

	override focus(): void {
		const container = assertIsDefined(this.container);

		container.focus();
	}

	override dispose(): void {
		this.container?.remove();

		super.dispose();
	}
}

export class WorkspaceTrustRequiredPlaceholderEditor extends EditorPlaceholder {

	static readonly ID = 'workbench.editors.workspaceTrustRequiredEditor';
	private static readonly LABEL = localize('trustRequiredEditor', "Workspace Trust Required");

	static readonly DESCRIPTOR = EditorPaneDescriptor.create(WorkspaceTrustRequiredPlaceholderEditor, WorkspaceTrustRequiredPlaceholderEditor.ID, WorkspaceTrustRequiredPlaceholderEditor.LABEL);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(WorkspaceTrustRequiredPlaceholderEditor.ID, telemetryService, themeService, storageService, instantiationService);
	}

	override getTitle(): string {
		return WorkspaceTrustRequiredPlaceholderEditor.LABEL;
	}

	protected async getContents(): Promise<IEditorPlaceholderContents> {
		return {
			icon: '$(workspace-untrusted)',
			label: isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceService.getWorkspace())) ?
				localize('requiresFolderTrustText', "The file is not displayed in the editor because trust has not been granted to the folder.") :
				localize('requiresWorkspaceTrustText', "The file is not displayed in the editor because trust has not been granted to the workspace."),
			actions: [
				{
					label: localize('manageTrust', "Manage Workspace Trust"),
					run: () => this.commandService.executeCommand('workbench.trust.manage')
				}
			]
		};
	}
}

export class ErrorPlaceholderEditor extends EditorPlaceholder {

	private static readonly ID = 'workbench.editors.errorEditor';
	private static readonly LABEL = localize('errorEditor', "Error Editor");

	static readonly DESCRIPTOR = EditorPaneDescriptor.create(ErrorPlaceholderEditor, ErrorPlaceholderEditor.ID, ErrorPlaceholderEditor.LABEL);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super(ErrorPlaceholderEditor.ID, telemetryService, themeService, storageService, instantiationService);
	}

	protected async getContents(input: EditorInput, options: IErrorEditorPlaceholderOptions, disposables: DisposableStore): Promise<IEditorPlaceholderContents> {
		const resource = input.resource;
		const group = this.group;
		const error = options.error;
		const isFileNotFound = (<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND;

		// Error Label
		let label: string;
		if (isFileNotFound) {
			label = localize('unavailableResourceErrorEditorText', "The editor could not be opened because the file was not found.");
		} else if (error) {
			label = localize('unknownErrorEditorTextWithError', "The editor could not be opened due to an unexpected error: {0}", toErrorMessage(error));
		} else {
			label = localize('unknownErrorEditorTextWithoutError', "The editor could not be opened due to an unexpected error.");
		}

		// Actions
		let actions: IEditorPlaceholderContentsAction[] | undefined = undefined;
		if (isErrorWithActions(error) && error.actions.length > 0) {
			actions = error.actions.map(action => {
				return {
					label: action.label,
					run: () => {
						const result = action.run();
						if (result instanceof Promise) {
							result.catch(error => this.dialogService.show(Severity.Error, toErrorMessage(error)));
						}
					}
				};
			});
		} else if (group) {
			actions = [
				{
					label: localize('retry', "Try Again"),
					run: () => group.openEditor(input, { ...options, source: EditorOpenSource.USER /* explicit user gesture */ })
				}
			];
		}

		// Auto-reload when file is added
		if (group && isFileNotFound && resource && this.fileService.hasProvider(resource)) {
			disposables.add(this.fileService.onDidFilesChange(e => {
				if (e.contains(resource, FileChangeType.ADDED, FileChangeType.UPDATED)) {
					group.openEditor(input, options);
				}
			}));
		}

		return { icon: '$(error)', label, actions: actions ?? [] };
	}
}

registerThemingParticipant((theme, collector) => {

	// Editor Placeholder Error Icon
	const editorErrorIconForegroundColor = theme.getColor(editorErrorForeground);
	if (editorErrorIconForegroundColor) {
		collector.addRule(`
		.monaco-editor-pane-placeholder .editor-placeholder-icon-container ${Codicon.error.cssSelector} {
			color: ${editorErrorIconForegroundColor};
		}`);
	}

	// Editor Placeholder Warning Icon
	const editorWarningIconForegroundColor = theme.getColor(editorWarningForeground);
	if (editorWarningIconForegroundColor) {
		collector.addRule(`
		.monaco-editor-pane-placeholder .editor-placeholder-icon-container ${Codicon.warning.cssSelector} {
			color: ${editorWarningIconForegroundColor};
		}`);
	}

	// Editor Placeholder Info/Trust Icon
	const editorInfoIconForegroundColor = theme.getColor(editorInfoForeground);
	if (editorInfoIconForegroundColor) {
		collector.addRule(`
		.monaco-editor-pane-placeholder .editor-placeholder-icon-container ${Codicon.info.cssSelector},
		.monaco-editor-pane-placeholder .editor-placeholder-icon-container ${Codicon.workspaceUntrusted.cssSelector} {
			color: ${editorInfoIconForegroundColor};
		}`);
	}
});
