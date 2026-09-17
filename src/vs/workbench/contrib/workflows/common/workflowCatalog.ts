/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkflowCheckpointType, WorkflowDefinition, WorkflowSnapshot, WorkflowSource } from '../../../../platform/workflow/common/workflow.js';

export interface WorkflowCatalogDiagnostic {
	readonly severity: 'error' | 'warning';
	readonly code: 'parse' | 'invalid' | 'conflict' | 'version' | 'source' | 'unresolved';
	readonly message: string;
	readonly resource?: URI;
}

export interface WorkflowCatalogEntry<T extends WorkflowDefinition | WorkflowCheckpointType> {
	readonly key: string;
	readonly label: string;
	readonly resource?: URI;
	readonly source: WorkflowSource;
	readonly readOnly: boolean;
	readonly definition?: T;
	readonly diagnostics: readonly WorkflowCatalogDiagnostic[];
}

export type WorkflowTemplateEntry = WorkflowCatalogEntry<WorkflowDefinition>;
export type WorkflowCheckpointEntry = WorkflowCatalogEntry<WorkflowCheckpointType>;

export interface WorkflowCatalog {
	readonly workflows: readonly WorkflowTemplateEntry[];
	readonly checkpointTypes: readonly WorkflowCheckpointEntry[];
	readonly diagnostics: readonly WorkflowCatalogDiagnostic[];
}

export const IWorkflowCatalogService = createDecorator<IWorkflowCatalogService>('workflowCatalogService');

export interface IWorkflowCatalogService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly userWorkflowsHome: URI;
	getCatalog(workspace?: URI): Promise<WorkflowCatalog>;
	watch(workspace?: URI): IDisposable;
	resolve(entry: WorkflowTemplateEntry, workspace?: URI): Promise<WorkflowSnapshot>;
	createWorkflow(definition: WorkflowDefinition, target: 'user' | URI, guard?: () => void): Promise<URI>;
	createCheckpointType(definition: WorkflowCheckpointType, target: 'user' | URI): Promise<URI>;
}

export function getWorkflowSourceCounts(catalog: WorkflowCatalog): Readonly<Record<WorkflowSource['kind'], number>> {
	const counts: Record<WorkflowSource['kind'], number> = { workspace: 0, user: 0, extension: 0, builtin: 0 };
	for (const entry of catalog.workflows) {
		counts[entry.source.kind]++;
	}
	return counts;
}
