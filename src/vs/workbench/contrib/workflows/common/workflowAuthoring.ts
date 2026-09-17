/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkflowDefinition, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';
import { WorkflowCatalog, WorkflowTemplateEntry } from './workflowCatalog.js';

export interface WorkflowAuthoringScope {
	readonly workspace?: URI;
	readonly sources?: readonly WorkflowSource['kind'][];
}

export interface WorkflowAuthoringDocument {
	readonly entry: WorkflowTemplateEntry;
	readonly content: string;
	readonly revision: string;
}

export const IWorkflowAuthoringService = createDecorator<IWorkflowAuthoringService>('workflowAuthoringService');

/** Authors reusable definitions without touching run snapshots or execution authority. */
export interface IWorkflowAuthoringService {
	readonly _serviceBrand: undefined;
	getCatalog(scope: WorkflowAuthoringScope): Promise<WorkflowCatalog>;
	readWorkflow(key: string, scope: WorkflowAuthoringScope): Promise<WorkflowAuthoringDocument>;
	validateWorkflow(definition: unknown, scope: WorkflowAuthoringScope, replacing?: string): Promise<WorkflowDefinition>;
	createWorkflow(definition: unknown, target: 'user' | URI, scope: WorkflowAuthoringScope, guard: () => void): Promise<WorkflowAuthoringDocument>;
	updateWorkflow(key: string, definition: unknown, revision: string, scope: WorkflowAuthoringScope, guard: () => void): Promise<WorkflowAuthoringDocument>;
}
