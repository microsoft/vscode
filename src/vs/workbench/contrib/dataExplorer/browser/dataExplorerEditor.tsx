/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { GridData } from '../../../services/dataExplorer/common/dataExplorerTypes.js';
import { DataSorter } from '../../../services/dataExplorer/browser/dataSorter.js';
import { DataGrid, DataGridRef } from './components/dataGrid.js';
import { useSorting } from './hooks/useSorting.js';
import { SaveIcon } from './components/saveIcon.js';
import { UndoRedoButtons } from './components/undoRedoButtons.js';
import { WrapTextButton } from './components/wrapTextButton.js';
import { PlaintextButton } from './components/plaintextButton.js';
import { FontSizeControls } from './components/fontSizeControls.js';
import { useHistory } from './hooks/useHistory.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { IDataExplorerService } from '../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

interface DataExplorerEditorProps {
	initialData: GridData;
	onDataChange?: (data: GridData) => void;
	onSave?: () => void;
	onOpenAsPlaintext?: () => void;
	isDirty?: boolean;
	isSaving?: boolean;
	dataExplorerService?: IDataExplorerService;
	storageService?: IStorageService;
}



const DataExplorerEditor: React.FC<DataExplorerEditorProps> = ({ 
	initialData, 
	onDataChange, 
	onSave,
	onOpenAsPlaintext,
	isDirty = false,
	isSaving = false,
	dataExplorerService,
	storageService
}) => {
	const [gridData, setGridData] = useState<GridData>(initialData);
	const [originalData, setOriginalData] = useState<GridData>(initialData);
	const [fontSize, setFontSize] = useState<number>(13); // Default font size
	const dataGridRef = useRef<DataGridRef>(null);
	const { sortKeys, addSort, clearSorts } = useSorting();

	// History management - only enable if service is provided
	const historyManager = dataExplorerService?.getHistoryManager();
	const history = historyManager ? useHistory(historyManager) : null;
	
	// Enable keyboard shortcuts for undo/redo
	useKeyboardShortcuts(historyManager!, !!historyManager);


	// Load stored font size on mount
	React.useEffect(() => {
		if (storageService) {
			try {
				const storedFontSize = storageService.get('dataExplorer.fontSize', StorageScope.WORKSPACE);
				if (storedFontSize) {
					const parsedSize = parseInt(storedFontSize, 10);
					if (!isNaN(parsedSize) && parsedSize >= 1 && parsedSize <= 128) {
						setFontSize(parsedSize);
					}
				}
			} catch (error) {
				console.warn('Failed to load stored font size:', error);
			}
		}
	}, [storageService]);

	// Save font size when it changes
	const handleFontSizeChange = React.useCallback((newSize: number) => {
		setFontSize(newSize);
		if (storageService) {
			try {
				storageService.store('dataExplorer.fontSize', newSize.toString(), StorageScope.WORKSPACE, StorageTarget.USER);
			} catch (error) {
				console.warn('Failed to save font size:', error);
			}
		}
	}, [storageService]);

	// Listen to service data changes - service is the single source of truth
	useEffect(() => {
		if (!dataExplorerService) return;

		const disposable = dataExplorerService.onDidChangeData((data) => {
			setGridData(data);
			// Always notify pane about data changes for dirty state management
			onDataChange?.(data);
		});

		return () => disposable.dispose();
	}, [dataExplorerService, onDataChange]);

	useEffect(() => {
		setOriginalData(initialData);
		setGridData(initialData);
		clearSorts();
	}, [initialData, clearSorts]);





	const handleDataChange = (data: GridData) => {
		setGridData(data);
		onDataChange?.(data);
	};

	const handleCellChange = (row: number, col: number, value: any) => {
		if (!gridData) return;
		
		if (!dataExplorerService) {
			console.error('Cannot edit cell: dataExplorerService is required for history tracking');
			return;
		}
		
		// Use service method with history support
		// Service will handle the edit and fire onDidChangeData event
		// Our useEffect listener will update UI and notify pane
		try {
			dataExplorerService.editCellWithHistory(row, col, value);
		} catch (error) {
			console.error('Error editing cell:', error);
		}
	};

	const handleColumnSort = (columnIndex: number, ascending: boolean) => {
	
		
		if (!originalData) {

			return;
		}
		

		
		// Add the sort to the sort manager
		addSort(columnIndex, ascending);
	};

	// Effect to apply sorting when sort keys change
	useEffect(() => {

		
		if (!originalData) {

			return;
		}
		
		if (sortKeys.length === 0) {
			// No sorts, show original data

			setGridData(originalData);
		} else {
			// Apply sorting

			const sortedData = DataSorter.sortData(originalData, sortKeys);

			setGridData(sortedData);
		}
	}, [sortKeys, originalData]);



	const handleSave = () => {
		if (onSave) {
			onSave();
		}
	};

	const handleWrapText = () => {
		if (!dataGridRef.current) {
			console.warn('No dataGrid available for text wrapping');
			return;
		}
		
		dataGridRef.current.wrapTextInSelection();
	};

	const handleOpenAsPlaintext = () => {
		if (onOpenAsPlaintext) {
			onOpenAsPlaintext();
		}
	};

	return (
		<div className="data-explorer-editor">
				<div className="data-header">
					<div className="data-actions">
						<SaveIcon 
							isDirty={isDirty}
							isSaving={isSaving}
							onSave={handleSave}
						/>
						{history && (
							<UndoRedoButtons
								canUndo={history.historyState.canUndo}
								canRedo={history.historyState.canRedo}
								undoDescription={history.historyState.undoDescription}
								redoDescription={history.historyState.redoDescription}
								onUndo={history.undo}
								onRedo={history.redo}
								className="compact"
								showLabels={false}
							/>
						)}
						<FontSizeControls
							fontSize={fontSize}
							onFontSizeChange={handleFontSizeChange}
							className="compact"
						/>
						<WrapTextButton
							onWrapText={handleWrapText}
							className="compact"
							showLabel={false}
						/>
						<PlaintextButton
							onOpenAsPlaintext={handleOpenAsPlaintext}
						/>
					</div>
				</div>
				
				<div className="data-grid-container" style={{ fontSize: `${fontSize}px` }}>
					<DataGrid 
						ref={dataGridRef}
						data={gridData}
						onCellChange={handleCellChange}
						onColumnSort={handleColumnSort}
						onDataChange={handleDataChange}
						sortKeys={sortKeys}
						storageService={storageService}
						dataExplorerService={dataExplorerService}
					/>
				</div>
		</div>
	);
};

export { DataExplorerEditor };
