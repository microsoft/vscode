/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { FileLoader } from '../../../services/dataExplorer/browser/fileLoader.js';
import { GridData } from '../../../services/dataExplorer/common/dataExplorerTypes.js';
import { DataGrid, DataGridRef } from './components/dataGrid.js';

interface DataExplorerEditorProps {
	initialData?: GridData;
	onFileLoad?: (data: GridData) => void;
	onDataChange?: (data: GridData) => void;
	onError?: (error: string) => void;
}

const FileUploader: React.FC<{
	onFileLoad: (data: GridData) => void;
	onError?: (error: string) => void;
	disabled?: boolean;
}> = ({ onFileLoad, onError, disabled }) => {
	const [isLoading, setIsLoading] = useState(false);

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		setIsLoading(true);

		try {
			const data = await FileLoader.loadFile(file);
			onFileLoad(data);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			console.error('Error loading file:', errorMessage);
			onError?.(errorMessage);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="file-uploader">
			<input
				type="file"
				accept=".csv,.tsv,.xlsx,.xls"
				onChange={handleFileChange}
				disabled={isLoading || disabled}
			/>
			{isLoading && <div className="loading">Loading file...</div>}
		</div>
	);
};

const DataExplorerEditor: React.FC<DataExplorerEditorProps> = ({ 
	initialData, 
	onFileLoad, 
	onDataChange, 
	onError 
}) => {
	const [gridData, setGridData] = useState<GridData | null>(initialData || null);
	const [error, setError] = useState<string | null>(null);
	const [isHeadersFrozen, setIsHeadersFrozen] = useState(true);
	const dataGridRef = useRef<DataGridRef>(null);

	useEffect(() => {
		if (initialData) {
			setGridData(initialData);
			setError(null);
		}
	}, [initialData]);

	const handleFileLoad = (data: GridData) => {
		// Debug: Log the loaded data structure
		console.log('DataExplorerEditor: File loaded with data:', {
			totalColumns: data.columns.length,
			totalRows: data.rows.length,
			fileName: data.metadata.fileName,
			columnWidths: data.columns.map(col => ({ name: col.name, width: col.width })),
			expectedTotalWidth: data.columns.reduce((sum, col) => sum + (col.width || 100), 0),
			firstRowLength: data.rows[0]?.length || 0,
			sampleColumnNames: {
				first5: data.columns.slice(0, 5).map(col => col.name),
				last5: data.columns.slice(-5).map(col => col.name)
			}
		});
		
		setGridData(data);
		setError(null);
		onFileLoad?.(data);
	};

	const handleError = (errorMessage: string) => {
		setError(errorMessage);
		setGridData(null);
		onError?.(errorMessage);
	};

	const handleDataChange = (data: GridData) => {
		setGridData(data);
		onDataChange?.(data);
	};

	const handleCellChange = (row: number, col: number, value: any) => {
		if (!gridData) return;
		
		// Create a copy of the grid data with the updated cell
		const updatedRows = [...gridData.rows];
		updatedRows[row] = [...updatedRows[row]];
		updatedRows[row][col] = value;
		
		const updatedData: GridData = {
			...gridData,
			rows: updatedRows
		};
		
		handleDataChange(updatedData);
	};

	const handleColumnSort = (columnIndex: number, ascending: boolean) => {
		if (!gridData) return;
		
		// For Phase 3, we'll just log the sort request
		// Actual sorting will be implemented in Phase 5
		console.log(`Sort requested for column ${columnIndex}, ascending: ${ascending}`);
	};

	const handleHeaderFreezeToggle = () => {
		if (dataGridRef.current) {
			dataGridRef.current.toggleHeaderFreeze();
			// Update local state to match the DataGrid state
			setIsHeadersFrozen(dataGridRef.current.isHeadersFrozen);
		}
	};

	return (
		<div className="data-explorer-app">
			{!gridData && (
				<div className="file-upload-section">
					<h2>Load Data File</h2>
					<p>Select a CSV, TSV, or Excel file to open in the data explorer.</p>
					<FileUploader onFileLoad={handleFileLoad} onError={handleError} />
				</div>
			)}

			{error && (
				<div className="error-section">
					<h3>Error loading file:</h3>
					<p>{error}</p>
					<FileUploader onFileLoad={handleFileLoad} onError={handleError} />
				</div>
			)}

			{gridData && (
				<div className="data-view-section">
					<div className="data-header">
						<h2>{gridData.metadata.fileName}</h2>
						<div className="data-stats">
							<span>{gridData.metadata.totalRows} rows</span>
							<span>{gridData.columns.length} columns</span>
							<button 
								className="freeze-toggle-btn"
								onClick={handleHeaderFreezeToggle}
								title={isHeadersFrozen ? "Unfreeze column headers" : "Freeze column headers"}
							>
								⋯
							</button>
						</div>
					</div>
					
					<div className="data-grid-container">
						<DataGrid 
							ref={dataGridRef}
							data={gridData}
							onCellChange={handleCellChange}
							onColumnSort={handleColumnSort}
						/>
					</div>
				</div>
			)}
		</div>
	);
};

export { DataExplorerEditor };
