/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/mobilesidebar.css';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MobileSidebarInput, IMobileSidebarEditorInputService } from './mobileSidebarInput.js';
import { MobileSidebarWidget } from '../views/mobileSidebarWidget.js';
import { Dimension } from '../../../../../base/browser/dom.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IViewDescriptorService } from '../../../../common/views.js';

export class MobileSidebarEditor extends EditorPane {

	static readonly ID = 'workbench.editor.mobileSidebar';

	private container: HTMLElement | undefined;
	private widget: MobileSidebarWidget | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchLayoutService _layoutService: IWorkbenchLayoutService,
		@IViewDescriptorService _viewDescriptorService: IViewDescriptorService,
		@IMobileSidebarEditorInputService private readonly mobileSidebarService: IMobileSidebarEditorInputService
	) {
		super(MobileSidebarEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		console.log('[MobileSidebarEditor] createEditor called');
		this.container = parent;
		this.container.classList.add('mobile-sidebar-editor');

		// We'll pass undefined for now as we'll handle the sidebar differently
		const sidebarPart = undefined;

		// Create the mobile sidebar widget
		this.widget = this.instantiationService.createInstance(
			MobileSidebarWidget,
			this.container,
			sidebarPart
		);
		console.log('[MobileSidebarEditor] Widget created in createEditor');
	}

	override async setInput(
		input: EditorInput,
		options: IEditorOptions | undefined,
		context: IEditorOpenContext,
		token: CancellationToken
	): Promise<void> {
		console.log('[MobileSidebarEditor] setInput called, widget exists:', !!this.widget, 'container exists:', !!this.container);

		if (!(input instanceof MobileSidebarInput)) {
			throw new Error('Invalid input for MobileSidebarEditor');
		}

		await super.setInput(input, options, context, token);

		// Recreate widget if it was disposed
		if (!this.widget && this.container) {
			console.log('[MobileSidebarEditor] Recreating widget in setInput');
			// Clear the container first
			this.container.innerHTML = '';
			this.container.classList.add('mobile-sidebar-editor');

			const sidebarPart = undefined;
			this.widget = this.instantiationService.createInstance(
				MobileSidebarWidget,
				this.container,
				sidebarPart
			);
			console.log('[MobileSidebarEditor] Widget recreated');
		}

		// Initialize the widget if needed
		if (this.widget) {
			this.widget.refresh();
		} else {
			console.error('[MobileSidebarEditor] No widget available after setInput!');
		}
	}

	override layout(dimension: Dimension): void {
		if (this.widget) {
			this.widget.layout(dimension);
		}
	}

	override clearInput(): void {
		console.log('[MobileSidebarEditor] clearInput called');
		if (this.widget) {
			this.widget.dispose();
			this.widget = undefined;
			console.log('[MobileSidebarEditor] Widget disposed');
		}
		// Clear the container HTML to prevent stale content
		if (this.container) {
			this.container.innerHTML = '';
			console.log('[MobileSidebarEditor] Container cleared');
		}
		super.clearInput();
	}

	override focus(): void {
		if (this.widget) {
			this.widget.focus();
		}
	}

	override getControl(): MobileSidebarWidget | undefined {
		return this.widget;
	}

	// Custom method to check if editor can be closed
	canBeClosed(): boolean {
		// Prevent closing if we're in mobile mode
		if (this.mobileSidebarService.isInMobileMode()) {
			return false;
		}
		return true;
	}
}
