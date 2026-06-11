/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IAgentSessionsService } from '../../chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary } from '../../chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentTitleBarStatusService } from '../../chat/browser/agentSessions/experiments/agentTitleBarStatusService.js';
import { IVoicePlaybackService } from '../../chat/common/voicePlaybackService.js';
import { IVoiceSessionController } from '../../chat/browser/voiceClient/voiceSessionController.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IChatService } from '../../chat/common/chatService/chatService.js';
import { AgentsVoiceWidget } from './agentsVoiceWidget.js';
import { getRepositoryName } from '../../chat/browser/agentSessions/agentSessionsViewer.js';
import type { SessionGroupData, SessionRowData } from './components/sessionListComponent.js';

export interface IWidgetBindingServices {
	readonly voiceSessionController: IVoiceSessionController;
	readonly agentSessionsService: IAgentSessionsService;
	readonly agentTitleBarStatusService: IAgentTitleBarStatusService;
	readonly voicePlaybackService: IVoicePlaybackService;
	readonly environmentService: IWorkbenchEnvironmentService;
	readonly chatService?: IChatService;
}

/**
 * Wire all controller observables and session/playback service events into the
 * widget. Used by both the floating agentsVoice window and the in-pane voice
 * bar so they stay in lock-step.
 */
export function bindWidgetToController(widget: AgentsVoiceWidget, services: IWidgetBindingServices): IDisposable {
	const store = new DisposableStore();
	const {
		voiceSessionController: controller,
		agentSessionsService,
		agentTitleBarStatusService,
		voicePlaybackService,
		environmentService,
	} = services;

	// --- Reactive controller state → widget setters ---
	store.add(autorun(reader => {
		const state = controller.voiceState.read(reader);
		const connected = controller.isConnected.read(reader);
		const connecting = controller.isConnecting.read(reader);
		const reconnecting = controller.isReconnecting.read(reader);
		const toolConfirmations = controller.pendingToolConfirmations.read(reader);
		const speakingSession = voicePlaybackService.speakingSession.read(reader);
		const statusText = controller.statusText.read(reader);
		const turns = controller.transcriptTurns.read(reader);
		const targetSession = controller.targetSession.read(reader);

		widget.setConnected(connected);
		widget.setConnecting(connecting);
		widget.setReconnecting(reconnecting);
		widget.setVoiceState(state);
		widget.setPendingToolConfirmations(toolConfirmations);
		widget.setTranscriptTurns(turns);
		widget.setStatusText(statusText);
		widget.setSelectedTargetSession(targetSession);

		// Resolve speaking session label from the model
		if (speakingSession) {
			const sessions = agentSessionsService.model.sessions;
			const match = sessions.find(s => s.resource.toString() === speakingSession.toString());
			widget.setSpeakingSession(speakingSession, match?.label);
		} else {
			widget.setSpeakingSession(undefined, undefined);
		}

		_updateSessionData(widget, services);
	}));

	// --- Session-model events ---
	const updateAll = () => {
		_updateStatusCounts(widget, services);
		_updateSessionData(widget, services);
	};
	store.add(agentSessionsService.model.onDidChangeSessions(updateAll));
	store.add(agentSessionsService.onDidChangeSessionArchivedState(updateAll));
	store.add(agentTitleBarStatusService.onDidChangeSessionInfo(updateAll));
	store.add(autorun(reader => {
		voicePlaybackService.speakingSession.read(reader);
		// Track chatModels changes to pick up new/removed chat sessions,
		// AND subscribe to each model's state so we re-fire on confirmations,
		// completions, and question carousels.
		if (services.chatService) {
			for (const model of services.chatService.chatModels.read(reader)) {
				model.hasActiveRequest.read(reader);
				model.requestNeedsInput.read(reader);
				const lastReq = model.lastRequestObs.read(reader);
				if (lastReq?.response) {
					lastReq.response.isIncomplete.read(reader);
					lastReq.response.isPendingConfirmation.read(reader);
				}
			}
		}
		_updateSessionData(widget, services);
	}));

	_updateStatusCounts(widget, services);
	_updateSessionData(widget, services);

	// Suppress unused-var warning for environmentService when bundlers tree-shake
	void environmentService;
	return store;
}

function _updateStatusCounts(widget: AgentsVoiceWidget, { agentSessionsService }: IWidgetBindingServices): void {
	const sessions = agentSessionsService.model.sessions.filter(s => !s.isArchived());
	const oneHourAgo = Date.now() - 60 * 60 * 1000;

	let working = 0;
	let needsInput = 0;
	let done = 0;

	for (const session of sessions) {
		switch (session.status) {
			case AgentSessionStatus.InProgress: working++; break;
			case AgentSessionStatus.NeedsInput: needsInput++; break;
			case AgentSessionStatus.Completed: {
				const endedAt = session.timing.lastRequestEnded ?? session.timing.created;
				if (endedAt && endedAt > oneHourAgo) {
					done++;
				}
				break;
			}
		}
	}

	widget.setStatusCounts(working, needsInput, done);
}

function _updateSessionData(widget: AgentsVoiceWidget, services: IWidgetBindingServices): void {
	const { agentSessionsService, voiceSessionController, voicePlaybackService, environmentService, chatService } = services;

	// Show all non-archived sessions so the user can target any for transcription.
	const sessions = agentSessionsService.model.sessions.filter(s => !s.isArchived());
	const toolConfirmations = voiceSessionController.pendingToolConfirmations.get();
	const speakingSession = voicePlaybackService.speakingSession.get();

	// Sort: NeedsInput first, then InProgress, then Completed; most recent first within
	const statusOrder = (s: typeof sessions[0]) =>
		s.status === AgentSessionStatus.NeedsInput ? 0
			: s.status === AgentSessionStatus.InProgress ? 1
				: 2;
	const lastActivity = (s: typeof sessions[0]) =>
		s.timing.lastRequestEnded ?? s.timing.lastRequestStarted ?? s.timing.created ?? 0;
	const sorted = [...sessions].sort((a, b) => {
		const statusDiff = statusOrder(a) - statusOrder(b);
		if (statusDiff !== 0) { return statusDiff; }
		return lastActivity(b) - lastActivity(a);
	});

	const sessionRows: SessionRowData[] = sorted.map(session => {
		const isSpeaking = speakingSession?.toString() === session.resource.toString();
		const changes = getAgentChangesSummary(session.changes);
		const tc = toolConfirmations.find(c => c.sessionResource.toString() === session.resource.toString());

		return {
			resource: session.resource,
			label: session.label || localize('agentsVoice.untitledSession', "Untitled session"),
			isActive: session.status === AgentSessionStatus.InProgress,
			needsInput: session.status === AgentSessionStatus.NeedsInput,
			isIdle: session.status === AgentSessionStatus.Completed,
			isSpeaking,
			insertions: changes?.insertions ?? 0,
			deletions: changes?.deletions ?? 0,
			toolConfirmation: tc,
		};
	});

	// Also include regular chat sessions (from IChatService) so the voice panel
	// can target them for transcription even when there are no agent sessions.
	// Show their actual state (active/needsInput/idle) so the voice UI reflects
	// confirmations, question carousels, and response completion in real time.
	if (chatService) {
		const agentResources = new Set(sessionRows.map(r => r.resource.toString()));
		const chatModels = chatService.chatModels.get();
		for (const model of chatModels) {
			if (agentResources.has(model.sessionResource.toString())) { continue; }
			const requests = model.getRequests();
			if (requests.length === 0) { continue; }

			const isActive = model.hasActiveRequest.get();
			const needsInput = !!model.requestNeedsInput.get();
			const tc = toolConfirmations.find(c => c.sessionResource.toString() === model.sessionResource.toString());

			sessionRows.push({
				resource: model.sessionResource,
				label: model.title || localize('agentsVoice.chat', "Chat"),
				isActive: isActive && !needsInput,
				needsInput,
				isIdle: !isActive && !needsInput,
				isSpeaking: speakingSession?.toString() === model.sessionResource.toString(),
				insertions: 0,
				deletions: 0,
				toolConfirmation: tc,
			});
		}
	}

	widget.setSessions(sessionRows);

	// In sessions window, group by repository
	if (environmentService.isSessionsWindow) {
		const repoMap = new Map<string, SessionRowData[]>();
		const otherRows: SessionRowData[] = [];

		for (let i = 0; i < sorted.length; i++) {
			const repoName = getRepositoryName(sorted[i]);
			const row = sessionRows[i];
			if (repoName) {
				let group = repoMap.get(repoName);
				if (!group) {
					group = [];
					repoMap.set(repoName, group);
				}
				group.push(row);
			} else {
				otherRows.push(row);
			}
		}

		const groups: SessionGroupData[] = [];
		for (const [label, rows] of repoMap) {
			groups.push({ label, sessions: rows });
		}
		if (otherRows.length > 0) {
			groups.push({ label: localize('agentsVoice.otherSessions', "Other"), sessions: otherRows });
		}

		widget.setSessionGroups(groups.length > 0 ? groups : undefined);
	} else {
		widget.setSessionGroups(undefined);
	}
}
