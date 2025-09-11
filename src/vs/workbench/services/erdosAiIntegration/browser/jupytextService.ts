/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { reads, writes } from './jupytext/jupytext.js';
import { NotebookNode } from './jupytext/types.js';
import { IJupytextService, JupytextOptions } from '../common/jupytextService.js';

export class JupytextService extends Disposable implements IJupytextService {
	declare readonly _serviceBrand: undefined;

	constructor() {
		super();
	}

	convertNotebookToText(notebookContent: string, options: JupytextOptions): string {
		try {
			// Parse and convert
			const notebook: NotebookNode = JSON.parse(notebookContent);
			return writes(notebook, options);
		} catch (error) {
			throw new Error(`Failed to convert notebook to text: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	convertTextToNotebook(textContent: string, options: JupytextOptions): string {
		try {
			// Convert text to notebook and return as JSON string
			const notebook = reads(textContent, options);
			return JSON.stringify(notebook, null, 2);
		} catch (error) {
			throw new Error(`Failed to convert text to notebook: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
