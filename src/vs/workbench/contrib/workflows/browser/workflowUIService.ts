/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkflowCheckpointEntry, WorkflowTemplateEntry } from '../common/workflowCatalog.js';
import { WorkflowSelection } from '../common/workflowService.js';

export type { WorkflowSelection } from '../common/workflowService.js';

export type WorkflowRevealTurn = (turnId: string) => void | Promise<void>;

export interface WorkflowGroupChoice {
	readonly id: string;
	readonly label: string;
}

export interface IWorkflowUIService {
	readonly _serviceBrand: undefined;
	/** Returns null for an explicit removal, and undefined when the picker is dismissed. */
	selectWorkflow(workspace?: URI, selection?: WorkflowSelection, anchor?: HTMLElement): Promise<WorkflowSelection | null | undefined>;
	showWorkflow(session: URI, revealTurn?: WorkflowRevealTurn): Promise<void>;
	openEditor(entry: WorkflowTemplateEntry, workspace?: URI): Promise<void>;
	openCheckpointType(entry: WorkflowCheckpointEntry, workspace?: URI): Promise<void>;
	useInNewSession(entry: WorkflowTemplateEntry, workspace?: URI): Promise<void>;
	registerSessionStarter(handler: (selection: WorkflowSelection, workspace?: URI) => Promise<void>): IDisposable;
	registerGroupProvider(provider: (workspace?: URI) => readonly WorkflowGroupChoice[]): IDisposable;
	getGroups(workspace?: URI): readonly WorkflowGroupChoice[];
}

export const IWorkflowUIService = createDecorator<IWorkflowUIService>('workflowUIService');
