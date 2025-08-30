/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dataExplorerEditor.css';
import './media/dataGrid.css';
import './media/historyControls.css';
import * as DOM from '../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';

import { IDataExplorerService } from '../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';
import { DataExplorerEditorInput } from './dataExplorerEditorInput.js';
import { GridData } from '../../../services/dataExplorer/common/dataExplorerTypes.js';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { DataExplorerEditor } from './dataExplorerEditor.js';
import { ErdosReactServices } from '../../../../base/browser/erdosReactServices.js';
import { ErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

export interface IDataExplorerEditorOptions extends IEditorOptions {
}

/**
 * DataExplorerEditorPane class extending EditorPane for React integration
 */
export class DataExplorerEditorPane extends EditorPane {

	static readonly ID = 'dataExplorerEditor';

	private container: HTMLElement | undefined;
	private reactRoot: ReactDOM.Root | undefined;
	private currentData: GridData | undefined;
	private readonly storageService: IStorageService;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDataExplorerService private readonly dataExplorerService: IDataExplorerService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super(DataExplorerEditorPane.ID, group, telemetryService, themeService, storageService);
		this.storageService = storageService;
	}

	protected override createEditor(parent: HTMLElement): void {
		// Create container for React component
		this.container = DOM.append(parent, DOM.$('.data-explorer-editor'));
		this.container.style.width = '100%';
		this.container.style.height = '100%';
		this.container.style.overflow = 'hidden';
	}

	override async setInput(
		input: DataExplorerEditorInput,
		options: IDataExplorerEditorOptions | undefined,
		context: any,
		token: CancellationToken
	): Promise<void> {
		await super.setInput(input, options, context, token);

		if (token.isCancellationRequested) {
			return;
		}

		try {
			// Load data from the input
			this.currentData = await input.loadData();
			
			// Listen for dirty state changes to re-render
			this._register(input.onDidChangeDirty(() => {
				this.renderReactComponent();
			}));
			
			// Render the React component
			this.renderReactComponent();
		} catch (error) {
			// Show error in the editor
			this.showError(error instanceof Error ? error.message : 'Unknown error occurred');
		}
	}

	override clearInput(): void {
		super.clearInput();
		this.destroyReactComponent();
		this.currentData = undefined;
	}

	override layout(dimension: Dimension): void {
		if (this.container) {
			this.container.style.width = `${dimension.width}px`;
			this.container.style.height = `${dimension.height}px`;
		}
	}

	override focus(): void {
		super.focus();
		if (this.container) {
			this.container.focus();
		}
	}

	override dispose(): void {
		this.destroyReactComponent();
		super.dispose();
	}

	/**
	 * Render the React component
	 */
	private renderReactComponent(): void {
		if (!this.container || !this.currentData) {
			return;
		}

		// Destroy existing React component
		this.destroyReactComponent();

		// Create new React root
		this.reactRoot = ReactDOM.createRoot(this.container);

		// Render the DataExplorerEditor component with services context
		this.reactRoot.render(
			React.createElement(
				ErdosReactServicesContext.Provider,
				{ value: ErdosReactServices.services },
				React.createElement(DataExplorerEditor, {
					initialData: this.currentData!,
					onDataChange: this.handleDataChange.bind(this),
					onSave: this.handleSave.bind(this),
					onOpenAsPlaintext: this.handleOpenAsPlaintext.bind(this),
					isDirty: this.input instanceof DataExplorerEditorInput ? this.input.isDirty() : false,
					dataExplorerService: this.dataExplorerService,
					isSaving: this.input instanceof DataExplorerEditorInput ? this.input.isSaving() : false,
					storageService: this.storageService
				})
			)
		);
	}

	/**
	 * Destroy the React component
	 */
	private destroyReactComponent(): void {
		if (this.reactRoot) {
			this.reactRoot.unmount();
			this.reactRoot = undefined;
		}
	}

	// handleFileLoad removed - VSCode automatically loads files via EditorInput

	/**
	 * Handle data changes from React component
	 */
	private handleDataChange(data: GridData): void {
		this.currentData = data;
		
		// Update the editor input with the new data and mark as dirty
		// Don't update the service to avoid circular calls - service is the source of truth
		if (this.input instanceof DataExplorerEditorInput) {
			this.input.updateDataForDirtyState(data);
		}
	}

	/**
	 * Handle save operation from React component
	 */
	private async handleSave(): Promise<void> {
		console.log('DataExplorerEditorPane.handleSave: Save triggered from UI');
		
		if (this.input instanceof DataExplorerEditorInput) {
			console.log('DataExplorerEditorPane.handleSave: Input is DataExplorerEditorInput, proceeding with save');
			try {
				await this.input.save(this.group.id);
				console.log('DataExplorerEditorPane.handleSave: Save completed successfully');
			} catch (error) {
				console.error('DataExplorerEditorPane.handleSave: Save failed:', error);
				this.showError(error instanceof Error ? error.message : 'Failed to save file');
			}
		} else {
			console.warn('DataExplorerEditorPane.handleSave: Input is not DataExplorerEditorInput, cannot save');
		}
	}

	/**
	 * Handle open as plaintext operation from React component
	 */
	private async handleOpenAsPlaintext(): Promise<void> {
		if (this.input instanceof DataExplorerEditorInput) {
			try {
				const resource = this.input.resource;
				
				// Open the file with the default text editor, forcing plaintext mode
				await this.editorService.openEditor({
					resource: resource,
					options: {
						override: 'default',
						forceReload: true
					}
				}, this.group);
			} catch (error) {
				console.error('DataExplorerEditorPane.handleOpenAsPlaintext: Failed to open as plaintext:', error);
				this.showError(error instanceof Error ? error.message : 'Failed to open as plaintext');
			}
		}
	}

	// handleError removed - VSCode handles all file errors through built-in error system

	/**
	 * Show error message in the editor
	 */
	private showError(message: string): void {
		if (!this.container) {
			return;
		}

		// Destroy React component
		this.destroyReactComponent();

		// Show error message
		this.container.innerHTML = '';
		const errorContainer = DOM.append(this.container, DOM.$('.data-explorer-error'));
		errorContainer.style.padding = '20px';
		errorContainer.style.textAlign = 'center';
		errorContainer.style.color = 'var(--vscode-errorForeground)';
		
		const errorTitle = DOM.append(errorContainer, DOM.$('h3'));
		errorTitle.textContent = 'Error loading data';
		
		const errorMessage = DOM.append(errorContainer, DOM.$('p'));
		errorMessage.textContent = message;
	}
}
