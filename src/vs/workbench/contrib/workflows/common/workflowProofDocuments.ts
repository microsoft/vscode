/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { WorkflowRun } from '../../../../platform/workflow/common/workflow.js';

export const workflowProofDocumentScheme = 'vscode-workflow-proof';

export function getWorkflowProofDocumentUri(run: Pick<WorkflowRun, 'id' | 'session'>, checkpointId: string): URI {
	return URI.from({ scheme: workflowProofDocumentScheme, path: '/proof.json', query: JSON.stringify({ session: run.session, runId: run.id, checkpointId }) });
}

export function parseWorkflowProofDocumentUri(resource: URI): { session: URI; runId: string; checkpointId: string } {
	const value: { session?: unknown; runId?: unknown; checkpointId?: unknown } | null = JSON.parse(resource.query);
	if (resource.scheme !== workflowProofDocumentScheme || !value || typeof value !== 'object'
		|| typeof value.session !== 'string' || !value.session
		|| typeof value.runId !== 'string' || !value.runId
		|| typeof value.checkpointId !== 'string' || !value.checkpointId) {
		throw new Error(localize('workflow.invalidProofDocument', "The workflow proof reference is not valid."));
	}
	return { session: URI.parse(value.session), runId: value.runId, checkpointId: value.checkpointId };
}
