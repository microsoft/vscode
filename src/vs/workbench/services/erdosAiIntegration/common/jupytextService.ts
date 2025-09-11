/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IJupytextService = createDecorator<IJupytextService>('jupytextService');

export interface JupytextOptions {
	extension: string;
	format_name: string;
}

export interface IJupytextService {
	readonly _serviceBrand: undefined;
	
	convertNotebookToText(notebookContent: string, options: JupytextOptions): string;
	convertTextToNotebook(textContent: string, options: JupytextOptions): string;
}

/**
 * Helper function to get the file extension for a given Jupytext format
 */
export function getExtensionForFormat(format: string): string {
	switch (format) {
		case 'percent':
		case 'py:percent':
			return '.py';
		case 'md':
		case 'markdown':
			return '.md';
		case 'rmd':
		case 'rmarkdown':
			return '.Rmd';
		case 'qmd':
		case 'quarto':
			return '.qmd';
		case 'jl':
		case 'julia':
			return '.jl';
		case 'r':
			return '.R';
		case 'light':
			return '.py';
		case 'nomarker':
			return '.py';
		case 'hydrogen':
			return '.py';
		case 'spin':
			return '.R';
		case 'sphinx':
			return '.py';
		case 'pandoc':
			return '.md';
		default:
			return '.py';
	}
}
