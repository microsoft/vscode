/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState, useCallback } from 'react';
import { GridData } from '../../../../services/dataExplorer/common/dataExplorerTypes.js';
import { FileSaver } from '../../../../services/dataExplorer/browser/fileSaver.js';

export interface FileSaverState {
	isSaving: boolean;
	error: Error | null;
	lastSavedFormat: 'csv' | 'tsv' | 'xlsx' | null;
}

export interface UseFileSaverResult extends FileSaverState {
	saveFile: (data: GridData, format?: 'csv' | 'tsv' | 'xlsx') => Promise<void>;
	clearError: () => void;
	reset: () => void;
}

/**
 * Hook for managing file saving state and operations
 */
export const useFileSaver = (): UseFileSaverResult => {
	const [state, setState] = useState<FileSaverState>({
		isSaving: false,
		error: null,
		lastSavedFormat: null
	});

	const saveFile = useCallback(async (data: GridData, format: 'csv' | 'tsv' | 'xlsx' = 'csv') => {
		setState(prev => ({
			...prev,
			isSaving: true,
			error: null
		}));

		try {
			await FileSaver.saveFile(data, format);
			setState(prev => ({
				...prev,
				isSaving: false,
				lastSavedFormat: format,
				error: null
			}));
		} catch (error) {
			const saveError = error instanceof Error ? error : new Error('Unknown error occurred while saving');
			setState(prev => ({
				...prev,
				isSaving: false,
				error: saveError
			}));
			throw saveError; // Re-throw to allow caller to handle
		}
	}, []);

	const clearError = useCallback(() => {
		setState(prev => ({
			...prev,
			error: null
		}));
	}, []);

	const reset = useCallback(() => {
		setState({
			isSaving: false,
			error: null,
			lastSavedFormat: null
		});
	}, []);

	return {
		...state,
		saveFile,
		clearError,
		reset
	};
};

