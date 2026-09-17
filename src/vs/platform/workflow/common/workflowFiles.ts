/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const WORKFLOW_MAX_FILE_SIZE = 1_048_576;

export function getWorkflowFileKind(name: string): 'workflow' | 'checkpoint' | undefined {
	return name.endsWith('.workflow.jsonc') ? 'workflow' : name.endsWith('.checkpoint.jsonc') ? 'checkpoint' : undefined;
}
