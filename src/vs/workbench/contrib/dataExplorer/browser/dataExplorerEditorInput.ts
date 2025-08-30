/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IUntypedEditorInput, GroupIdentifier, ISaveOptions, IRevertOptions } from '../../../common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDataExplorerService } from '../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';
import { GridData } from '../../../services/dataExplorer/common/dataExplorerTypes.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { importAMDNodeModule } from '../../../../amdX.js';

/**
 * DataExplorerEditorInput class for managing data explorer editor inputs.
 */
export class DataExplorerEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editors.dataExplorerEditorInput';
	static readonly EditorID: string = 'dataExplorerEditor';

	private _isSaving: boolean = false;

	constructor(
		public readonly resource: URI,
		@IFileService private readonly fileService: IFileService,
		@IDataExplorerService private readonly dataExplorerService: IDataExplorerService
	) {
		super();
		
		// Listen for dirty state changes from the service for this resource
		this._register(this.dataExplorerService.onDidChangeDirty((changedResource) => {
			if (changedResource.toString() === this.resource.toString()) {
				this._onDidChangeDirty.fire();
			}
		}));
	}

	override get typeId(): string {
		return DataExplorerEditorInput.ID;
	}

	override get editorId(): string {
		return DataExplorerEditorInput.EditorID;
	}

	override getName(): string {
		return basename(this.resource.path);
	}

	override getDescription(): string {
		return localize('dataExplorerEditorDescription', "Data Explorer");
	}

	override getTitle(): string {
		return this.getName();
	}

	override isReadonly(): boolean {
		return false;
	}

	override isDirty(): boolean {
		return this.dataExplorerService.isDirty(this.resource);
	}

	override isSaving(): boolean {
		return this._isSaving;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (otherInput instanceof DataExplorerEditorInput) {
			return otherInput.resource.toString() === this.resource.toString();
		}
		return false;
	}

	override async save(group: GroupIdentifier, options?: ISaveOptions): Promise<EditorInput | IUntypedEditorInput | undefined> {
		const data = this.dataExplorerService.getResourceData(this.resource);
		const isDirty = this.dataExplorerService.isDirty(this.resource);
		
		if (!data || !isDirty) {
			return this; // Nothing to save
		}

		this._isSaving = true;
		try {
			await this.saveData(data);
			this.dataExplorerService.setDirty(this.resource, false);
			return this;
		} catch (error) {
			console.error('Failed to save data explorer file:', error);
			throw error;
		} finally {
			this._isSaving = false;
		}
	}

	override async revert(group: GroupIdentifier, options?: IRevertOptions): Promise<void> {
		await this.dataExplorerService.revert(this.resource, options);
	}

	override dispose(): void {
		super.dispose();
	}

	/**
	 * Load data from the file resource
	 */
	async loadData(): Promise<GridData> {
		// Check if data is already loaded for this resource
		const existingData = this.dataExplorerService.getResourceData(this.resource);
		if (existingData) {
			return existingData;
		}

		try {
			// Read the file content
			const fileContent = await this.fileService.readFile(this.resource);
			
			// Create a File object from the buffer
			const fileName = basename(this.resource.path);
			// Convert VSBuffer to proper ArrayBuffer for File constructor
			const uint8Array = new Uint8Array(fileContent.value.buffer);
			const arrayBuffer = uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
			const file = new File([arrayBuffer], fileName, {
				type: this.getMimeType(fileName),
				lastModified: fileContent.mtime
			});

			// Load data using the data explorer service
			const data = await this.dataExplorerService.loadDataFromFile(file);
			
			// Store both current and original data in the service for this resource
			const originalData = JSON.parse(JSON.stringify(data));
			this.dataExplorerService.setResourceData(this.resource, data, originalData);
			
			return data;
		} catch (error) {
			throw new Error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Save data back to the file resource
	 */
	async saveData(data: GridData): Promise<void> {
		try {
			// Determine the file format from the extension
			const extension = this.resource.path.split('.').pop()?.toLowerCase();
			let format: 'csv' | 'tsv';
			
			switch (extension) {
				case 'tsv':
					format = 'tsv';
					break;
				case 'csv':
				default:
					format = 'csv';
					break;
			}

			// Generate the file content
			const fileContent = await this.generateFileContent(data, format);
			
			// Write the file using the file service
			await this.fileService.writeFile(this.resource, VSBuffer.fromString(fileContent));
			
			// Update original data in the service to match saved data
			const originalData = JSON.parse(JSON.stringify(data));
			this.dataExplorerService.setResourceData(this.resource, data, originalData);
			
		} catch (error) {
			console.error('DataExplorerEditorInput.saveData: Save operation failed', error);
			throw new Error(`Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Update data for dirty state management
	 * Used when the service data has changed and we need to update dirty state
	 */
	updateDataForDirtyState(data: GridData): void {
		// Update the resource data in the service
		const originalData = this.dataExplorerService.getOriginalResourceData(this.resource);
		if (originalData) {
			// Check if data has changed from original
			const hasChanged = JSON.stringify(data) !== JSON.stringify(originalData);
			
			// Update only the current data without triggering events
			this.dataExplorerService.updateResourceData(this.resource, data);
			
			// Update dirty state (this may trigger events, but only once)
			this.dataExplorerService.setDirty(this.resource, hasChanged);
		}
	}

	/**
	 * Generate file content for saving
	 */
	private async generateFileContent(data: GridData, format: 'csv' | 'tsv'): Promise<string> {
		// Use Papa Parse to generate CSV/TSV content
		const Papa = await importAMDNodeModule<any>('papaparse', 'papaparse.min.js');
		
		// Save all rows as data (no headers) since our data structure treats all rows as data
		// The first row in data.rows is actually the header row from the original file
		const content = Papa.unparse(data.rows, {
			header: false, // Don't add headers - all rows are data
			delimiter: format === 'tsv' ? '\t' : ',',
			skipEmptyLines: false,
			quotes: true,
			quoteChar: '"',
			escapeChar: '"'
		});

		return content;
	}

	/**
	 * Get MIME type based on file extension
	 */
	private getMimeType(fileName: string): string {
		const extension = fileName.split('.').pop()?.toLowerCase();
		switch (extension) {
			case 'csv':
				return 'text/csv';
			case 'tsv':
				return 'text/tab-separated-values';

			default:
				return 'application/octet-stream';
		}
	}

	/**
	 * Check if the resource can be supported by this editor
	 */
	static canSupportResource(resource: URI): boolean {
		if (resource.scheme !== Schemas.file && 
			resource.scheme !== Schemas.untitled && 
			resource.scheme !== Schemas.vscodeUserData) {
			return false;
		}

		const extension = resource.path.split('.').pop()?.toLowerCase();
		return extension === 'csv' || extension === 'tsv';
	}
}
