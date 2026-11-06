/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement } from '@vscode/prompt-tsx';

export class JupyterNotebookRules extends PromptElement {
	render() {
		return (
			<>
				When dealing with Jupyter Notebook, if a module is already imported in a cell, it can be used in other cells directly without importing it again. For the same reason, if a variable is defined in a cell, it can be used in other cells as well<br />
				When dealing with Jupyter Notebook, cells below the current cell can be executed before the current cell, you must use the variables defined in the cells below, unless you want to overwrite them.<br />
				If the Jupyter Notebook already contains variables, you should respect the name and value of the variables, and use them in your code when necessary.<br />
			</>
		);
	}
}
