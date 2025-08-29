/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { importAMDNodeModule } from '../../../../amdX.js';
import { GridData } from '../common/dataExplorerTypes.js';

/**
 * File saving implementation using proper libraries for CSV, TSV, and Excel formats
 */
export class FileSaver {
	static async saveFile(data: GridData, format: 'csv' | 'tsv' | 'xlsx' = 'csv'): Promise<void> {
		const fileName = this.generateFileName(data.metadata.fileName, format);
		
		switch (format) {
			case 'csv':
				return this.saveAsCSV(data, fileName);
			case 'tsv':
				return this.saveAsTSV(data, fileName);
			case 'xlsx':
				return this.saveAsExcel(data, fileName);
			default:
				throw new Error(`Unsupported format: ${format}`);
		}
	}
	
	private static async saveAsCSV(data: GridData, fileName: string): Promise<void> {
		const Papa = await importAMDNodeModule<any>('papaparse', 'papaparse.min.js');
		const { saveAs } = await importAMDNodeModule<any>('file-saver', 'FileSaver.min.js');
		
		// Save all rows as data (including header row as first data row)
		const csv = Papa.unparse(data.rows, {
			header: false, // Don't add headers - all rows are data
			skipEmptyLines: false,
			quotes: true, // Always quote fields for safety
			quoteChar: '"',
			escapeChar: '"'
		});
		
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		saveAs(blob, fileName);
	}
	
	private static async saveAsTSV(data: GridData, fileName: string): Promise<void> {
		const Papa = await importAMDNodeModule<any>('papaparse', 'papaparse.min.js');
		const { saveAs } = await importAMDNodeModule<any>('file-saver', 'FileSaver.min.js');
		
		// Save all rows as data (including header row as first data row)
		const tsv = Papa.unparse(data.rows, {
			header: false, // Don't add headers - all rows are data
			delimiter: '\t', // Tab-separated
			skipEmptyLines: false,
			quotes: true,
			quoteChar: '"',
			escapeChar: '"'
		});
		
		const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
		saveAs(blob, fileName);
	}
	
	private static async saveAsExcel(data: GridData, fileName: string): Promise<void> {
		const XLSX = await importAMDNodeModule<any>('xlsx', 'xlsx.full.min.js');
		const { saveAs } = await importAMDNodeModule<any>('file-saver', 'FileSaver.min.js');
		
		// Create workbook using all rows as data (first row is the header row from original file)
		const ws = XLSX.utils.aoa_to_sheet(data.rows);
		
		const wb = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
		
		// Generate Excel file
		const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
		const blob = new Blob([excelBuffer], { 
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' 
		});
		
		saveAs(blob, fileName);
	}
	
	private static generateFileName(originalName: string, format: string): string {
		const baseName = originalName.replace(/\.[^/.]+$/, ''); // Remove extension
		return `${baseName}.${format}`;
	}
}

