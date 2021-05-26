/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/workspacetrusteditor';
import { localize } from 'vs/nls';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { Dimension, size, clearNode, append, addDisposableListener, EventType, $ } from 'vs/base/browser/dom';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { assertIsDefined, assertAllDefined } from 'vs/base/common/types';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { EditorDescriptor } from 'vs/workbench/browser/editor';
import { IEditorOptions } from 'vs/platform/editor/common/editor';

export class WorkspaceTrustRequiredEditor extends EditorPane {

	static readonly ID = 'workbench.editors.workspaceTrustRequiredEditor';
	static readonly LABEL = localize('trustRequiredEditor', "Workspace Trust Required");
	static readonly DESCRIPTOR = EditorDescriptor.create(WorkspaceTrustRequiredEditor, WorkspaceTrustRequiredEditor.ID, WorkspaceTrustRequiredEditor.LABEL);

	private container: HTMLElement | undefined;
	private scrollbar: DomScrollableElement | undefined;
	private inputDisposable = this._register(new MutableDisposable());

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService
	) {
		super(WorkspaceTrustRequiredEditor.ID, telemetryService, themeService, storageService);
	}

	override getTitle(): string {
		return WorkspaceTrustRequiredEditor.LABEL;
	}

	protected createEditor(parent: HTMLElement): void {

		// Container
		this.container = document.createElement('div');
		this.container.className = 'monaco-workspace-trust-required-editor';
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
		this.inputDisposable.value = this.renderInput();
	}

	private renderInput(): IDisposable {
		const [container, scrollbar] = assertAllDefined(this.container, this.scrollbar);

		clearNode(container);

		const disposables = new DisposableStore();

		const label = container.appendChild(document.createElement('p'));
		label.textContent = isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceService.getWorkspace())) ?
			localize('requiresFolderTrustText', "The file is not displayed in the editor because trust has not been granted to the folder.") :
			localize('requiresWorkspaceTrustText', "The file is not displayed in the editor because trust has not been granted to the workspace.");

		const link = append(label, $('a.embedded-link'));
		link.setAttribute('role', 'button');
		link.textContent = localize('manageTrust', "Manage Workspace Trust");

		disposables.add(addDisposableListener(link, EventType.CLICK, async () => {
			await this.commandService.executeCommand('workbench.trust.manage');
		}));

		scrollbar.scanDomNode();

		return disposables;
	}

	override clearInput(): void {
		if (this.container) {
			clearNode(this.container);
		}

		this.inputDisposable.clear();

		super.clearInput();
	}

	layout(dimension: Dimension): void {

		// Pass on to Container
		const [container, scrollbar] = assertAllDefined(this.container, this.scrollbar);
		size(container, dimension.width, dimension.height);
		scrollbar.scanDomNode();
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
