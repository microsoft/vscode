/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TodoStoreOperation = 'read' | 'write' | 'mixed';
export type TodoStoreTarget = 'todos' | 'todo_deps' | 'both';

export type TodoStoreOperationEvent = {
	operation: TodoStoreOperation;
	target: TodoStoreTarget;
	toolCallId: string;
	provider: string;
	agentSessionId: string;
	isSubagentSession: boolean;
};

export type TodoStoreOperationClassification = {
	operation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the SQL operation read from, wrote to, or both read from and wrote to todo storage.' };
	target: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the SQL operation referenced todo items, todo dependencies, or both.' };
	toolCallId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifier of the SQL tool call, used to correlate with generic tool telemetry.' };
	provider: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The provider handling the agent host session.' };
	agentSessionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The agent host session identifier.' };
	isSubagentSession: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the todo storage operation belongs to a subagent session.' };
	owner: 'bhavyaus';
	comment: 'Tracks successful Agent Host SQL operations that access todo item or dependency storage.';
};
