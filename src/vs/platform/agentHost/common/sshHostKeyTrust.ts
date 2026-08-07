/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

/**
 * One host key the user has accepted for a remote, identified by its
 * OpenSSH-style `SHA256:` fingerprint.
 */
export interface ISSHTrustedHostKey {
	/** Host key algorithm, e.g. `ssh-ed25519`. */
	readonly keyType: string;
	/** `SHA256:...` fingerprint, matching `ssh-keygen -lf`. */
	readonly fingerprint: string;
	/** When this key was first trusted, as epoch milliseconds. */
	readonly addedAt: number;
	/** SSH config alias this host was reached through, for display. */
	readonly alias?: string;
}

/** All trusted keys for a single host, keyed by `hostname:port`. */
export interface ISSHTrustedHost {
	readonly host: string;
	readonly port: number;
	readonly keys: readonly ISSHTrustedHostKey[];
}

/**
 * Build the stable trust-store key for a host. Uses the resolved hostname and
 * port rather than an SSH config alias, since several aliases can point at one
 * machine and the host key belongs to the machine.
 */
export function computeHostKeyStoreKey(host: string, port: number): string {
	return `${host.toLowerCase()}:${port}`;
}

export const ISSHHostKeyTrustService = createDecorator<ISSHHostKeyTrustService>('sshHostKeyTrustService');

/**
 * Stores the SSH host keys the user has accepted for remote agent hosts.
 *
 * This is deliberately *our own* store rather than `~/.ssh/known_hosts`: we
 * read the user's `known_hosts` files as an additional trust source (so anyone
 * who already reached a machine from a terminal is not prompted again), but we
 * never write to them. Nothing here should ever modify the user's SSH setup.
 */
export interface ISSHHostKeyTrustService {
	readonly _serviceBrand: undefined;

	/** Fires with the `hostname:port` key whose trusted set changed. */
	readonly onDidChangeTrustedHosts: Event<string>;

	/** Trusted keys for a host, or an empty array when none are stored. */
	getTrustedKeys(host: string, port: number): readonly ISSHTrustedHostKey[];

	/**
	 * Record a host key as trusted. Replaces any existing entry for the same
	 * key type, so a key learned through rotation supersedes its predecessor
	 * rather than accumulating alongside it.
	 */
	trustHostKey(host: string, port: number, key: ISSHTrustedHostKey): void;

	/** Drop all trusted keys for a host. */
	forgetHost(host: string, port: number): void;

	/** Every host with at least one trusted key, for the "forget" picker. */
	listTrustedHosts(): readonly ISSHTrustedHost[];
}
