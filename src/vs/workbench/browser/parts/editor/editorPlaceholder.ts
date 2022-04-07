/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/editorplaceholder';
import { localize } from 'vs/nls';
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

export interface IEditorPlaceholderContents {
	icon: string;
	label: string;
	actions: ReadonlyArray<{ label: string; run: () => unknown }>;
}

export abstract class EditorPlaceholderPane extends EditorPane {

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

		// Update ARIA label
		container.setAttribute('aria-label', computeEditorAriaLabel(input, undefined, this.group, undefined));

		// Delegate to implementation for contents
		const disposables = new DisposableStore();
		const { icon, label, actions } = await this.getContents(input, options);

		// Icon
		const iconContainer = container.appendChild($('.editor-placeholder-icon-container'));
		const iconWidget = new SimpleIconLabel(iconContainer);
		iconWidget.text = icon;

		// Label
		const labelContainer = container.appendChild($('.editor-placeholder-label-container'));
		const labelWidget = document.createElement('span');
		labelWidget.textContent = label;
		labelContainer.appendChild(labelWidget);

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

	protected abstract getContents(input: EditorInput, options: IEditorOptions | undefined): Promise<IEditorPlaceholderContents>;

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

export class WorkspaceTrustRequiredEditor extends EditorPlaceholderPane {

	static readonly ID = 'workbench.editors.workspaceTrustRequiredEditor';
	private static readonly LABEL = localize('trustRequiredEditor', "Workspace Trust Required");

	static readonly DESCRIPTOR = EditorPaneDescriptor.create(WorkspaceTrustRequiredEditor, WorkspaceTrustRequiredEditor.ID, WorkspaceTrustRequiredEditor.LABEL);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(WorkspaceTrustRequiredEditor.ID, telemetryService, themeService, storageService, instantiationService);
	}

	override getTitle(): string {
		return WorkspaceTrustRequiredEditor.LABEL;
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

abstract class AbstractErrorEditor extends EditorPlaceholderPane {

	constructor(
		id: string,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(id, telemetryService, themeService, storageService, instantiationService);
	}

	protected abstract getErrorMessage(): string;

	protected async getContents(): Promise<IEditorPlaceholderContents> {
		const group = this.group;
		const input = this.input;

		return {
			icon: '$(error)',
			label: this.getErrorMessage(),
			actions: group && input ? [
				{
					label: localize('retry', "Try Again"),
					run: () => group.openEditor(input, { ...this.options, source: EditorOpenSource.USER /* explicit user gesture */ })
				}
			] : []
		};
	}
}

export class UnknownErrorEditor extends AbstractErrorEditor {

	private static readonly ID = 'workbench.editors.unknownErrorEditor';
	private static readonly LABEL = localize('unknownErrorEditor', "Unknown Error Editor");

	static readonly DESCRIPTOR = EditorPaneDescriptor.create(UnknownErrorEditor, UnknownErrorEditor.ID, UnknownErrorEditor.LABEL);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(UnknownErrorEditor.ID, telemetryService, themeService, storageService, instantiationService);
	}

	override getTitle(): string {
		return UnknownErrorEditor.LABEL;
	}

	protected override getErrorMessage(): string {
		return localize('unknownErrorEditorText', "The editor could not be opened due to an unexpected error.");
	}
}

export class UnavailableResourceErrorEditor extends AbstractErrorEditor {

	private static readonly ID = 'workbench.editors.unavailableResourceErrorEditor';
	private static readonly LABEL = localize('unavailableResourceErrorEditor', "Unavailable Resource Error Editor");

	static readonly DESCRIPTOR = EditorPaneDescriptor.create(UnavailableResourceErrorEditor, UnavailableResourceErrorEditor.ID, UnavailableResourceErrorEditor.LABEL);

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(UnavailableResourceErrorEditor.ID, telemetryService, themeService, storageService, instantiationService);
	}

	override getTitle(): string {
		return UnavailableResourceErrorEditor.LABEL;
	}

	protected override getErrorMessage(): string {
		return localize('unavailableResourceErrorEditorText', "The editor could not be opened because the file was not found.");
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
