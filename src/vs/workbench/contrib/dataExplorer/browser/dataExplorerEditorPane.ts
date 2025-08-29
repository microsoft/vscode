/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dataExplorerEditor.css';
import './media/dataGrid.css';
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

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDataExplorerService private readonly dataExplorerService: IDataExplorerService
	) {
		super(DataExplorerEditorPane.ID, group, telemetryService, themeService, storageService);
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

		// Render the DataExplorerEditor component
		this.reactRoot.render(
			React.createElement(DataExplorerEditor, {
				initialData: this.currentData,
				onFileLoad: this.handleFileLoad.bind(this),
				onDataChange: this.handleDataChange.bind(this),
				onError: this.handleError.bind(this)
			})
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

	/**
	 * Handle file load from React component
	 */
	private handleFileLoad(data: GridData): void {
		this.currentData = data;
		
		// Update the data explorer service
		this.dataExplorerService.setCurrentData(data);
		
		// Save data back to the input if needed
		if (this.input instanceof DataExplorerEditorInput) {
			this.input.saveData(data).catch(error => {
				console.error('Failed to save data to input:', error);
			});
		}
	}

	/**
	 * Handle data changes from React component
	 */
	private handleDataChange(data: GridData): void {
		this.currentData = data;
		
		// Update the data explorer service
		this.dataExplorerService.setCurrentData(data);
		
		// Note: EditorInput doesn't have setDirty method in VS Code architecture
		// The dirty state is managed through the file system or explicitly by calling onDidChangeDirty event
		
		// Save data back to the input if needed
		if (this.input instanceof DataExplorerEditorInput) {
			this.input.saveData(data).catch(error => {
				console.error('Failed to save data to input:', error);
			});
		}
	}

	/**
	 * Handle errors from React component
	 */
	private handleError(error: string): void {
		this.showError(error);
	}

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
