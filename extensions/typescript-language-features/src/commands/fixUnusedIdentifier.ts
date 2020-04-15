/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExecuteAllFixesCommand } from './executeAllFixes';

export class FixUnusedIdentifierCommand extends ExecuteAllFixesCommand {
	public readonly id = 'typescript.fixUnusedIdentifier';
	protected readonly fixName = 'unusedIdentifier';
}
