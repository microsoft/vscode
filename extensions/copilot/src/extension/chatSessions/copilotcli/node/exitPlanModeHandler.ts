/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Session, SessionOptions } from '@github/copilot/sdk';
import * as l10n from '@vscode/l10n';
import type { CancellationToken, ChatParticipantToolToken, TextDocument } from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { Delayer } from '../../../../util/vs/base/common/async';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { isEqual } from '../../../../util/vs/base/common/resources';
import { LanguageModelTextPart, Uri } from '../../../../vscodeTypes';
import { IToolsService } from '../../../tools/common/toolsService';

type ExitPlanModeActionType = Parameters<NonNullable<SessionOptions['onExitPlanMode']>>[0]['actions'][number];

const actionDescriptions: Record<ExitPlanModeActionType, { label: string; description: string }> = {
	'autopilot': { label: l10n.t("Implement with Autopilot"), description: l10n.t('Auto-approve all tool calls and continue until the task is done.') },
	'autopilot_fleet': { label: l10n.t("Implement with Autopilot Fleet"), description: l10n.t('Auto-approve all tool calls, including fleet management actions, and continue until the task is done.') },
	'interactive': { label: l10n.t("Implement Plan"), description: l10n.t('Implement the plan, asking for input and approval for each action.') },
	'exit_only': { label: l10n.t("Approve Plan Only"), description: l10n.t('Approve the plan without executing it. I will implement it myself.') },
};

/**
 * Monitors a plan.md file for user edits and syncs saved changes back to the
 * SDK session. Uses a {@link Delayer} to debounce rapid `onDidChangeTextDocument`
 * events. Only writes to the SDK when the document is no longer dirty (i.e. the
 * user has saved the file).
 */
class PlanFileMonitor extends DisposableStore {
	private readonly _delayer: Delayer<void>;
	private _pendingWrite: Promise<void> = Promise.resolve();
	private _lastChangedDocument: TextDocument | undefined;

	constructor(
		planUri: Uri,
		private readonly _session: Session,
		workspaceService: IWorkspaceService,
		private readonly _logService: ILogService,
	) {
		super();
		this._delayer = this.add(new Delayer<void>(100));

		this.add(workspaceService.onDidChangeTextDocument(e => {
			if (e.contentChanges.length === 0 || !isEqual(e.document.uri, planUri)) {
				return;
			}
			this._lastChangedDocument = e.document;
			this._delayer.trigger(() => this._syncIfSaved());
		}));
	}

	private _syncIfSaved(): void {
		const doc = this._lastChangedDocument;
		if (!doc || doc.isDirty) {
			return;
		}
		const content = doc.getText();
		this._logService.trace('[ExitPlanModeHandler] Plan file saved by user, syncing to SDK session');
		this._pendingWrite = this._session.writePlan(content).catch(err => {
			this._logService.error(err, '[ExitPlanModeHandler] Failed to write plan changes to SDK session');
		});
	}

	/**
	 * Flushes any pending debounced sync and waits for the in-flight
	 * `writePlan` call to complete. Call this before disposing to ensure
	 * the last saved plan content has been written to the SDK.
	 */
	async flush(): Promise<void> {
		if (this._delayer.isTriggered()) {
			this._delayer.cancel();
			this._syncIfSaved();
		}
		await this._pendingWrite;
	}
}

export interface ExitPlanModeEventData {
	readonly requestId: string;
	readonly summary: string;
	readonly actions: string[];
	readonly recommendedAction: string;
}

export interface ExitPlanModeResponse {
	readonly approved: boolean;
	readonly selectedAction?: ExitPlanModeActionType;
	readonly autoApproveEdits?: boolean;
	readonly feedback?: string;
}

/**
 * Handles the `exit_plan_mode.requested` SDK event.
 *
 * In **autopilot** mode the handler auto-selects the best action without user
 * interaction. In **interactive** mode the handler shows a question to the user
 * and monitors plan.md for edits while waiting for the answer.
 */
export function handleExitPlanMode(
	event: ExitPlanModeEventData,
	session: Session,
	permissionLevel: string | undefined,
	toolInvocationToken: ChatParticipantToolToken | undefined,
	workspaceService: IWorkspaceService,
	logService: ILogService,
	toolService: IToolsService,
	token: CancellationToken,
): Promise<ExitPlanModeResponse> {
	if (permissionLevel === 'autopilot') {
		return Promise.resolve(resolveAutopilot(event, logService));
	}

	if (!(toolInvocationToken as unknown)) {
		logService.warn('[ExitPlanModeHandler] No toolInvocationToken available, cannot request exit plan mode approval');
		return Promise.resolve({ approved: false });
	}

	return resolveInteractive(event, session, permissionLevel, toolInvocationToken!, workspaceService, logService, toolService, token);
}

function resolveAutopilot(event: ExitPlanModeEventData, logService: ILogService): ExitPlanModeResponse {
	logService.trace('[ExitPlanModeHandler] Auto-approving exit plan mode in autopilot');
	const choices = (event.actions as ExitPlanModeActionType[]) ?? [];

	if (event.recommendedAction && choices.includes(event.recommendedAction as ExitPlanModeActionType)) {
		return { approved: true, selectedAction: event.recommendedAction as ExitPlanModeActionType, autoApproveEdits: true };
	}
	for (const action of ['autopilot', 'autopilot_fleet', 'interactive', 'exit_only'] as const) {
		if (choices.includes(action)) {
			const autoApproveEdits = action === 'autopilot' || action === 'autopilot_fleet' ? true : undefined;
			return { approved: true, selectedAction: action, autoApproveEdits };
		}
	}
	return { approved: true, autoApproveEdits: true };
}

async function resolveInteractive(
	event: ExitPlanModeEventData,
	session: Session,
	permissionLevel: string | undefined,
	toolInvocationToken: ChatParticipantToolToken,
	workspaceService: IWorkspaceService,
	logService: ILogService,
	toolService: IToolsService,
	token: CancellationToken,
): Promise<ExitPlanModeResponse> {
	const planPath = session.getPlanPath();

	// Monitor plan.md for user edits while the exit-plan-mode question is displayed.
	const planFileMonitor = planPath ? new PlanFileMonitor(Uri.file(planPath), session, workspaceService, logService) : undefined;

	try {
		const actions: { label: string; description: string; default: boolean; permissionLevel?: 'autopilot' }[] = event.actions.map(a => ({
			label: actionDescriptions[a as ExitPlanModeActionType]?.label ?? a,
			default: a === event.recommendedAction,
			description: actionDescriptions[a as ExitPlanModeActionType]?.description ?? '',
			...(a === 'autopilot' || a === 'autopilot_fleet' ? { permissionLevel: 'autopilot' as const } : {}),
		}));

		const result = await toolService.invokeTool('vscode_reviewPlan', {
			input: {
				title: l10n.t('Review Plan'),
				plan: planPath ? Uri.file(planPath).toString() : undefined,
				content: event.summary,
				actions,
				canProvideFeedback: true
			},
			toolInvocationToken,
		}, token);

		const firstPart = result?.content.at(0);
		if (!(firstPart instanceof LanguageModelTextPart) || !firstPart.value) {
			return { approved: false };
		}

		const answer = JSON.parse(firstPart.value) as {
			action?: string;
			rejected: boolean;
			feedback?: string;
		};


		// Ensure any pending plan writes complete before responding to the SDK.
		await planFileMonitor?.flush();

		if (answer.rejected) {
			return { approved: false };
		}
		if (answer.feedback) {
			return { approved: false, feedback: answer.feedback, selectedAction: answer.action as ExitPlanModeActionType };
		}

		let selectedAction: ExitPlanModeActionType | undefined = undefined;
		for (const [action, desc] of Object.entries(actionDescriptions)) {
			if (desc.label === answer.action) {
				selectedAction = action as ExitPlanModeActionType;
				break;
			}
		}
		const autoApproveEdits = permissionLevel === 'autoApprove' ? true : undefined;
		return { approved: true, selectedAction, autoApproveEdits };
	} finally {
		planFileMonitor?.dispose();
	}
}
