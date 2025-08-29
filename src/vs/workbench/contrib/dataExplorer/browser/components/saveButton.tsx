/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useState } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { FileSaver } from '../../../../services/dataExplorer/browser/fileSaver.js';

export interface SaveButtonProps {
	data: GridData;
	format?: 'csv' | 'tsv';
	className?: string;
	onSaveStart?: () => void;
	onSaveComplete?: () => void;
	onSaveError?: (error: Error) => void;
}

/**
 * Save button component that handles file saving operations
 */
export const SaveButton: React.FC<SaveButtonProps> = ({ 
	data, 
	format = 'csv', 
	className,
	onSaveStart,
	onSaveComplete,
	onSaveError
}) => {
	const [isSaving, setIsSaving] = useState(false);
	
	const handleSave = async () => {
		setIsSaving(true);
		onSaveStart?.();
		
		try {
			await FileSaver.saveFile(data, format);
			onSaveComplete?.();
		} catch (error) {
			console.error('Error saving file:', error);
			const saveError = error instanceof Error ? error : new Error('Unknown error occurred while saving');
			onSaveError?.(saveError);
		} finally {
			setIsSaving(false);
		}
	};
	
	return (
		<button 
			className={`save-button ${className || ''}`}
			onClick={handleSave} 
			disabled={isSaving}
			title={`Save as ${format.toUpperCase()}`}
		>
			{isSaving ? 'Saving...' : `Save as ${format.toUpperCase()}`}
		</button>
	);
};

