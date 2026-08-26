/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The external capability adapter for live-compatibility scenarios.
 *
 * A live-compat scenario runs the *same* script against Agent Host builds that
 * are months apart, so the script inevitably meets contract evolution: an older
 * build negotiates an older protocol version, and a feature the current build
 * has may not exist there at all.
 *
 * The rule this file exists to enforce is that such differences are resolved
 * **once, externally, from what the build advertises over AHP** — never with
 * `if (buildId === 'legacy')` branches sprinkled through scenario bodies. A
 * scenario asks the adapter a question ("can I create a peer chat here?") and
 * the adapter answers from the handshake and the root snapshot, exactly as any
 * real AHP client would have to.
 *
 * Consequently nothing here reads the repository, imports host internals, or
 * consults the checkpoint id. Adding a fifth checkpoint must require no change
 * to this file; adding a *capability* is the only reason to touch it.
 */

import type { AgentProviderCapabilities } from './agentHostLiveCompatProtocol.js';

/**
 * Every protocol version this suite is willing to negotiate, most preferred
 * first.
 *
 * Deliberately a literal list rather than an import of the working tree's
 * `SUPPORTED_PROTOCOL_VERSIONS`: the suite plays the role of a *client* that
 * must interoperate with all four builds, and the oldest of them predates
 * entries the current tree advertises. Pinning the list here keeps the offer
 * stable when the working tree's own list moves.
 */
export const LIVE_COMPAT_OFFERED_PROTOCOL_VERSIONS: readonly string[] = Object.freeze([
	'1.0.0',
	'0.8.0',
	'0.7.0',
	'0.6.0',
	'0.5.2',
	'0.5.1',
]);

/** What a build advertised, as observed over AHP. */
export interface IAgentHostAdvertisedSurface {
	/** Version the `initialize` handshake settled on. */
	readonly protocolVersion: string;
	/** Provider capabilities from the root snapshot, keyed by provider id. */
	readonly providerCapabilities: ReadonlyMap<string, AgentProviderCapabilities>;
}

/**
 * The questions a scenario is allowed to ask about the build it is driving.
 *
 * Each is derived from {@link IAgentHostAdvertisedSurface}, so a scenario's
 * behavior is a function of the advertised contract rather than of which
 * checkpoint happens to be running.
 */
export interface IAgentHostCapabilityAdapter {
	readonly protocolVersion: string;
	/** Whether `session/titleChanged` may be dispatched for a readable rename. */
	readonly supportsSessionRename: boolean;
	/**
	 * Whether `createChat` may be called against `provider`. False when the
	 * provider does not advertise `multipleChats`, in which case a peer-chat
	 * step must be skipped rather than expected to fail.
	 */
	supportsPeerChats(provider: string): boolean;
}

/**
 * Minimum negotiated protocol version that carries `session/titleChanged` as a
 * client-dispatchable action. Every checkpoint in the matrix is at or above it
 * today; the check exists so a future older checkpoint degrades into a skipped
 * step with a stated reason instead of a mystery assertion failure.
 */
const MIN_PROTOCOL_VERSION_FOR_RENAME = '0.5.1';

export function createAgentHostCapabilityAdapter(surface: IAgentHostAdvertisedSurface): IAgentHostCapabilityAdapter {
	return {
		protocolVersion: surface.protocolVersion,
		supportsSessionRename: compareProtocolVersions(surface.protocolVersion, MIN_PROTOCOL_VERSION_FOR_RENAME) >= 0,
		supportsPeerChats: provider => surface.providerCapabilities.get(provider)?.multipleChats !== undefined,
	};
}

/**
 * Compares two `MAJOR.MINOR.PATCH` protocol versions. Returns a negative
 * number when `left` is older, zero when equal, positive when newer.
 *
 * A local implementation rather than an import: the working tree's comparator
 * is part of the code under test, and a compatibility suite that borrowed it
 * would stop being able to detect a regression in it.
 */
export function compareProtocolVersions(left: string, right: string): number {
	const leftParts = parseProtocolVersion(left);
	const rightParts = parseProtocolVersion(right);
	for (let index = 0; index < 3; index++) {
		if (leftParts[index] !== rightParts[index]) {
			return leftParts[index] - rightParts[index];
		}
	}
	return 0;
}

function parseProtocolVersion(version: string): readonly [number, number, number] {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		throw new Error(`[agent-host-live-compat] not a protocol version: '${version}'`);
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}
