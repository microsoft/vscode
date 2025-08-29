/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from '../../../../amdX.js';
import { GridData, ColumnSchema } from '../common/dataExplorerTypes.js';

export class FileLoader {
	static async loadFile(file: File): Promise<GridData> {
		const fileExtension = file.name.split('.').pop()?.toLowerCase();
		
		switch (fileExtension) {
			case 'csv':
				return this.loadCSV(file);
			case 'tsv':
				return this.loadTSV(file);
			case 'xlsx':
			case 'xls':
				return this.loadExcel(file);
			default:
				throw new Error(`Unsupported file type: ${fileExtension}`);
		}
	}
	
	static async loadCSV(file: File): Promise<GridData> {
		const Papa = await importAMDNodeModule<typeof import('papaparse')>('papaparse', 'papaparse.min.js');
		
		return new Promise((resolve, reject) => {
			Papa.parse(file, {
				header: false, // Parse as array of arrays instead
				skipEmptyLines: true,
				dynamicTyping: true, // Automatically convert numbers, booleans
				complete: (results) => {
					if (results.errors.length > 0) {
						console.warn('CSV parsing warnings:', results.errors);
					}
					
					const data = this.convertArrayParseResult(results, file.name);
					resolve(data);
				},
				error: (error) => {
					reject(new Error(`CSV parsing failed: ${error.message}`));
				}
			});
		});
	}
	
	static async loadTSV(file: File): Promise<GridData> {
		const Papa = await importAMDNodeModule<typeof import('papaparse')>('papaparse', 'papaparse.min.js');
		
		return new Promise((resolve, reject) => {
			Papa.parse(file, {
				header: false, // Parse as array of arrays instead
				delimiter: '\t', // Tab-separated
				skipEmptyLines: true,
				dynamicTyping: true,
				complete: (results) => {
					if (results.errors.length > 0) {
						console.warn('TSV parsing warnings:', results.errors);
					}
					
					const data = this.convertArrayParseResult(results, file.name);
					resolve(data);
				},
				error: (error) => {
					reject(new Error(`TSV parsing failed: ${error.message}`));
				}
			});
		});
	}
	
	static async loadExcel(file: File): Promise<GridData> {
		const XLSX = await importAMDNodeModule<typeof import('xlsx')>('xlsx', 'xlsx.full.min.js');
		
		const buffer = await file.arrayBuffer();
		const workbook = XLSX.read(buffer, { type: 'array' });
		
		// Use first sheet
		const sheetName = workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheetName];
		
		// Convert to JSON with header
		const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
		
		if (jsonData.length === 0) {
			throw new Error('Excel file is empty');
		}
		
		const headers = jsonData[0] as string[];
		const rows = jsonData.slice(1) as any[][];
		
		const columns: ColumnSchema[] = headers.map((name, index) => ({
			index,
			name: String(name || `Column ${index + 1}`),
			type: this.inferColumnType(rows, index) as 'string' | 'number' | 'boolean' | 'date',
			width: 100
		}));
		
		return {
			columns,
			rows,
			metadata: {
				totalRows: rows.length,
				fileName: file.name,
				lastModified: new Date(file.lastModified)
			}
		};
	}
	
	private static convertArrayParseResult(results: any, fileName: string): GridData {
		if (!results.data || results.data.length === 0) {
			throw new Error('File contains no data');
		}
		
		// First row contains headers, rest are data rows
		const headerRow = results.data[0] as any[];
		const dataRows = results.data.slice(1) as any[][];
		

		
		// Create column schema from headers
		const columns: ColumnSchema[] = headerRow.map((name, index) => ({
			index,
			name: String(name || `Column ${index + 1}`),
			type: this.inferColumnType(dataRows, index) as 'string' | 'number' | 'boolean' | 'date',
			width: 100
		}));
		
		return {
			columns,
			rows: dataRows,
			metadata: {
				totalRows: dataRows.length,
				fileName,
				lastModified: new Date()
			}
		};
	}
	
	private static inferColumnType(rows: any[][], columnIndex: number): string {
		// Sample first 100 rows for type inference
		const sample = rows.slice(0, 100)
			.map(row => row[columnIndex])
			.filter(val => val !== null && val !== undefined && val !== '');
		
		if (sample.length === 0) return 'string';
		
		// Check if all values are numbers
		if (sample.every(val => typeof val === 'number' || (!isNaN(Number(val)) && val !== ''))) {
			return 'number';
		}
		
		// Check if all values are booleans
		if (sample.every(val => typeof val === 'boolean' || val === 'true' || val === 'false')) {
			return 'boolean';
		}
		
		// Check if all values look like dates
		if (sample.every(val => !isNaN(Date.parse(String(val))))) {
			return 'date';
		}
		
		return 'string';
	}
}
