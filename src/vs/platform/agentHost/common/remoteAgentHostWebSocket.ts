/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { raceCancellation } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IDialogService } from '../../dialogs/common/dialogs.js';
import { isLoopbackHost } from '../../remote/common/remoteHosts.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { NonReconnectableTransportError } from './state/sessionTransport.js';

const insecureConnectionApprovalPrefix = 'remoteAgentHost.insecureConnectionApproval.';
interface IPendingConfirmation {
	readonly cancellation: CancellationTokenSource;
	readonly result: Promise<boolean>;
	requests: number;
}
const pendingConfirmations = new WeakMap<IStorageService, Map<string, IPendingConfirmation>>();

export class RemoteAgentHostConnectionConfirmationRequiredError extends NonReconnectableTransportError {
	constructor() {
		super(localize('remoteAgentHost.confirmationRequired', "This unencrypted connection requires confirmation. Select Connect to review the warning."));
	}
}

export function getRemoteAgentHostWebSocketUrl(address: string): URL {
	return new URL(address.startsWith('ws://') || address.startsWith('wss://') ? address : `ws://${address}`);
}

function getUnapprovedOrigin(address: string, storageService: IStorageService): string | undefined {
	const url = getRemoteAgentHostWebSocketUrl(address);
	const hostname = url.hostname.replace(/\.$/, '');
	// URL canonicalizes IPv4-mapped IPv6 addresses to hexadecimal.
	const loopback = isLoopbackHost(hostname)
		|| hostname.endsWith('.localhost')
		|| /^127(?:\.\d{1,3}){3}$/.test(hostname)
		|| /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(hostname);
	if (url.protocol === 'wss:' || loopback) {
		return undefined;
	}
	return storageService.getBoolean(`${insecureConnectionApprovalPrefix}${url.origin}`, StorageScope.APPLICATION, false) ? undefined : url.origin;
}

export function requiresRemoteAgentHostConnectionConfirmation(address: string, storageService: IStorageService): boolean {
	return getUnapprovedOrigin(address, storageService) !== undefined;
}

export function onDidChangeRemoteAgentHostConnectionApproval(storageService: IStorageService, disposables: DisposableStore): Event<void> {
	return Event.map(Event.filter(storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, disposables),
		event => event.key.startsWith(insecureConnectionApprovalPrefix)), () => undefined);
}

/** Shares a cancellable plaintext warning and remembers approval only while a request still needs it. */
export async function confirmRemoteAgentHostConnection(address: string, dialogService: IDialogService, storageService: IStorageService, token: CancellationToken = CancellationToken.None): Promise<boolean> {
	if (token.isCancellationRequested) {
		return false;
	}
	const origin = getUnapprovedOrigin(address, storageService);
	if (origin === undefined) {
		return true;
	}
	let pending = pendingConfirmations.get(storageService);
	if (!pending) {
		pending = new Map();
		pendingConfirmations.set(storageService, pending);
	}
	let confirmation = pending.get(origin);
	if (!confirmation) {
		const disposables = new DisposableStore();
		const cancellation = disposables.add(new CancellationTokenSource());
		const confirmations = pending;
		const result = (async () => {
			try {
				const { confirmed } = await dialogService.confirm({
					type: 'warning',
					message: localize('remoteAgentHost.insecureConnection', "Connect to '{0}' without encryption?", origin),
					detail: localize('remoteAgentHost.insecureConnectionDetail', "Others on the network may read or change data sent to this host, including credentials and chat content. Use wss://, SSH, or a Dev Tunnel for a secure connection.\n\nIf you continue, your approval will be remembered for this host and port on this machine."),
					primaryButton: localize('remoteAgentHost.connectAnyway', "&&Connect Anyway"),
					custom: true,
					token: cancellation.token,
				});
				if (!confirmed || cancellation.token.isCancellationRequested) {
					return false;
				}
				storageService.store(`${insecureConnectionApprovalPrefix}${origin}`, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
				return true;
			} finally {
				if (confirmations.get(origin)?.cancellation === cancellation) {
					confirmations.delete(origin);
				}
				disposables.dispose();
			}
		})();
		confirmation = { cancellation, result, requests: 0 };
		pending.set(origin, confirmation);
	}
	const current = confirmation;
	current.requests++;
	let released = false;
	const release = () => {
		if (released) {
			return;
		}
		released = true;
		if (--current.requests === 0) {
			if (pending.get(origin) === current) {
				pending.delete(origin);
			}
			current.cancellation.cancel();
		}
	};
	const requestDisposables = new DisposableStore();
	requestDisposables.add(token.onCancellationRequested(release));
	try {
		return token.isCancellationRequested ? false : await raceCancellation(current.result, token, false);
	} finally {
		requestDisposables.dispose();
		release();
	}
}
