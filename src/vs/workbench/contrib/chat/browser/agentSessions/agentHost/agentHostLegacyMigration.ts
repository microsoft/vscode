/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { getErrorCode } from '../../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { AgentSession, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { getTelemetryMigrationErrorMessage, getTelemetryMigrationSessionId } from '../../../../../../platform/agentHost/common/agentTelemetryCorrelation.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { COPILOT_CLI_AGENT_PROVIDER, getCopilotCliSessionRawId, migratedCopilotCliResource } from '../../copilotCliEventsUri.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';

/**
 * Whether the extension-host Copilot CLI provider can still open a legacy resource that was
 * not adopted. Before the Copilot extension activates its contribution can look available
 * although the extension will not register the provider, so an available contribution is
 * confirmed by resolving it. That waits only where opening the legacy resource would wait anyway.
 */
export async function canOpenLegacyCopilotCliResource(chatSessionsService: IChatSessionsService, resource: URI): Promise<boolean> {
	if (!chatSessionsService.getChatSessionContribution?.(resource.scheme)) {
		return false;
	}
	return chatSessionsService.canResolveChatSession ? chatSessionsService.canResolveChatSession(resource.scheme) : true;
}

/**
 * How long an adoption probe may take before falling back to the legacy resource.
 *
 * Right after migration is enabled on a large catalogue the host is still busy
 * discovering thousands of sessions, so even an interactive open can hit a cold
 * host; a too-short bound makes it fall back to the read-only legacy session
 * instead of the migrated one. Restore is the fully-cold case (startup), so it
 * gets the larger budget.
 */
export const LEGACY_MIGRATION_TIMEOUT_MS = 30_000;
export const LEGACY_MIGRATION_RESTORE_TIMEOUT_MS = 60_000;

/**
 * Budget for an explicit, user-initiated open. Migration is invisible to the user, so we
 * prefer to wait for the adopted session to surface (shown under a subtle progress hint)
 * rather than fall back to the pre-migration view they did not ask for. A declined or
 * external session still resolves quickly via the error signal, so only a genuinely
 * still-warming host uses the full budget.
 */
export const LEGACY_MIGRATION_OPEN_TIMEOUT_MS = 60_000;

/** Where a probe was triggered from, so outcomes can be attributed per entry point. */
export type LegacyMigrationProbeSource = 'open' | 'restore';

type LegacyMigrationProbeEvent = {
	source: string;
	outcome: 'adopted' | 'declined' | 'timedOut' | 'noConnection' | 'failed';
	reason: 'adopted' | 'initialStateError' | 'stateChangeError' | 'subscriptionError' | 'missingErrorEvent' | 'emptyState' | 'timedOut' | 'noConnection' | 'invalidSessionId' | 'exception';
	migrationSessionId: string | undefined;
	errorCode: string | undefined;
	errorMessage: string | undefined;
	durationMs: number;
	timeoutMs: number;
};

type LegacyMigrationProbeClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Entry point that probed: open (user opened a session) or restore (startup/editor restore).' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Probe outcome: adopted (the host migrated the session; the caller may still fall back if it does not surface — see agentHost.legacyCopilotCliMigrationOpen), declined (host refused, e.g. not an adoptable legacy chat), timedOut (no answer within the budget), noConnection, or failed (probe threw).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds spent probing before the outcome was known.' };
	timeoutMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The probe budget that applied, so timeouts can be correlated with the entry point.' };
	reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded probe decision or subscription failure path. Does not infer provider eligibility from an error.' };
	migrationSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SHA-1 of the backend session URI, shared with host and open diagnostics. Identifies a session, not an individual retry.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Exception or protocol error code, when supplied by the failed subscription or probe.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message from the failed subscription or probe, cleaned by the telemetry service.' };
	owner: 'vijayupadya';
	comment: 'Counts adopt-on-open probe attempts for legacy extension-host Copilot CLI sessions. The host-side agentHost.legacyCopilotCliMigration event only fires once migration starts, so without this there is no denominator for a success rate and a silently-unmigrated open is indistinguishable from a user having no legacy sessions.';
};

/**
 * Redirects a legacy extension-host Copilot CLI resource to its agent-host twin,
 * adopting it on the way, or `undefined` to leave the caller's resource alone.
 *
 * Subscribing to the twin is what performs adoption: the host restores the
 * session, which runs its own provenance and working-directory checks. A session
 * that is not ours to adopt fails that subscribe and falls back to the legacy
 * resource, so an external session is never worse off than it is today.
 *
 * A failure is deliberately not remembered. The host maps every restore failure
 * to `SessionNotFound`, so a refusal is indistinguishable from a transient one
 * (host restarting, still starting up) — caching it would silently pin a session
 * to the legacy path for the rest of the window's life. Probes only happen on an
 * explicit open, so retrying costs little.
 */
export async function adoptLegacyCopilotCliResource(
	connection: IAgentConnection | undefined,
	resource: URI,
	logService: ILogService,
	telemetryService: ITelemetryService,
	source: LegacyMigrationProbeSource,
	timeoutMs: number = LEGACY_MIGRATION_TIMEOUT_MS,
): Promise<URI | undefined> {
	const twin = migratedCopilotCliResource(resource);
	// An unsaved draft has no history to migrate, and probing it can wait on a cold host.
	if (!twin || isUntitledChatSession(resource)) {
		return undefined;
	}
	const startedAt = Date.now();
	const rawId = getCopilotCliSessionRawId(twin);
	const backendSession = rawId ? AgentSession.uri(COPILOT_CLI_AGENT_PROVIDER, rawId) : undefined;
	const migrationSessionId = backendSession ? getTelemetryMigrationSessionId(backendSession) : undefined;
	// Reported only for resources that are actually legacy sessions, so the event
	// counts migration opportunities rather than every open in the product.
	const report = (outcome: LegacyMigrationProbeEvent['outcome'], reason: LegacyMigrationProbeEvent['reason'], error?: unknown) => {
		const data: LegacyMigrationProbeEvent = {
			source,
			outcome,
			reason,
			migrationSessionId,
			errorCode: getErrorCode(error),
			errorMessage: getTelemetryMigrationErrorMessage(error, resource),
			durationMs: Date.now() - startedAt,
			timeoutMs,
		};
		if (error !== undefined) {
			telemetryService.publicLogError2<LegacyMigrationProbeEvent, LegacyMigrationProbeClassification>('agentHost.legacyCopilotCliMigrationProbe', data);
		} else {
			telemetryService.publicLog2<LegacyMigrationProbeEvent, LegacyMigrationProbeClassification>('agentHost.legacyCopilotCliMigrationProbe', data);
		}
	};
	if (!connection) {
		report('noConnection', 'noConnection');
		return undefined;
	}
	if (!backendSession) {
		report('failed', 'invalidSessionId');
		logService.warn('[AgentHost] legacy migration probe has no session identifier');
		return undefined;
	}
	// AHP channels are backend session URIs (`<provider>:/<id>`); the
	// `agent-host-` scheme is a client-side naming that the host does not know.
	const store = new DisposableStore();
	try {
		const ref = store.add(connection.getSubscription(StateComponents.Session, backendSession, 'AgentHostLegacyMigration'));
		const settled = await raceTimeout(whenSubscriptionSettles(ref.object as IAgentSubscription<SessionState>, store), timeoutMs);
		if (settled?.reason === 'adopted') {
			report('adopted', 'adopted');
			logService.info(`[AgentHost] adopted legacy session ${resource.toString()} in ${Date.now() - startedAt}ms`);
			return twin;
		}
		report(settled ? 'declined' : 'timedOut', settled?.reason ?? 'timedOut', settled?.error);
		logService.info(`[AgentHost] legacy session ${resource.toString()} not adopted (${settled?.reason ?? `no answer within ${timeoutMs}ms`}); opening it unmigrated`, settled?.error);
		return undefined;
	} catch (err) {
		report('failed', 'exception', err);
		logService.warn(`[AgentHost] legacy migration probe failed for ${resource.toString()}`, err);
		return undefined;
	} finally {
		store.dispose();
	}
}

/**
 * Which list row a migration open started from. An agent-host row carries the
 * exact backend session URI, so its report correlates with the host's event
 * however the host addresses the session.
 */
export type LegacyMigrationOpenRow =
	| { readonly entry: 'legacyRow' }
	| { readonly entry: 'agentHostRow'; readonly backendSession: URI };

type LegacyMigrationOpenEvent = {
	source: string;
	entry: LegacyMigrationOpenRow['entry'];
	surfaced: boolean;
	migrationSessionId: string | undefined;
	reason: 'surfaced' | 'sessionNotSurfaced' | 'resolveFailed';
	errorCode: string | undefined;
	errorMessage: string | undefined;
};

type LegacyMigrationOpenClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Entry point that opened: open (user opened a session) or restore (startup/editor restore).' };
	entry: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The row opened: legacyRow (the extension-host session, adopted through the client probe) or agentHostRow (the un-adopted session listed by the agent host, which the host adopts when the open subscribes to it, with no probe event).' };
	surfaced: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migrated session was found and opened. False means the open fell back to the legacy session the host had just migrated away from, or, for agentHostRow, that the host did not adopt the session within the open budget.' };
	migrationSessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'SHA-1 of the backend session URI, shared with probe and host diagnostics; not an attempt identifier.' };
	reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Whether resolution succeeded, returned no session, or encountered a provider/resolution error.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Exception or protocol error code when resolving the migrated session failed.' };
	errorMessage: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'Error message when resolving the migrated session failed, cleaned by the telemetry service.' };
	owner: 'vijayupadya';
	comment: 'Reports whether an adopted legacy session was actually opened as its migrated agent-host session. The probe event only reports that the host adopted it, so without this a silent fallback to the legacy session is invisible.';
};

/**
 * Records whether an adopted session was opened as its migrated twin. Adoption
 * succeeding does not mean the caller could open it, and that fallback is the
 * failure this telemetry exists to catch.
 */
export function reportLegacyMigrationOpen(telemetryService: ITelemetryService, source: LegacyMigrationProbeSource, resource: URI, surfaced: boolean, error?: unknown, row: LegacyMigrationOpenRow = { entry: 'legacyRow' }): void {
	const rawId = getCopilotCliSessionRawId(resource);
	const data: LegacyMigrationOpenEvent = {
		source,
		entry: row.entry,
		surfaced,
		migrationSessionId: row.entry === 'agentHostRow'
			? getTelemetryMigrationSessionId(row.backendSession)
			: rawId ? getTelemetryMigrationSessionId(AgentSession.uri(COPILOT_CLI_AGENT_PROVIDER, rawId)) : undefined,
		reason: error !== undefined ? 'resolveFailed' : surfaced ? 'surfaced' : 'sessionNotSurfaced',
		errorCode: getErrorCode(error),
		errorMessage: getTelemetryMigrationErrorMessage(error, resource),
	};
	if (error !== undefined) {
		telemetryService.publicLogError2<LegacyMigrationOpenEvent, LegacyMigrationOpenClassification>('agentHost.legacyCopilotCliMigrationOpen', data);
	} else {
		telemetryService.publicLog2<LegacyMigrationOpenEvent, LegacyMigrationOpenClassification>('agentHost.legacyCopilotCliMigrationOpen', data);
	}
}

type MigrationSubscriptionResult = {
	reason: 'adopted' | 'initialStateError' | 'stateChangeError' | 'subscriptionError' | 'missingErrorEvent' | 'emptyState';
	error?: Error;
};

/** Preserves the failure path and original error without changing subscription settlement. */
function whenSubscriptionSettles(subscription: IAgentSubscription<SessionState>, store: DisposableStore): Promise<MigrationSubscriptionResult> {
	const current = subscription.value;
	if (current !== undefined) {
		return Promise.resolve(current instanceof Error ? { reason: 'initialStateError', error: current } : { reason: 'adopted' });
	}
	// Without an error signal a refusal never resolves, so waiting would burn the
	// whole timeout on every declined session. Decline instead.
	const onDidError = subscription.onDidError;
	if (!onDidError) {
		return Promise.resolve({ reason: 'missingErrorEvent' });
	}
	return new Promise<MigrationSubscriptionResult>(resolve => {
		store.add(subscription.onDidChange(() => {
			const settled = subscription.value;
			resolve(settled instanceof Error ? { reason: 'stateChangeError', error: settled } : { reason: settled === undefined ? 'emptyState' : 'adopted' });
		}));
		store.add(onDidError(error => resolve({ reason: 'subscriptionError', error })));
	});
}
