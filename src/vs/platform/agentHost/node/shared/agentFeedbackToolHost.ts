/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import { IAgentFeedbackToolHost } from '../../common/agentFeedbackAnnotations.js';
import { ActionType } from '../../common/state/protocol/common/actions.js';
import { AnnotationsState, URI } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../agentHostStateManager.js';
import { applyFeedbackTool, feedbackServerToolDefinitions } from './agentFeedbackServerTools.js';

/**
 * Bridges the agent-host feedback server tools to the authoritative state
 * tree. Agents execute a feedback tool by name; the host reads the session's
 * current annotation state, runs the pure {@link applyFeedbackTool} executor,
 * dispatches the resulting annotation actions through the state manager (the
 * single writer), and returns the textual tool result to the agent.
 *
 * The host also advertises the feedback tools on a session's
 * {@link SessionState.serverTools} so clients see them as server-provided.
 */
export class AgentFeedbackToolHost implements IAgentFeedbackToolHost {

	constructor(private readonly _stateManager: AgentHostStateManager) { }

	/**
	 * Advertises the feedback tools as server tools for {@link sessionUri} so
	 * clients know the agent host owns and executes them.
	 */
	advertise(sessionUri: URI): void {
		this._stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionServerToolsChanged,
			tools: feedbackServerToolDefinitions,
		});
	}

	/**
	 * Executes a feedback server tool for {@link sessionUri} against the
	 * session's current annotation state, dispatching any resulting annotation
	 * actions, and returns the textual tool result.
	 */
	executeTool(sessionUri: URI, toolName: string, rawArgs: unknown): string {
		const annotationsUri = buildAnnotationsUri(sessionUri);
		const snapshot = this._stateManager.getSnapshot(annotationsUri);
		const state: AnnotationsState = (snapshot?.state as AnnotationsState | undefined) ?? { annotations: [] };
		const outcome = applyFeedbackTool(state, sessionUri, toolName, rawArgs);
		for (const action of outcome.actions) {
			this._stateManager.dispatchServerAction(annotationsUri, action);
		}
		return outcome.result;
	}
}
