/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { SessionState } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { migratedCopilotCliResource } from '../../copilotCliEventsUri.js';

/** How long an adoption probe may take before falling back to the legacy resource. */
export const LEGACY_MIGRATION_TIMEOUT_MS = 10_000;

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
): Promise<URI | undefined> {
	const twin = migratedCopilotCliResource(resource);
	if (!twin || !connection) {
		return undefined;
	}
	const store = new DisposableStore();
	try {
		const ref = store.add(connection.getSubscription(StateComponents.Session, twin, 'AgentHostLegacyMigration'));
		const settled = await raceTimeout(whenSubscriptionSettles(ref.object as IAgentSubscription<SessionState>, store), LEGACY_MIGRATION_TIMEOUT_MS);
		return settled === true ? twin : undefined;
	} catch (err) {
		logService.warn(`[AgentHost] legacy migration probe failed for ${resource.toString()}`, err);
		return undefined;
	} finally {
		store.dispose();
	}
}

/** Resolves `true` once the subscription has state, `false` if it errors. */
function whenSubscriptionSettles(subscription: IAgentSubscription<SessionState>, store: DisposableStore): Promise<boolean> {
	const current = subscription.value;
	if (current !== undefined) {
		return Promise.resolve(!(current instanceof Error));
	}
	return new Promise<boolean>(resolve => {
		store.add(subscription.onDidChange(() => resolve(true)));
		if (subscription.onDidError) {
			store.add(subscription.onDidError(() => resolve(false)));
		}
	});
}
