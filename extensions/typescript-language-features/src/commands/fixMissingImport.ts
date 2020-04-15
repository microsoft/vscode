/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as Proto from '../protocol';
import { ExecuteAllFixesCommand } from './executeAllFixes';

export class FixMissingImportCommand extends ExecuteAllFixesCommand {
	public readonly id = 'typescript.fixMissingImport';
	protected readonly fixName = 'import';

	protected filterActions(actions: Proto.CodeFixAction[]) {
		const getImportName = (action: Proto.CodeFixAction) => action.changes[0].textChanges[0].newText.split(' ')[1];
		const imports = new Set();
		const checkImportName = (name: string) => !imports.has(name) && imports.add(name);
		return actions.filter(action => checkImportName(getImportName(action)));
	}
}
