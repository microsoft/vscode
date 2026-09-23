/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionEvent, SessionEventPayload } from '@github/copilot-sdk';
import { getDurationString } from '../../../../base/common/date.js';
import { escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../base/common/htmlContent.js';
import { hasKey } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta, type AgentFusionProgressStatus } from '../../common/meta/agentSystemNotificationMeta.js';
import { readToolCallMeta, toToolCallMeta, type IFusionPhaseMeta } from '../../common/meta/agentToolCallMeta.js';
import { ResponsePartKind, ToolCallStatus, ToolCallConfirmationReason, ToolResultContentType, type ToolCallRunningState, type ToolCallCompletedState } from '../../common/state/sessionState.js';
import type { SystemNotificationResponsePart } from '../../common/state/protocol/state.js';

export const copilotFusionEventTypes = [
	'session.fusion_route_started', 'session.fusion_resolved', 'session.fusion_route_failed',
	'assistant.fusion_phase_started', 'assistant.fusion_phase_activity',
	'assistant.fusion_phase_completed', 'assistant.fusion_phase_failed', 'session.fusion_completed',
] as const;
export type CopilotFusionEvent = SessionEventPayload<typeof copilotFusionEventTypes[number]>;
const fusionEventTypes: ReadonlySet<string> = new Set(copilotFusionEventTypes);

export function isCopilotFusionEvent(event: SessionEvent): event is CopilotFusionEvent {
	return fusionEventTypes.has(event.type);
}

/** Provisional phase conversations are not the authoritative parent transcript. */
export function isProvisionalFusionConversationEvent(event: SessionEvent): boolean {
	switch (event.type) {
		case 'assistant.message':
		case 'tool.execution_start':
		case 'tool.execution_complete':
			return event.ephemeral === true && event.data.fusion !== undefined
				&& (event.data.fusion.commitId === undefined || event.data.fusion.commitId === null);
		default:
			return false;
	}
}

export interface ICopilotFusionProgressUpdate {
	readonly activity: string | undefined;
	readonly part?: SystemNotificationResponsePart;
	readonly phase?: { readonly toolCall: ToolCallRunningState | ToolCallCompletedState; readonly isNew: boolean };
}

type FusionPhase = SessionEventPayload<'assistant.fusion_phase_started'>['data'];

function patternLabel(pattern: SessionEventPayload<'session.fusion_resolved'>['data']['pattern']): string {
	switch (pattern) {
		case 'single': return localize('copilot.fusion.single', "Single");
		case 'cascade': return localize('copilot.fusion.cascade', "Cascade");
		case 'critique': return localize('copilot.fusion.critique', "Critique");
	}
}

function phaseLabel(kind: FusionPhase['phaseKind'], pattern: FusionPhase['pattern'] | undefined): string {
	switch (kind) {
		case 'primary': return localize('copilot.fusion.primary', "Main pass");
		case 'judge': return localize('copilot.fusion.judge', "Review pass");
		case 'repair': return localize('copilot.fusion.repair', "Fix-up pass");
		case 'draft': return pattern === 'critique' ? localize('copilot.fusion.draft', "First pass") : localize('copilot.fusion.primary', "Main pass");
		case 'critic': return localize('copilot.fusion.critic', "Critique pass");
		case 'revision': return localize('copilot.fusion.revision', "Revision pass");
		case 'follow_up': return localize('copilot.fusion.followUp', "Follow-up pass");
	}
}

function workflowDescription(pattern: FusionPhase['pattern']): string {
	switch (pattern) {
		case 'single': return localize('copilot.fusion.singleDescription', "Using Single: one solver will work on your request.");
		case 'cascade': return localize('copilot.fusion.cascadeDescription', "Using Cascade: a solver will work on your request, then another model will review and fix up the result if needed.");
		case 'critique': return localize('copilot.fusion.critiqueDescription', "Using Critique: a solver will draft a result, another model will critique it, and the original solver will revise it if needed.");
	}
}

function milestone(summary: string, status: AgentFusionProgressStatus, details?: string, description?: string): SystemNotificationResponsePart {
	const content = new MarkdownString().appendText(summary);
	if (description) {
		content.appendMarkdown('\n\n').appendMarkdown(escapeMarkdownSyntaxTokens(description));
	}
	if (details) {
		content.appendMarkdown('\n\n').appendText(details);
	}
	return {
		kind: ResponsePartKind.SystemNotification,
		content: { markdown: content.value },
		_meta: toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.FusionProgress, fusionStatus: status }),
	};
}

/** Shared live/history projection. Never copies phase content, prompts, or tool arguments. */
export class CopilotFusionProgress {
	private readonly _milestones = new Set<string>();
	private readonly _finishedFusions = new Set<string>();
	private _attemptId: string | undefined;
	private _fusionId: string | undefined;
	private _phase: FusionPhase | undefined;
	private _activity: string | undefined;
	private _inFlight = false;
	private _interrupted = false;
	private readonly _phaseTools = new Map<string, ToolCallRunningState | ToolCallCompletedState>();
	private readonly _patterns = new Map<string, FusionPhase['pattern']>();

	reset(): void {
		this._milestones.clear();
		this._finishedFusions.clear();
		this._attemptId = this._fusionId = undefined;
		this._phase = undefined;
		this._activity = undefined;
		this._inFlight = false;
		this._interrupted = false;
		this._phaseTools.clear();
		this._patterns.clear();
	}

	interrupt(timestamp?: string): ICopilotFusionProgressUpdate | undefined {
		if (!this._inFlight) {
			return undefined;
		}
		this._inFlight = false;
		this._interrupted = true;
		const phase = this._phase ? this._updatePhase(this._phase, 'cancelled', timestamp) : undefined;
		this._activity = undefined;
		this._phase = undefined;
		if (this._fusionId) {
			this._finishedFusions.add(this._fusionId);
		}
		return {
			activity: undefined,
			phase,
			part: phase ? undefined : milestone(localize('copilot.fusion.interrupted', "HydraFusion workflow interrupted"), 'cancelled'),
		};
	}

	accept(event: CopilotFusionEvent): ICopilotFusionProgressUpdate | undefined {
		if (event.agentId || this._interrupted) {
			return undefined;
		}
		const data = event.data;
		if (hasKey(data, { fusionId: true }) && typeof data.fusionId === 'string' && this._finishedFusions.has(data.fusionId)) {
			return undefined;
		}
		let part: SystemNotificationResponsePart | undefined;
		let phase: ICopilotFusionProgressUpdate['phase'];
		switch (event.type) {
			case 'session.fusion_route_started':
				this._inFlight = true;
				this._attemptId = event.data.attemptId;
				this._fusionId = undefined;
				this._phase = undefined;
				this._activity = localize('copilot.fusion.routing', "Choosing a HydraFusion workflow...");
				break;
			case 'session.fusion_resolved': {
				const d = event.data;
				if (!this._record(`route:${d.fusionId}`)) {
					return undefined;
				}
				this._inFlight = true;
				this._fusionId = d.fusionId;
				this._patterns.set(d.fusionId, d.pattern);
				const plan = d.phasePlan?.map(step => step.conditional
					? localize('copilot.fusion.conditionalPhase', "{0} (if needed)", phaseLabel(step.kind, d.pattern))
					: phaseLabel(step.kind, d.pattern)).join(' → ');
				part = milestone(localize('copilot.fusion.selected', "Selected {0} workflow", patternLabel(d.pattern)), 'selected', plan, workflowDescription(d.pattern));
				this._activity = localize('copilot.fusion.preparing', "Preparing the {0} workflow...", patternLabel(d.pattern));
				break;
			}
			case 'assistant.fusion_phase_started': {
				const d = event.data;
				if (this._phase?.phaseId === d.phaseId && this._phase.fusionId === d.fusionId && this._phase.model === d.model) {
					return undefined;
				}
				this._inFlight = true;
				this._fusionId = d.fusionId;
				this._patterns.set(d.fusionId, d.pattern);
				this._phase = d;
				this._activity = localize('copilot.fusion.phaseRunning', "{0} running", phaseLabel(d.phaseKind, d.pattern));
				phase = this._updatePhase(d, 'running', event.timestamp);
				break;
			}
			case 'assistant.fusion_phase_activity': {
				const d = event.data;
				if (d.fusionId !== this._fusionId || d.phaseId !== this._phase?.phaseId) {
					return undefined;
				}
				const activity = d.activity === 'tool_started'
					? localize('copilot.fusion.toolRunning', "{0}: running a tool", phaseLabel(d.phaseKind, d.pattern))
					: localize('copilot.fusion.phaseRunning', "{0} running", phaseLabel(d.phaseKind, d.pattern));
				if (activity !== this._activity) {
					this._activity = activity;
					phase = this._updatePhase(this._phase, 'running', event.timestamp);
				}
				break;
			}
			case 'assistant.fusion_phase_completed': {
				const d = event.data;
				if (!this._record(`phase:${d.fusionId}:${d.phaseId}`)) {
					return undefined;
				}
				this._inFlight = true;
				this._fusionId = d.fusionId;
				phase = this._updatePhase(d, d.status, event.timestamp, d.durationMs, d.verdict);
				this._phase = undefined;
				this._activity = d.status === 'succeeded' ? localize('copilot.fusion.continuing', "Continuing the HydraFusion workflow...") : undefined;
				break;
			}
			case 'assistant.fusion_phase_failed': {
				const d = event.data;
				if (!this._record(`phase:${d.fusionId}:${d.phaseId}`)) {
					return undefined;
				}
				this._inFlight = true;
				this._fusionId = d.fusionId;
				phase = this._updatePhase(d, d.status, event.timestamp, d.durationMs);
				this._phase = undefined;
				this._activity = d.degradedToPhaseId ? localize('copilot.fusion.fallback', "Continuing with a fallback phase...") : undefined;
				break;
			}
			case 'session.fusion_route_failed':
				if ((this._attemptId !== undefined && this._attemptId !== event.data.attemptId) || !this._record(`routeFailed:${event.data.attemptId}`)) {
					return undefined;
				}
				this._inFlight = true;
				part = milestone(localize('copilot.fusion.routeFailed', "HydraFusion routing failed; continuing with {0}", event.data.fallbackModel), 'degraded');
				this._activity = undefined;
				break;
			case 'session.fusion_completed': {
				const d = event.data;
				this._finishedFusions.add(d.fusionId);
				this._inFlight = false;
				const degraded = d.outcome === 'degraded' || (d.degradedReason !== null && d.degradedReason !== undefined);
				const summary = degraded
					? localize('copilot.fusion.completedDegraded', "HydraFusion workflow completed with a fallback")
					: d.outcome === 'completed'
						? localize('copilot.fusion.completed', "HydraFusion workflow completed")
						: localize('copilot.fusion.ended', "HydraFusion workflow ended: {0}", d.outcome);
				const details = localize('copilot.fusion.duration', "Duration: {0}", getDurationString(d.durationMs));
				part = milestone(summary, degraded || d.outcome !== 'completed' ? 'degraded' : 'completed', details);
				this._phase = undefined;
				this._activity = undefined;
				break;
			}
		}
		return { part, phase, activity: this._activity };
	}

	private _updatePhase(data: Pick<FusionPhase, 'fusionId' | 'phaseId' | 'phaseKind' | 'model'>, status: IFusionPhaseMeta['status'], timestamp: string | undefined, duration?: number, verdict?: string | null): NonNullable<ICopilotFusionProgressUpdate['phase']> {
		const toolCallId = `fusion:${data.fusionId}:${data.phaseId}`;
		const previous = this._phaseTools.get(toolCallId);
		const previousPhase = previous && readToolCallMeta(previous).fusionPhase;
		const parsedTime = timestamp ? Date.parse(timestamp) : Date.now();
		const startedAt = previousPhase?.startedAt ?? (Number.isFinite(parsedTime) ? parsedTime - (duration ?? 0) : Date.now());
		if (status === 'cancelled' && duration === undefined && previousPhase?.status === 'running') {
			const interruptedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();
			duration = Math.max(0, interruptedAt - startedAt);
		}
		const phase: IFusionPhaseMeta = { fusionId: data.fusionId, phaseId: data.phaseId, model: data.model, status, startedAt, duration };
		const label = phaseLabel(data.phaseKind, this._patterns.get(data.fusionId));
		const base = {
			toolCallId,
			toolName: 'hydrafusion_phase',
			displayName: label,
			invocationMessage: label,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			_meta: toToolCallMeta({ toolKind: 'fusionPhase', subagentDescription: label, fusionPhase: phase, progressMessage: status === 'running' ? this._activity : undefined }),
		};
		let toolCall: ToolCallRunningState | ToolCallCompletedState;
		if (status === 'running') {
			toolCall = { ...base, status: ToolCallStatus.Running };
		} else {
			const summary = status === 'succeeded'
				? localize('copilot.fusion.phaseCompleted', "{0} completed", label)
				: status === 'cancelled'
					? localize('copilot.fusion.phaseCancelled', "{0} cancelled", label)
					: localize('copilot.fusion.phaseFailed', "{0} failed", label);
			const details = new MarkdownString().appendText(summary);
			if (duration !== undefined) {
				details.appendMarkdown('\n\n').appendText(localize('copilot.fusion.duration', "Duration: {0}", getDurationString(duration)));
			}
			if (verdict === 'accept') {
				details.appendMarkdown('\n\n').appendText(localize('copilot.fusion.accepted', "Review accepted the result."));
			} else if (verdict === 'reject') {
				details.appendMarkdown('\n\n').appendText(localize('copilot.fusion.rejected', "Review requested changes."));
			}
			toolCall = {
				...base, status: ToolCallStatus.Completed, success: status === 'succeeded', pastTenseMessage: summary,
				content: [{ type: ToolResultContentType.Text, text: details.value }],
			};
		}
		this._phaseTools.set(toolCallId, toolCall);
		return { toolCall, isNew: previous === undefined };
	}

	private _record(key: string): boolean {
		if (this._milestones.has(key)) {
			return false;
		}
		this._milestones.add(key);
		return true;
	}
}
