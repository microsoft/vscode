/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSession, isLocalAgentSessionItem } from './agentSessionsModel.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { IChatEditorOptions } from '../widgetHosts/editor/chatEditor.js';
import { ChatViewPaneTarget, IChatWidget, IChatWidgetService } from '../chat.js';
import { ACTIVE_GROUP, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { localize } from '../../../../../nls.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IProgressService, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { migratedCopilotCliResource } from '../copilotCliEventsUri.js';
import { adoptLegacyCopilotCliResource, LEGACY_MIGRATION_OPEN_TIMEOUT_MS, reportLegacyMigrationOpen } from './agentHost/agentHostLegacyMigration.js';

//#region Session Opener Registry

export interface ISessionOpenerParticipant {
	handleOpenSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<boolean>;
	handleOpenSessionResource?(accessor: ServicesAccessor, resource: URI, openOptions?: ISessionOpenOptions): Promise<boolean>;
}

export interface ISessionOpenOptions {
	readonly sideBySide?: boolean;
	readonly editorOptions?: IEditorOptions;
}

class SessionOpenerRegistry {

	private readonly participants = new Set<ISessionOpenerParticipant>();

	registerParticipant(participant: ISessionOpenerParticipant): IDisposable {
		this.participants.add(participant);

		return {
			dispose: () => {
				this.participants.delete(participant);
			}
		};
	}

	getParticipants(): readonly ISessionOpenerParticipant[] {
		return Array.from(this.participants);
	}
}

export const sessionOpenerRegistry = new SessionOpenerRegistry();

//#endregion

/**
 * The agent-host session a legacy chat was just migrated into is not in the list
 * until its provider is refreshed, so a lookup straight after adoption misses and
 * the caller would fall back to opening the legacy session it just migrated away
 * from. Refresh that one provider and look again.
 */
async function resolveMigratedSession(agentSessionsService: IAgentSessionsService, migrated: URI): Promise<IAgentSession | undefined> {
	const existing = agentSessionsService.getSession(migrated);
	if (existing) {
		return existing;
	}
	await agentSessionsService.model.resolve(getChatSessionType(migrated));
	return agentSessionsService.getSession(migrated);
}

/**
 * For an explicit open, redirect a superseded legacy resource to its adopted twin and
 * return the migrated session to open in its place (or `undefined` to open the original).
 *
 * Migration is invisible to the user — they always just open "their chat". So the whole
 * adopt-and-surface step runs under a subtle status-bar progress hint and a generous
 * budget, which keeps the *same* session opening in place instead of ever swapping in the
 * pre-migration view. A declined/external session resolves quickly, so only a still-warming
 * host actually waits.
 */
async function resolveMigratedSessionForOpen(accessor: ServicesAccessor, resource: URI): Promise<IAgentSession | undefined> {
	// Only a superseded legacy resource can redirect; skip the progress wrapper for every
	// normal open so they stay overhead-free.
	if (!migratedCopilotCliResource(resource)) {
		return undefined;
	}

	const logService = accessor.get(ILogService);
	const agentSessionsService = accessor.get(IAgentSessionsService);
	const telemetryService = accessor.get(ITelemetryService);
	const configurationService = accessor.get(IConfigurationService);
	const connection = accessor.get(IAgentHostConnectionsService).ambientConnection;

	return accessor.get(IProgressService).withProgress(
		{ location: ProgressLocation.Window, title: localize('chat.openingSession', "Opening chat…") },
		async () => {
			const migrated = await adoptLegacyCopilotCliResource(connection, resource, logService, configurationService, telemetryService, 'open', LEGACY_MIGRATION_OPEN_TIMEOUT_MS);
			if (!migrated) {
				return undefined;
			}
			const surfaced = await resolveMigratedSession(agentSessionsService, migrated);
			reportLegacyMigrationOpen(telemetryService, 'open', !!surfaced);
			if (!surfaced) {
				logService.warn(`[AgentHost] migrated ${resource.toString()} to ${migrated.toString()} but it is not in this window's list after refreshing provider '${getChatSessionType(migrated)}'; opening the legacy session instead.`);
			}
			return surfaced;
		},
	);
}

export async function openSessionByResource(accessor: ServicesAccessor, resource: URI, openOptions?: ISessionOpenOptions): Promise<IChatWidget | undefined> {
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);

	// A superseded legacy resource is redirected (and adopted) before anything
	// looks it up, so opening by URI migrates instead of reaching the old provider.
	const migratedSession = await resolveMigratedSessionForOpen(accessor, resource);
	if (migratedSession) {
		resource = migratedSession.resource;
	}

	for (const participant of sessionOpenerRegistry.getParticipants()) {
		if (!participant.handleOpenSessionResource) {
			continue;
		}

		try {
			const handled = await instantiationService.invokeFunction(accessor => participant.handleOpenSessionResource?.(accessor, resource, openOptions));
			if (handled) {
				return undefined;
			}
		} catch (error) {
			logService.error(error);
		}
	}

	const session = instantiationService.invokeFunction(accessor => accessor.get(IAgentSessionsService).getSession(resource));
	if (!session) {
		throw new Error(`Chat session not found: ${resource.toString()}`);
	}

	return instantiationService.invokeFunction(openSession, session, openOptions, /* alreadyResolved */ true);
}

export async function openSession(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions, alreadyResolved?: boolean): Promise<IChatWidget | undefined> {
	const instantiationService = accessor.get(IInstantiationService);
	const logService = accessor.get(ILogService);

	logService.trace(`[AgentSessions] openSession start: ${session.resource.toString()}`);

	// List and picker clicks arrive here with a resolved session, so the redirect
	// has to happen on this path too or those opens never migrate. A no-op for
	// anything that is not a superseded legacy resource.
	if (!alreadyResolved) {
		const migratedSession = await resolveMigratedSessionForOpen(accessor, session.resource);
		if (migratedSession) {
			session = migratedSession;
		}
	}

	// First, give registered participants a chance to handle the session
	for (const participant of sessionOpenerRegistry.getParticipants()) {
		try {
			const handled = await instantiationService.invokeFunction(accessor => participant.handleOpenSession(accessor, session, openOptions));
			if (handled) {
				logService.trace(`[AgentSessions] openSession handled by participant: ${session.resource.toString()}`);
				return undefined; // Participant handled the session, skip default opening
			}
		} catch (error) {
			logService.error(error); // log error but continue to support opening from default logic
		}
	}

	// Default session opening logic
	return instantiationService.invokeFunction(accessor => openSessionDefault(accessor, session, openOptions));
}

async function openSessionDefault(accessor: ServicesAccessor, session: IAgentSession, openOptions?: ISessionOpenOptions): Promise<IChatWidget | undefined> {
	const chatSessionsService = accessor.get(IChatSessionsService);
	const chatWidgetService = accessor.get(IChatWidgetService);
	const notificationService = accessor.get(INotificationService);
	const logService = accessor.get(ILogService);

	try {
		session.setRead(true); // mark as read when opened

		let sessionOptions: IChatEditorOptions;
		if (isLocalAgentSessionItem(session)) {
			sessionOptions = {};
		} else {
			sessionOptions = { title: { preferred: session.label } };
		}

		let options: IChatEditorOptions = {
			...sessionOptions,
			...openOptions?.editorOptions,
			revealIfOpened: true, // always try to reveal if already opened
		};

		await chatSessionsService.activateChatSessionItemProvider(session.providerType); // ensure provider is activated before trying to open
		logService.trace(`[AgentSessions] openSession: provider '${session.providerType}' activated for ${session.resource.toString()}`);

		let target: typeof SIDE_GROUP | typeof ACTIVE_GROUP | typeof ChatViewPaneTarget | undefined;
		if (openOptions?.sideBySide) {
			target = ACTIVE_GROUP;
		} else {
			target = ChatViewPaneTarget;
		}

		const isLocalChatSession = session.resource.scheme === Schemas.vscodeChatEditor || getChatSessionType(session.resource) === localChatSessionType;
		if (!isLocalChatSession && !(await chatSessionsService.canResolveChatSession(getChatSessionType(session.resource)))) {
			target = openOptions?.sideBySide ? SIDE_GROUP : ACTIVE_GROUP; // force to open in editor if session cannot be resolved in panel
			options = { ...options, revealIfOpened: true };
		}

		return await chatWidgetService.openSession(session.resource, target, options);
	} catch (error) {
		logService.error(`[AgentSessions] openSession failed: ${session.resource.toString()}`, error);
		notificationService.error(localize('chat.openSessionFailed', "Failed to open chat session: {0}", toErrorMessage(error)));
		return undefined;
	}
}
