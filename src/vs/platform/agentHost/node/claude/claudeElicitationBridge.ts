/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ElicitationRequest, ElicitationResult } from '@anthropic-ai/claude-agent-sdk';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ChatInputResponseKind } from '../../common/state/sessionState.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { buildElicitationRequest, cancelledElicitationResult, elicitationResultFromAnswers } from './claudeElicitation.js';

/**
 * Dependencies for {@link handleElicitation}. Kept narrow (just a session
 * lookup) so the agent's `_sessions` map stays private — mirrors
 * {@link import('./claudeCanUseTool.js').IClaudeCanUseToolDeps}. There is no
 * `configurationService` because elicitation has no unattended auto-cancel:
 * Claude always has a UI, and parked requests unwind on teardown.
 */
export interface IClaudeElicitationDeps {
	readonly getSession: (sessionId: string) => ClaudeAgentSession | undefined;
}

/**
 * SDK `onElicitation` callback bridge. Fires a `ChatInputRequested` action and
 * parks on {@link ClaudeAgentSession.requestUserInput} until the
 * workbench dispatches a response, then maps it back to an
 * {@link ElicitationResult} for the MCP server.
 *
 * Routing note: elicitation is structured user input, so it flows through the
 * `requestUserInput` channel `AskUserQuestion` uses — NOT the
 * `pending_confirmation` permission gate.
 *
 * Result mapping: only an explicit user Decline returns `decline`; a missing
 * session, a pre-aborted request, and an SDK-aborted park all return `cancel`
 * (see phase 10.6 Decisions).
 */
export async function handleElicitation(
	deps: IClaudeElicitationDeps,
	sessionId: string,
	request: ElicitationRequest,
	options: { readonly signal: AbortSignal },
): Promise<ElicitationResult> {
	const session = deps.getSession(sessionId);
	if (!session) {
		return cancelledElicitationResult();
	}

	const requestId = generateUuid();

	if (options.signal.aborted) {
		return cancelledElicitationResult();
	}

	// A request with neither a URL nor any questions can't be meaningfully
	// presented: a `url`-mode request missing its URL, or a `form` whose schema
	// yielded no representable fields. The workbench would inject a required
	// generic text question whose answer this translator then discards — falsely
	// reporting the elicitation as accepted. Cancel instead of surfacing it.
	const chatRequest = buildElicitationRequest(requestId, request);
	if (!chatRequest.url && !chatRequest.questions?.length) {
		return cancelledElicitationResult();
	}

	// Observe the SDK's per-request abort signal so a host parked on
	// `requestUserInput` unwinds promptly when the SDK cancels the elicitation
	// (subprocess teardown, upstream abort). Mirrors `claudeCanUseTool.ts`.
	const abortHandler = () => {
		session.respondToUserInputRequest(requestId, ChatInputResponseKind.Cancel);
	};
	options.signal.addEventListener('abort', abortHandler);
	try {
		const { response, answers } = await session.requestUserInput(chatRequest);
		return elicitationResultFromAnswers(request, response, answers);
	} finally {
		options.signal.removeEventListener('abort', abortHandler);
	}
}
