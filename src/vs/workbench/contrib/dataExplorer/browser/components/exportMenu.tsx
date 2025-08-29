/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { SaveButton } from './saveButton.js';

export interface ExportMenuProps {
	data: GridData;
	className?: string;
	onExportStart?: (format: 'csv' | 'tsv' | 'xlsx') => void;
	onExportComplete?: (format: 'csv' | 'tsv' | 'xlsx') => void;
	onExportError?: (error: Error, format: 'csv' | 'tsv' | 'xlsx') => void;
}

/**
 * Export menu component that provides format selection for file saving
 */
export const ExportMenu: React.FC<ExportMenuProps> = ({ 
	data, 
	className,
	onExportStart,
	onExportComplete,
	onExportError
}) => {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [currentFormat, setCurrentFormat] = useState<'csv' | 'tsv' | 'xlsx'>('csv');

	const toggleMenu = () => {
		setIsMenuOpen(!isMenuOpen);
	};

	const selectFormat = (format: 'csv' | 'tsv' | 'xlsx') => {
		setCurrentFormat(format);
		setIsMenuOpen(false);
	};

	const handleExportStart = () => {
		onExportStart?.(currentFormat);
	};

	const handleExportComplete = () => {
		onExportComplete?.(currentFormat);
	};

	const handleExportError = (error: Error) => {
		onExportError?.(error, currentFormat);
	};

	return (
		<div className={`export-menu ${className || ''}`}>
			<div className="export-controls">
				<SaveButton
					data={data}
					format={currentFormat}
					onSaveStart={handleExportStart}
					onSaveComplete={handleExportComplete}
					onSaveError={handleExportError}
				/>
				<button 
					className="format-selector-button"
					onClick={toggleMenu}
					title="Select export format"
					aria-expanded={isMenuOpen}
					aria-haspopup="true"
				>
					{currentFormat.toUpperCase()} ▼
				</button>
			</div>
			
			{isMenuOpen && (
				<div className="format-dropdown">
					<button 
						className={`format-option ${currentFormat === 'csv' ? 'selected' : ''}`}
						onClick={() => selectFormat('csv')}
					>
						CSV - Comma Separated Values
					</button>
					<button 
						className={`format-option ${currentFormat === 'tsv' ? 'selected' : ''}`}
						onClick={() => selectFormat('tsv')}
					>
						TSV - Tab Separated Values
					</button>
					<button 
						className={`format-option ${currentFormat === 'xlsx' ? 'selected' : ''}`}
						onClick={() => selectFormat('xlsx')}
					>
						XLSX - Excel Spreadsheet
					</button>
				</div>
			)}
		</div>
	);
};

