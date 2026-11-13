/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { isLoopbackHost } from '../../remote/common/remoteHosts.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

const insecureConnectionApprovalPrefix = 'remoteAgentHost.insecureConnectionApproval.';
const pendingConfirmations = new WeakMap<IStorageService, Map<string, Promise<boolean>>>();

export function getRemoteAgentHostWebSocketUrl(address: string): URL {
	return new URL(address.startsWith('ws://') || address.startsWith('wss://') ? address : `ws://${address}`);
}

/** Confirms plaintext non-loopback connections, remembering approval per origin on this machine. */
export async function confirmRemoteAgentHostConnection(address: string, dialogService: IDialogService, storageService: IStorageService): Promise<boolean> {
	const url = getRemoteAgentHostWebSocketUrl(address);
	const hostname = url.hostname.replace(/\.$/, '');
	// URL canonicalizes IPv4-mapped IPv6 addresses to hexadecimal.
	const loopback = isLoopbackHost(hostname)
		|| hostname.endsWith('.localhost')
		|| /^127(?:\.\d{1,3}){3}$/.test(hostname)
		|| /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(hostname);
	if (url.protocol === 'wss:' || loopback) {
		return true;
	}

	const origin = url.origin;
	const storageKey = `${insecureConnectionApprovalPrefix}${origin}`;
	if (storageService.getBoolean(storageKey, StorageScope.APPLICATION, false)) {
		return true;
	}
	let pending = pendingConfirmations.get(storageService);
	if (!pending) {
		pending = new Map();
		pendingConfirmations.set(storageService, pending);
	}
	const existing = pending.get(origin);
	if (existing) {
		return existing;
	}

	const confirmation = (async () => {
		const { confirmed } = await dialogService.confirm({
			type: 'warning',
			message: localize('remoteAgentHost.insecureConnection', "Connect to '{0}' without encryption?", origin),
			detail: localize('remoteAgentHost.insecureConnectionDetail', "Others on the network may read or change data sent to this host, including credentials and chat content. Use wss://, SSH, or a Dev Tunnel for a secure connection.\n\nIf you continue, your approval will be remembered for this host and port on this machine."),
			primaryButton: localize('remoteAgentHost.connectAnyway', "&&Connect Anyway"),
			custom: true,
		});
		if (confirmed) {
			storageService.store(storageKey, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		return confirmed;
	})();
	pending.set(origin, confirmation);
	try {
		return await confirmation;
	} finally {
		pending.delete(origin);
	}
}
