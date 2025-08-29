/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IUntypedEditorInput, GroupIdentifier, ISaveOptions } from '../../../common/editor.js';
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

	private _data: GridData | undefined;
	private _originalData: GridData | undefined;
	private _isDirty: boolean = false;
	private _isSaving: boolean = false;

	constructor(
		public readonly resource: URI,
		@IFileService private readonly fileService: IFileService,
		@IDataExplorerService private readonly dataExplorerService: IDataExplorerService
	) {
		super();
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
		return this._isDirty;
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
		if (!this._data || !this._isDirty) {
			return this; // Nothing to save
		}

		this._isSaving = true;
		try {
			await this.saveData(this._data);
			this.setDirty(false);
			return this;
		} catch (error) {
			console.error('Failed to save data explorer file:', error);
			throw error;
		} finally {
			this._isSaving = false;
		}
	}

	override dispose(): void {
		super.dispose();
		this._data = undefined;
		this._originalData = undefined;
	}

	/**
	 * Load data from the file resource
	 */
	async loadData(): Promise<GridData> {
		if (this._data) {
			return this._data;
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
			this._data = await this.dataExplorerService.loadDataFromFile(file);
			// Store original data for dirty state comparison
			this._originalData = JSON.parse(JSON.stringify(this._data));
			this.setDirty(false); // Initially not dirty
			return this._data;
		} catch (error) {
			throw new Error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Save data back to the file resource
	 */
	async saveData(data: GridData): Promise<void> {
		console.log('DataExplorerEditorInput.saveData: Starting save operation', {
			resourcePath: this.resource.path,
			resourceScheme: this.resource.scheme,
			dataRows: data.rows.length,
			dataColumns: data.columns.length
		});

		try {
			// Update the service data
			this.dataExplorerService.setCurrentData(data);
			this._data = data;

			// Determine the file format from the extension
			const extension = this.resource.path.split('.').pop()?.toLowerCase();
			let format: 'csv' | 'tsv' | 'xlsx';
			
			switch (extension) {
				case 'tsv':
					format = 'tsv';
					break;
				case 'xlsx':
				case 'xls':
					format = 'xlsx';
					break;
				case 'csv':
				default:
					format = 'csv';
					break;
			}

			console.log('DataExplorerEditorInput.saveData: Determined format', { extension, format });

			// Generate the file content
			const fileContent = await this.generateFileContent(data, format);
			
			console.log('DataExplorerEditorInput.saveData: Generated file content, writing to file');
			
			// Write the file using the file service
			await this.fileService.writeFile(this.resource, VSBuffer.fromString(fileContent));
			
			console.log('DataExplorerEditorInput.saveData: File write successful');
			
			// Update original data to match saved data
			this._originalData = JSON.parse(JSON.stringify(data));
			
			console.log('DataExplorerEditorInput.saveData: Save operation completed successfully');
			
		} catch (error) {
			console.error('DataExplorerEditorInput.saveData: Save operation failed', error);
			throw new Error(`Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Get the resource URI
	 */
	getResource(): URI {
		return this.resource;
	}

	/**
	 * Get the current loaded data
	 */
	getCurrentData(): GridData | undefined {
		return this._data;
	}

	/**
	 * Update data and mark as dirty if changed (also updates service)
	 */
	updateData(data: GridData): void {
		this._data = data;
		this.dataExplorerService.setCurrentData(data);
		
		// Check if data has changed from original
		const hasChanged = this._originalData ? JSON.stringify(data) !== JSON.stringify(this._originalData) : true;
		this.setDirty(hasChanged);
	}

	/**
	 * Update data for dirty state management only (doesn't update service)
	 * Used when the service is the source of truth and we just need to track dirty state
	 */
	updateDataForDirtyState(data: GridData): void {
		this._data = data;
		
		// Check if data has changed from original
		const hasChanged = this._originalData ? JSON.stringify(data) !== JSON.stringify(this._originalData) : true;
		this.setDirty(hasChanged);
	}

	/**
	 * Set dirty state and fire change event
	 */
	private setDirty(dirty: boolean): void {
		if (this._isDirty !== dirty) {
			this._isDirty = dirty;
			this._onDidChangeDirty.fire();
		}
	}

	/**
	 * Generate file content for saving
	 */
	private async generateFileContent(data: GridData, format: 'csv' | 'tsv' | 'xlsx'): Promise<string> {
		console.log('DataExplorerEditorInput.generateFileContent: Starting save process', {
			format,
			totalRows: data.rows.length,
			totalColumns: data.columns.length,
			fileName: data.metadata.fileName,
			firstRowSample: data.rows[0]?.slice(0, 3),
			columnNames: data.columns.map(c => c.name).slice(0, 5)
		});

		// For xlsx format, we'll save as CSV since we're writing to file service
		// The FileSaver handles blob downloads, but file service expects string content
		if (format === 'xlsx') {
			format = 'csv';
		}

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

		console.log('DataExplorerEditorInput.generateFileContent: Generated content', {
			contentLength: content.length,
			firstLine: content.split('\n')[0],
			totalLines: content.split('\n').length
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
			case 'xlsx':
				return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
			case 'xls':
				return 'application/vnd.ms-excel';
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
		return extension === 'csv' || extension === 'tsv' || extension === 'xlsx' || extension === 'xls';
	}
}
