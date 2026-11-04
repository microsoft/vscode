/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { constObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { CanvasInput } from '../common/canvas.js';
import { CanvasView } from './canvasView.js';

export class CanvasEditor extends EditorPane {

	static readonly ID = CanvasInput.EDITOR_ID;

	private view!: CanvasView;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super(CanvasEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		this.view = this._register(this.instantiationService.createInstance(CanvasView, parent, this.window, {
			logPrefix: '[CanvasEditor]',
			notPresentableMessage: constObservable(localize('canvas.ownerUnavailable', "This canvas is only shown beside its owning conversation.")),
			getHelpContent: () => this.getHelpContent(),
		}));
		this._register(this.view.onDidFocus(() => this._onDidFocus?.fire()));
	}

	override async setInput(input: CanvasInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		if (this.group.windowId !== this.editorGroupsService.mainPart.windowId) {
			throw new Error(localize('canvas.mainWindowOnly', "Canvases can only be shown in the main window beside their owning conversation."));
		}
		this.view.setInput(undefined);
		await super.setInput(input, options, context, token);
		if (!token.isCancellationRequested && this.input === input) {
			this.view.setInput(input);
		}
	}

	override layout(): void {
		this.view.layout();
	}

	protected override setEditorVisible(visible: boolean): void {
		this.view?.setVisible(visible);
	}

	override focus(): void {
		this.view.focus();
	}

	override clearInput(): void {
		this.view.clearInput();
		super.clearInput();
	}

	override dispose(): void {
		this.view?.clearInput();
		super.dispose();
	}

	createAccessibleProvider(type: AccessibleViewType): AccessibleContentProvider {
		return this.view.createAccessibleProvider(type);
	}

	private getHelpContent(): string {
		return [
			localize('canvas.help.overview', "This canvas is a private page owned by its conversation. Its content is available while that conversation is shown."),
			localize('canvas.help.navigation', "Tab moves through page controls. Use <keybinding:workbench.action.focusNextPart> to leave the page."),
			localize('canvas.help.externalLinks', "User-initiated HTTP and HTTPS links that request a new tab or window open outside the canvas."),
			// Only the Agents window offers an Add Tab menu.
			this.environmentService.isSessionsWindow
				? localize('canvas.help.close', "Closing the tab hides this canvas. Use the Add Tab menu in the editor toolbar, then Canvas, to open any available canvas or reopen a hidden canvas.")
				: localize('canvas.help.closeEditorWindow', "Closing the tab hides this canvas. Reopen it from its canvas pill or ask the agent to open it again."),
			localize('canvas.help.closeCanvas', "To close the canvas itself, which also notifies the canvas extension that provides it, use Close Canvas from its canvas pill."),
		].join('\n\n');
	}
}
