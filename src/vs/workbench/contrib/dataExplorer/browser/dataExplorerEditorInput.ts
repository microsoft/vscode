/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IUntypedEditorInput } from '../../../common/editor.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDataExplorerService } from '../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';
import { GridData } from '../../../services/dataExplorer/common/dataExplorerTypes.js';
import { Schemas } from '../../../../base/common/network.js';
import { basename } from '../../../../base/common/path.js';

/**
 * DataExplorerEditorInput class for managing data explorer editor inputs.
 */
export class DataExplorerEditorInput extends EditorInput {

	static readonly ID: string = 'workbench.editors.dataExplorerEditorInput';
	static readonly EditorID: string = 'dataExplorerEditor';

	private _data: GridData | undefined;

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

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		if (otherInput instanceof DataExplorerEditorInput) {
			return otherInput.resource.toString() === this.resource.toString();
		}
		return false;
	}

	override dispose(): void {
		super.dispose();
		this._data = undefined;
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
			return this._data;
		} catch (error) {
			throw new Error(`Failed to load data: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	/**
	 * Save data back to the file resource
	 */
	async saveData(data: GridData): Promise<void> {
		try {
			// Update the service data
			this.dataExplorerService.setCurrentData(data);
			this._data = data;

			// Save functionality will be implemented in Phase 6
			// For now, just update the internal data
			console.warn('Save functionality not yet implemented - data updated in memory only');
		} catch (error) {
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
