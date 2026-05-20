/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { ILogService } from '../../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart } from '../../../../../vscodeTypes';
import { ToolName } from '../../../../tools/common/toolNames';
import { IToolsService } from '../../../../tools/common/toolsService';
import { IClaudePlanFileTracker } from '../claudePlanFileTracker';
import { ClaudeToolPermissionContext, ClaudeToolPermissionResult, IClaudeToolPermissionHandler } from '../claudeToolPermission';
import { registerToolPermissionHandler } from '../claudeToolPermissionRegistry';
import { ClaudeToolNames, ExitPlanModeInput } from '../claudeTools';

/** A single approve action shown in the plan review widget. Mirrors
 * `IChatPlanApprovalAction` from the workbench side. */
interface IReviewPlanAction {
	id?: string;
	label: string;
	default?: boolean;
	description?: string;
}

/** Input passed to the `vscode_reviewPlan` core tool. Mirrors the
 * subset of `IChatPlanReview` the tool accepts. */
interface IReviewPlanInput {
	title: string;
	content: string;
	plan?: string;
	actions: IReviewPlanAction[];
	canProvideFeedback: boolean;
}

/**
 * Shape returned by the `vscode_reviewPlan` core tool. Mirrors
 * `IChatPlanReviewResult` from the workbench side.
 */
interface IReviewPlanResult {
	action?: string;
	actionId?: string;
	rejected: boolean;
	feedback?: string;
}

/**
 * Validate that a value parsed from the tool result has the shape we
 * expect for {@link IReviewPlanResult}. Cheap, structural — keeps a
 * malformed payload from silently flowing into permission decisions.
 */
function isReviewPlanResult(value: unknown): value is IReviewPlanResult {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const v = value as Record<string, unknown>;
	if (typeof v.rejected !== 'boolean') {
		return false;
	}
	if (v.action !== undefined && typeof v.action !== 'string') {
		return false;
	}
	if (v.actionId !== undefined && typeof v.actionId !== 'string') {
		return false;
	}
	if (v.feedback !== undefined && typeof v.feedback !== 'string') {
		return false;
	}
	return true;
}

/** Stable identifiers for the approve actions. Compared programmatically
 * via `parsed.actionId` so they survive localization. */
const APPROVE_ID = 'approve';
const APPROVE_ACCEPT_EDITS_ID = 'approveAcceptEdits';
const APPROVE_BYPASS_ID = 'approveBypass';

/**
 * Handler for the ExitPlanMode tool. Renders the docked plan-review widget
 * with these outcomes:
 *  - Approve: continue in the current permission mode
 *  - Approve & Auto-Edit: continue and switch to `acceptEdits`
 *  - Approve & Bypass Approvals: continue and switch to `bypassPermissions`
 *  - Reject (with optional feedback): deny so Claude revises the plan
 */
export class ExitPlanModeToolHandler implements IClaudeToolPermissionHandler<ClaudeToolNames.ExitPlanMode> {
	public readonly toolNames = [ClaudeToolNames.ExitPlanMode] as const;

	constructor(
		@IToolsService private readonly toolsService: IToolsService,
		@ILogService private readonly logService: ILogService,
		@IClaudePlanFileTracker private readonly planFileTracker: IClaudePlanFileTracker,
	) { }

	public async handle(
		_toolName: ClaudeToolNames.ExitPlanMode,
		input: ExitPlanModeInput,
		{ toolInvocationToken, sessionId }: ClaudeToolPermissionContext
	): Promise<ClaudeToolPermissionResult> {
		try {
			// Claude writes the plan markdown to ~/.claude/plans/*.md via the
			// Write tool before invoking ExitPlanMode. The dispatch layer
			// observes that tool_use and records the path on the tracker
			// (see claudeMessageDispatch.handleAssistantMessage) so the
			// review widget can surface it for inline editor comments.
			const planUri = sessionId ? this.planFileTracker.getLastPlanFile(sessionId) : undefined;
			if (!planUri) {
				// Without a plan URI the review widget falls back to the
				// inline `content` (no inline comments / Open Plan). Log so
				// missing tracker hookups don't go unnoticed.
				this.logService.warn(`[ExitPlanMode] No plan file recorded for session ${sessionId ?? '<unknown>'}; review widget will not offer inline plan comments.`);
			}

			const reviewInput: IReviewPlanInput = {
				title: l10n.t("Claude's Plan"),
				content: input.plan ?? '',
				actions: [
					{ id: APPROVE_ID, label: l10n.t('Approve'), default: true },
					{
						id: APPROVE_ACCEPT_EDITS_ID,
						label: l10n.t('Approve & Auto-Edit'),
						description: l10n.t('Auto-accept file edits for the rest of this session. Other tools still prompt for approval.'),
					},
					{
						id: APPROVE_BYPASS_ID,
						label: l10n.t('Approve & Bypass Approvals'),
						description: l10n.t('Skip approval prompts for the rest of this session.'),
					},
				],
				canProvideFeedback: true,
			};
			if (planUri) {
				reviewInput.plan = planUri.toString();
			}

			const result = await this.toolsService.invokeTool(ToolName.CoreReviewPlan, {
				input: reviewInput,
				toolInvocationToken,
			}, CancellationToken.None);

			const firstResultPart = result.content.at(0);
			if (!(firstResultPart instanceof LanguageModelTextPart)) {
				return { behavior: 'deny', message: 'Plan review returned no result.' };
			}

			let parsed: IReviewPlanResult;
			try {
				const raw = JSON.parse(firstResultPart.value) as unknown;
				if (!isReviewPlanResult(raw)) {
					this.logService.warn('[ExitPlanMode] Review result did not match the expected shape.');
					return { behavior: 'deny', message: 'Plan review returned an invalid result.' };
				}
				parsed = raw;
			} catch (e) {
				this.logService.warn(`[ExitPlanMode] Failed to parse review result: ${e?.message ?? e}`);
				return { behavior: 'deny', message: 'Plan review returned an invalid result.' };
			}

			// Rejection (with or without feedback).
			if (parsed.rejected) {
				const feedback = parsed.feedback?.trim();
				return {
					behavior: 'deny',
					message: feedback
						? `The user rejected the plan with this feedback:\n\n${feedback}`
						: 'The user declined the plan, maybe ask why?',
				};
			}

			// Feedback alongside any approve action wins: the SDK has no
			// affordance to attach a message to an `allow` result, so we
			// route through `deny` with the feedback to let Claude revise
			// the plan. The user can choose bypass again on the revised
			// plan when they no longer have feedback to add.
			const feedback = parsed.feedback?.trim();
			if (feedback) {
				this.logService.info(`[ExitPlanMode] User picked ${parsed.actionId ?? '<unknown>'} with feedback; routing as deny+feedback so Claude revises the plan. Mode change (if any) will need to be re-selected on the revised plan.`);
				return {
					behavior: 'deny',
					message: `The user has feedback on the plan before proceeding:\n\n${feedback}`,
				};
			}

			if (parsed.actionId === APPROVE_BYPASS_ID) {
				return {
					behavior: 'allow',
					updatedInput: input,
					updatedPermissions: [{
						type: 'setMode',
						mode: 'bypassPermissions',
						destination: 'session',
					}],
				};
			}

			if (parsed.actionId === APPROVE_ACCEPT_EDITS_ID) {
				return {
					behavior: 'allow',
					updatedInput: input,
					updatedPermissions: [{
						type: 'setMode',
						mode: 'acceptEdits',
						destination: 'session',
					}],
				};
			}

			return { behavior: 'allow', updatedInput: input };
		} catch (e) {
			this.logService.warn(`[ExitPlanMode] Failed to invoke review plan tool: ${e?.message ?? e}`);
			return { behavior: 'deny', message: 'Failed to show plan review.' };
		}
	}
}

// Self-register the handler
registerToolPermissionHandler(
	[ClaudeToolNames.ExitPlanMode],
	ExitPlanModeToolHandler
);
