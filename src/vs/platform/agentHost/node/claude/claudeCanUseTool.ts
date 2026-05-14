/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk';
import { ClaudePermissionMode, ClaudeSessionConfigKey } from '../../common/claudeSessionConfigKeys.js';
import { SessionInputResponseKind, ToolCallPendingConfirmationState, ToolCallStatus } from '../../common/state/protocol/state.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { ClaudeAgentSession } from './claudeAgentSession.js';
import { buildAskUserSessionInputQuestions, buildExitPlanModeConfirmationState, flattenAskUserAnswers, parseAskUserQuestionInput } from './claudeInteractiveTools.js';
import { getClaudeConfirmationTitle, getClaudePermissionKind, getClaudeToolDisplayName, getClaudeToolPath, INTERACTIVE_CLAUDE_TOOLS } from './claudeToolDisplay.js';

/**
 * Dependencies for {@link handleCanUseTool}. Kept narrow: a session
 * lookup callback (so the agent's `_sessions` map stays private) and
 * the configuration service for the one mutation point
 * (`ExitPlanMode` Approve persists `permissionMode = 'acceptEdits'`).
 */
export interface IClaudeCanUseToolDeps {
	readonly getSession: (sessionId: string) => ClaudeAgentSession | undefined;
	readonly configurationService: IAgentConfigurationService;
}

/**
 * SDK `canUseTool` `options` shape. Re-stated here to keep this module
 * decoupled from the agent's import wall.
 */
export interface IClaudeCanUseToolOptions {
	readonly suggestions?: PermissionUpdate[];
	readonly signal: AbortSignal;
	readonly blockedPath?: string;
	readonly toolUseID: string;
}

/**
 * SDK `canUseTool` callback. Fires `pending_confirmation` and parks
 * on {@link ClaudeAgentSession.requestPermission} (or
 * {@link ClaudeAgentSession.requestUserInput} for `AskUserQuestion`)
 * until the workbench dispatches a response.
 *
 * **Pure UI bridge.** No permission judgement of its own — the SDK
 * owns auto-approval / auto-denial via `permissionMode`
 * ([sdk.d.ts:1558](../../../../../../extensions/copilot/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts#L1558))
 * and only invokes `canUseTool` for tools it has decided the host
 * needs to surface. The interactive built-ins (`AskUserQuestion`,
 * `ExitPlanMode`) are exempt from auto-approval and always reach
 * `canUseTool` regardless of mode — their "permission" is itself the
 * user-facing question.
 *
 * Note: protocol-level auto-approve for write tools lives in
 * `agentSideEffects.ts:_handleToolReady`, which subscribes to the
 * `pending_confirmation` signal and synchronously calls
 * `respondToPermissionRequest`. The atomic register-then-fire
 * invariant lives inside {@link ClaudeAgentSession.requestPermission}
 * (via `PendingRequestRegistry.registerAndFire`).
 */
export async function handleCanUseTool(
	deps: IClaudeCanUseToolDeps,
	sessionId: string,
	toolName: string,
	input: Record<string, unknown>,
	options: IClaudeCanUseToolOptions,
): Promise<PermissionResult> {
	const session = deps.getSession(sessionId);
	if (!session) {
		return { behavior: 'deny', message: 'Session is no longer active' };
	}

	// Observe the SDK's per-request abort signal so a host parked on
	// `requestPermission` / `requestUserInput` unwinds promptly when
	// the SDK cancels the canUseTool call (subprocess teardown,
	// upstream abort). Both `respondTo*` methods are no-ops if the
	// id is not pending, so it is safe to fire both regardless of
	// which channel this tool happens to use.
	if (options.signal.aborted) {
		return { behavior: 'deny', message: 'SDK aborted the tool request' };
	}
	const abortHandler = () => {
		session.respondToPermissionRequest(options.toolUseID, false);
		session.respondToUserInputRequest(options.toolUseID, SessionInputResponseKind.Cancel);
	};
	options.signal.addEventListener('abort', abortHandler);
	try {
		return await dispatchCanUseTool(deps, session, toolName, input, options);
	} finally {
		options.signal.removeEventListener('abort', abortHandler);
	}
}

async function dispatchCanUseTool(
	deps: IClaudeCanUseToolDeps,
	session: ClaudeAgentSession,
	toolName: string,
	input: Record<string, unknown>,
	options: IClaudeCanUseToolOptions,
): Promise<PermissionResult> {
	// Interactive tools (`AskUserQuestion`, `ExitPlanMode`) are
	// exempt from SDK `permissionMode` auto-approval, so they reach
	// `canUseTool` even under `bypassPermissions`. Routing then
	// splits by tool semantics rather than by the
	// `INTERACTIVE_CLAUDE_TOOLS` flag itself: `ExitPlanMode` is a
	// permission gate (Approve/Deny on whether to leave plan mode)
	// so it uses the standard `pending_confirmation` channel with
	// custom button labels; `AskUserQuestion` is structured user
	// input (a question carousel) so it routes through
	// `requestUserInput` / `SessionInputRequested`.
	if (INTERACTIVE_CLAUDE_TOOLS.has(toolName)) {
		return handleInteractiveTool(deps, session, toolName, input, options.toolUseID);
	}

	const permissionKind = getClaudePermissionKind(toolName);
	const displayName = getClaudeToolDisplayName(toolName);
	const permissionPath = options.blockedPath ?? getClaudeToolPath(toolName, input);
	const toolInputJson = JSON.stringify(input);
	const state: ToolCallPendingConfirmationState = {
		status: ToolCallStatus.PendingConfirmation,
		toolCallId: options.toolUseID,
		toolName,
		displayName,
		invocationMessage: displayName,
		toolInput: toolInputJson,
		confirmationTitle: getClaudeConfirmationTitle(toolName),
	};

	const approved = await session.requestPermission({
		toolUseID: options.toolUseID,
		state,
		permissionKind,
		...(permissionPath !== undefined ? { permissionPath } : {}),
	});
	return approved
		? { behavior: 'allow', updatedInput: input }
		: { behavior: 'deny', message: 'User declined' };
}

/**
 * Dispatch the two interactive built-in tools (S3.5). They share a
 * dispatcher only because both are exempt from SDK
 * `permissionMode` auto-approval; routing then splits by tool
 * semantics. Caller must guard with {@link INTERACTIVE_CLAUDE_TOOLS} —
 * the `default` branch is defensive and should never fire.
 */
function handleInteractiveTool(
	deps: IClaudeCanUseToolDeps,
	session: ClaudeAgentSession,
	toolName: string,
	input: Record<string, unknown>,
	toolUseID: string,
): Promise<PermissionResult> {
	switch (toolName) {
		case 'ExitPlanMode':
			return handleExitPlanMode(deps, session, input, toolUseID);
		case 'AskUserQuestion':
			return handleAskUserQuestion(session, input, toolUseID);
		default:
			return Promise.resolve({ behavior: 'deny', message: `Unsupported interactive tool: ${toolName}` });
	}
}

/**
 * `ExitPlanMode` (S3.5b): render the plan body inside the standard
 * tool-confirmation card (`pending_confirmation` channel — same path
 * normal write tools take), persist `permissionMode = 'acceptEdits'`
 * on Approve (next `sendMessage` forwards via `Query.setPermissionMode`),
 * deny with production-mirrored wording on cancel.
 *
 * NOTE: we MUST NOT call `session.setPermissionMode` here. That issues
 * a live SDK control request on the same channel the SDK is using to
 * deliver the canUseTool request — interleaving a second control
 * request before returning the canUseTool response collides with the
 * SDK's loop and the turn never resumes. Production updates state
 * post-tool-result (`claudeMessageDispatch.ts:328` →
 * `setPermissionModeForSession`); we mirror by writing
 * `IAgentConfigurationService` and letting `sendMessage`'s
 * `entry.setPermissionMode(...)` (between turns) do the live forward.
 */
async function handleExitPlanMode(
	deps: IClaudeCanUseToolDeps,
	session: ClaudeAgentSession,
	input: Record<string, unknown>,
	toolUseID: string,
): Promise<PermissionResult> {
	const approved = await session.requestPermission({
		toolUseID,
		state: buildExitPlanModeConfirmationState(input, toolUseID),
		permissionKind: getClaudePermissionKind('ExitPlanMode'),
	});
	if (approved) {
		deps.configurationService.updateSessionConfig(session.sessionUri.toString(), {
			[ClaudeSessionConfigKey.PermissionMode]: 'acceptEdits' satisfies ClaudePermissionMode,
		});
		return { behavior: 'allow', updatedInput: input };
	}
	return { behavior: 'deny', message: 'The user declined the plan, maybe ask why?' };
}

/**
 * `AskUserQuestion` (S3.5a): translate the SDK's question carousel
 * into a {@link SessionInputRequest}, await the workbench answer,
 * and re-key answers by question text (matching the production
 * extension's `Record<question, value>` contract).
 */
async function handleAskUserQuestion(
	session: ClaudeAgentSession,
	input: Record<string, unknown>,
	toolUseID: string,
): Promise<PermissionResult> {
	const askInput = parseAskUserQuestionInput(input);
	if (!askInput) {
		return { behavior: 'deny', message: 'AskUserQuestion called without questions' };
	}

	const answer = await session.requestUserInput({
		id: toolUseID,
		questions: buildAskUserSessionInputQuestions(askInput),
	});
	if (answer.response !== SessionInputResponseKind.Accept || !answer.answers) {
		return { behavior: 'deny', message: 'The user cancelled the question' };
	}

	const answers = flattenAskUserAnswers(askInput, answer.answers);
	if (Object.keys(answers).length === 0) {
		return { behavior: 'deny', message: 'The user cancelled the question' };
	}
	return { behavior: 'allow', updatedInput: { ...input, answers } };
}
