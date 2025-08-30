/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { GridData } from '../../../services/dataExplorer/common/dataExplorerTypes.js';
import { DataGrid, DataGridRef } from './components/dataGrid.js';
import { SaveIcon } from './components/saveIcon.js';
import { UndoRedoButtons } from './components/undoRedoButtons.js';
import { WrapTextButton } from './components/wrapTextButton.js';
import { PlaintextButton } from './components/plaintextButton.js';
import { FontSizeControls } from './components/fontSizeControls.js';
import { useHistory } from './hooks/useHistory.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { IDataExplorerService } from '../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { DataGridFindWidget } from './components/findReplace/dataGridFindWidget.js';
import { DataGridFindController } from './components/findReplace/dataGridFindController.js';

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
	const [fontSize, setFontSize] = useState<number>(13); // Default font size
	const [findWidgetVisible, setFindWidgetVisible] = useState<boolean>(false);
	const dataGridRef = useRef<DataGridRef>(null);
	const findControllerRef = useRef<DataGridFindController | null>(null);

	// History management - only enable if service is provided
	const historyManager = dataExplorerService?.getHistoryManager();
	const history = historyManager ? useHistory(historyManager) : null;
	
	// Keyboard shortcuts for undo/redo
	useKeyboardShortcuts(historyManager!, !!historyManager);
	
	// Handle find widget toggle
	const handleToggleFind = React.useCallback(() => {
		setFindWidgetVisible(prev => {
			const newVisible = !prev;
			if (newVisible && findControllerRef.current) {
				findControllerRef.current.start();
			} else if (!newVisible && findControllerRef.current) {
				findControllerRef.current.close();
			}
			return newVisible;
		});
	}, []);

	const handleCloseFindWidget = React.useCallback(() => {
		setFindWidgetVisible(false);
		if (findControllerRef.current) {
			findControllerRef.current.close();
		}
	}, []);

	// Handle Escape key for closing find widget
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape - Close find widget if open
			if (e.key === 'Escape' && findWidgetVisible) {
				const target = e.target as HTMLElement;
				const tagName = target?.tagName?.toLowerCase();
				// Don't interfere with normal text editing
				if (tagName !== 'input' && tagName !== 'textarea' && !target?.isContentEditable) {
					e.preventDefault();
					e.stopPropagation();
					handleCloseFindWidget();
				}
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [findWidgetVisible, handleCloseFindWidget]);

	// Initialize find controller
	useEffect(() => {
		if (dataGridRef.current && !findControllerRef.current) {
			findControllerRef.current = new DataGridFindController(dataGridRef.current, dataExplorerService);
		}
		return () => {
			findControllerRef.current?.dispose();
			findControllerRef.current = null;
		};
	}, [dataExplorerService]);





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

			// Listen for full data changes (file loads)
			const dataChangeDisposable = dataExplorerService.onDidChangeData((data) => {
				setGridData(data);
				// Always notify pane about data changes for dirty state management
				onDataChange?.(data);
			});

			// Listen for data mutations (edits, sorts, etc.) - no full reload
			const mutationDisposable = dataExplorerService.onDidMutateData(() => {
				const currentData = dataExplorerService.getCurrentData();
				if (currentData) {
					setGridData(currentData);
					// Always notify pane about data changes for dirty state management
					onDataChange?.(currentData);
				}
			});

		return () => {
			dataChangeDisposable.dispose();
			mutationDisposable.dispose();
		};
	}, [dataExplorerService, onDataChange]);

	useEffect(() => {
		setGridData(initialData);
		// Clear sorts when new data is loaded
		if (dataExplorerService) {
			dataExplorerService.clearSorts();
		}
	}, [initialData, dataExplorerService]);

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
		if (!dataExplorerService) {
			return;
		}
		
		// Use the service's sorting system instead of client-side sorting
		dataExplorerService.addSort(columnIndex, ascending);
	};

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
						<PlaintextButton
							onOpenAsPlaintext={handleOpenAsPlaintext}
						/>
						<div className="action-item font-size-divider">
							<div className="vertical-divider"></div>
						</div>
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
						<div className="action-item font-size-divider">
							<div className="vertical-divider"></div>
						</div>
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
						<div className="action-item font-size-divider">
							<div className="vertical-divider"></div>
						</div>
						<button
							className="action-item compact codicon codicon-search"
							title="Find in data"
							onClick={handleToggleFind}
							aria-label="Find"
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
						storageService={storageService}
						dataExplorerService={dataExplorerService}
					/>
					{findWidgetVisible && findControllerRef.current && (
						<DataGridFindWidget
							controller={findControllerRef.current}
							isVisible={findWidgetVisible}
							onClose={handleCloseFindWidget}
						/>
					)}

				</div>
		</div>
	);
};

export { DataExplorerEditor };
