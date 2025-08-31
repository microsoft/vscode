/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from '../../../../../amdX.js';
import { GridData, ColumnSchema } from '../../common/dataExplorerTypes.js';
import { getColumnLetter } from '../../common/columnUtils.js';

export class FileLoader {
	static async loadFile(file: File): Promise<GridData> {
		const fileExtension = file.name.split('.').pop()?.toLowerCase();
		
		switch (fileExtension) {
			case 'csv':
				return this.loadCSV(file);
			case 'tsv':
				return this.loadTSV(file);

			default:
				throw new Error(`Unsupported file type: ${fileExtension}`);
		}
	}
	
	static async loadCSV(file: File): Promise<GridData> {
		const Papa = await importAMDNodeModule<any>('papaparse', 'papaparse.min.js');
		
		return new Promise((resolve, reject) => {
			Papa.parse(file, {
				header: false, // Parse as array of arrays instead
				skipEmptyLines: true,
				dynamicTyping: false, // Keep everything as strings
				complete: (results: any) => {
					if (results.errors.length > 0) {
						console.warn('CSV parsing warnings:', results.errors);
					}
					
					const data = this.convertArrayParseResult(results, file.name);
					resolve(data);
				},
				error: (error: any) => {
					reject(new Error(`CSV parsing failed: ${error.message}`));
				}
			});
		});
	}
	
	static async loadTSV(file: File): Promise<GridData> {
		const Papa = await importAMDNodeModule<any>('papaparse', 'papaparse.min.js');
		
		return new Promise((resolve, reject) => {
			Papa.parse(file, {
				header: false, // Parse as array of arrays instead
				delimiter: '\t', // Tab-separated
				skipEmptyLines: true,
				dynamicTyping: false, // Keep everything as strings
				complete: (results: any) => {
					if (results.errors.length > 0) {
						console.warn('TSV parsing warnings:', results.errors);
					}
					
					const data = this.convertArrayParseResult(results, file.name);
					resolve(data);
				},
				error: (error: any) => {
					reject(new Error(`TSV parsing failed: ${error.message}`));
				}
			});
		});
	}
	
	
	private static convertArrayParseResult(results: any, fileName: string): GridData {
		if (!results.data || results.data.length === 0) {
			throw new Error('File contains no data');
		}
		
		// Treat all rows as data (including headers)
		const allRows = results.data as any[][];
		
		// Determine the number of columns from the longest row
		const maxColumns = Math.max(...allRows.map(row => row.length));
		
		// Create generic column names (A, B, C, etc.)
		const columns: ColumnSchema[] = Array.from({ length: maxColumns }, (_, index) => ({
			index,
			name: getColumnLetter(index),
			width: 100
		}));
		
		return {
			columns,
			rows: allRows,
			metadata: {
				totalRows: allRows.length,
				fileName,
				lastModified: new Date()
			}
		};
	}
}
