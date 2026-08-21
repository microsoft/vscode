/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { AgentSession, IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { COPILOT_CLI_AGENT_PROVIDER, getCopilotCliSessionRawId, migratedCopilotCliResource } from '../../copilotCliEventsUri.js';

/**
 * How long an adoption probe may take before falling back to the legacy resource.
 *
 * Interactive opens happen against a warm host and answer immediately, so a short
 * bound keeps a wedged host from looking like a hang. Restore is the cold case:
 * the host is still working through its initial catalogue, and a measured restore
 * took ~28s on a large one — giving up early there is what makes a restored
 * session silently stay on the legacy provider.
 */
export const LEGACY_MIGRATION_TIMEOUT_MS = 10_000;
export const LEGACY_MIGRATION_RESTORE_TIMEOUT_MS = 60_000;

/** Where a probe was triggered from, so outcomes can be attributed per entry point. */
export type LegacyMigrationProbeSource = 'open' | 'restore';

type LegacyMigrationProbeEvent = {
	source: string;
	outcome: 'adopted' | 'declined' | 'timedOut' | 'settingDisabled' | 'noConnection' | 'failed';
	durationMs: number;
	timeoutMs: number;
};

type LegacyMigrationProbeClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Entry point that probed: open (user opened a session) or restore (startup/editor restore).' };
	outcome: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Probe outcome: adopted (the host migrated the session; the caller may still fall back if it does not surface — see agentHost.legacyCopilotCliMigrationOpen), declined (host refused, e.g. not an adoptable legacy chat), timedOut (no answer within the budget), settingDisabled, noConnection, or failed (probe threw).' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Time in milliseconds spent probing before the outcome was known.' };
	timeoutMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The probe budget that applied, so timeouts can be correlated with the entry point.' };
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
	configurationService: IConfigurationService,
	telemetryService: ITelemetryService,
	source: LegacyMigrationProbeSource,
	timeoutMs: number = LEGACY_MIGRATION_TIMEOUT_MS,
): Promise<URI | undefined> {
	const twin = migratedCopilotCliResource(resource);
	if (!twin) {
		return undefined;
	}
	const startedAt = Date.now();
	// Reported only for resources that are actually legacy sessions, so the event
	// counts migration opportunities rather than every open in the product.
	const report = (outcome: LegacyMigrationProbeEvent['outcome']) => {
		telemetryService.publicLog2<LegacyMigrationProbeEvent, LegacyMigrationProbeClassification>('agentHost.legacyCopilotCliMigrationProbe', {
			source,
			outcome,
			durationMs: Date.now() - startedAt,
			timeoutMs,
		});
	};
	if (!connection) {
		report('noConnection');
		return undefined;
	}
	// The host restores a session whether or not it adopts it, so a successful
	// probe does not by itself mean migration happened. Gate on the setting here:
	// without it we would move sessions onto the agent host for users who never
	// opted in — including external ones, which are never adopted at all.
	if (configurationService.getValue<boolean>(ChatConfiguration.MigrateLegacyCopilotCliSessions) !== true) {
		report('settingDisabled');
		return undefined;
	}
	const rawId = getCopilotCliSessionRawId(twin);
	if (!rawId) {
		return undefined;
	}
	// AHP channels are backend session URIs (`<provider>:/<id>`); the
	// `agent-host-` scheme is a client-side naming that the host does not know.
	const backendSession = AgentSession.uri(COPILOT_CLI_AGENT_PROVIDER, rawId);
	const store = new DisposableStore();
	try {
		const ref = store.add(connection.getSubscription(StateComponents.Session, backendSession, 'AgentHostLegacyMigration'));
		const settled = await raceTimeout(whenSubscriptionSettles(ref.object as IAgentSubscription<SessionState>, store), timeoutMs);
		if (settled === true) {
			report('adopted');
			logService.info(`[AgentHost] adopted legacy session ${resource.toString()} in ${Date.now() - startedAt}ms`);
			return twin;
		}
		report(settled === false ? 'declined' : 'timedOut');
		logService.info(`[AgentHost] legacy session ${resource.toString()} not adopted (${settled === false ? 'declined by host' : `no answer within ${timeoutMs}ms`}); opening it unmigrated`);
		return undefined;
	} catch (err) {
		report('failed');
		logService.warn(`[AgentHost] legacy migration probe failed for ${resource.toString()}`, err);
		return undefined;
	} finally {
		store.dispose();
	}
}

type LegacyMigrationOpenEvent = {
	source: string;
	surfaced: boolean;
};

type LegacyMigrationOpenClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Entry point that opened: open (user opened a session) or restore (startup/editor restore).' };
	surfaced: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the migrated session was found and opened. False means the open fell back to the legacy session the host had just migrated away from.' };
	owner: 'vijayupadya';
	comment: 'Reports whether an adopted legacy session was actually opened as its migrated agent-host session. The probe event only reports that the host adopted it, so without this a silent fallback to the legacy session is invisible.';
};

/**
 * Records whether an adopted session was opened as its migrated twin. Adoption
 * succeeding does not mean the caller could open it, and that fallback is the
 * failure this telemetry exists to catch.
 */
export function reportLegacyMigrationOpen(telemetryService: ITelemetryService, source: LegacyMigrationProbeSource, surfaced: boolean): void {
	telemetryService.publicLog2<LegacyMigrationOpenEvent, LegacyMigrationOpenClassification>('agentHost.legacyCopilotCliMigrationOpen', { source, surfaced });
}

/** Resolves `true` once the subscription has state, `false` if it errors. */
function whenSubscriptionSettles(subscription: IAgentSubscription<SessionState>, store: DisposableStore): Promise<boolean> {
	const current = subscription.value;
	if (current !== undefined) {
		return Promise.resolve(!(current instanceof Error));
	}
	// Without an error signal a refusal never resolves, so waiting would burn the
	// whole timeout on every declined session. Decline instead.
	const onDidError = subscription.onDidError;
	if (!onDidError) {
		return Promise.resolve(false);
	}
	return new Promise<boolean>(resolve => {
		store.add(subscription.onDidChange(() => {
			const settled = subscription.value;
			resolve(settled !== undefined && !(settled instanceof Error));
		}));
		store.add(onDidError(() => resolve(false)));
	});
}
