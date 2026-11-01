/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, ExtHostSecretStateShape, MainContext, MainThreadSecretStateShape } from '../common/extHost.protocol.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { ISecretStorageService } from '../../../platform/secrets/common/secrets.js';
import { IBrowserWorkbenchEnvironmentService } from '../../services/environment/browser/environmentService.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { ExtensionHostKind } from '../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';

@extHostNamedCustomer(MainContext.MainThreadSecretState)
export class MainThreadSecretState extends Disposable implements MainThreadSecretStateShape {
	private readonly _proxy: ExtHostSecretStateShape;

	private readonly _sequencer = new SequencerByKey<string>();

	private readonly _extensionHostKind: ExtensionHostKind;

	constructor(
		extHostContext: IExtHostContext,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super();

		this._extensionHostKind = extHostContext.extensionHostKind;
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSecretState);

		this._register(this.secretStorageService.onDidChangeSecret((e: string) => {
			const parsedKey = this.parseKey(e);
			if (parsedKey) {
				this._proxy.$onDidChangePassword(parsedKey);
			}
		}));
	}

	/**
	 * Rejects an `extensionId` that does not belong to the extension host on the
	 * other end of this connection.
	 *
	 * `extensionId` arrives as an ordinary RPC argument. `ExtensionSecrets` on the
	 * extension host side binds it to the calling extension's own identifier, but
	 * that binding sits on the far side of the connection, so it says nothing about
	 * what the workbench should honour. A remote extension host is a different
	 * principal from the local one -- it runs code from the remote machine, while
	 * this store is the user's local secret store, holding tokens for UI extensions
	 * such as the authentication providers. Deciding the namespace from the message
	 * alone lets a remote host name a local extension and read or overwrite its
	 * secrets.
	 *
	 * The running location is resolved on this side from the extension registry, so
	 * it is the trusted answer to "where does this extension actually run". Comparing
	 * its kind to the connection's kind is what separates the hosts.
	 *
	 * This deliberately does not try to separate extensions that share a host: they
	 * share a process and can already reach each other's state, so a check here
	 * would not be a boundary. It separates hosts, which are distinct principals.
	 */
	private async validateExtensionHostOwnsExtension(extensionId: string): Promise<void> {
		await this.extensionService.whenInstalledExtensionsRegistered();

		const statuses = this.extensionService.getExtensionsStatus();
		const wantedKey = ExtensionIdentifier.toKey(extensionId);
		const status = Object.keys(statuses)
			.map(key => statuses[key])
			.find(candidate => ExtensionIdentifier.toKey(candidate.id) === wantedKey);

		// Fail closed for an extension this window does not know about. Secrets for a
		// disabled or uninstalled extension can still be sitting in the store, and
		// nothing legitimate asks for a namespace that has no running extension.
		const runningLocationKind = status?.runningLocation?.kind;
		if (runningLocationKind === undefined) {
			this.logService.warn(`[mainThreadSecretState] Refusing secret access for '${extensionId}': it is not running in this window.`);
			throw new Error(`Extension '${extensionId}' is not running in this window.`);
		}

		if (runningLocationKind !== this._extensionHostKind) {
			this.logService.warn(`[mainThreadSecretState] Refusing secret access for '${extensionId}': it runs in a different extension host than the caller.`);
			throw new Error(`Extension '${extensionId}' does not run in the calling extension host.`);
		}
	}

	$getPassword(extensionId: string, key: string): Promise<string | undefined> {
		this.logService.trace(`[mainThreadSecretState] Getting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doGetPassword(extensionId, key));
	}

	private async doGetPassword(extensionId: string, key: string): Promise<string | undefined> {
		await this.validateExtensionHostOwnsExtension(extensionId);
		const fullKey = this.getKey(extensionId, key);
		const password = await this.secretStorageService.get(fullKey);
		this.logService.trace(`[mainThreadSecretState] ${password ? 'P' : 'No p'}assword found for: `, extensionId, key);
		return password;
	}

	$setPassword(extensionId: string, key: string, value: string): Promise<void> {
		this.logService.trace(`[mainThreadSecretState] Setting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doSetPassword(extensionId, key, value));
	}

	private async doSetPassword(extensionId: string, key: string, value: string): Promise<void> {
		await this.validateExtensionHostOwnsExtension(extensionId);
		const fullKey = this.getKey(extensionId, key);
		await this.secretStorageService.set(fullKey, value);
		this.logService.trace('[mainThreadSecretState] Password set for: ', extensionId, key);
	}

	$deletePassword(extensionId: string, key: string): Promise<void> {
		this.logService.trace(`[mainThreadSecretState] Deleting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doDeletePassword(extensionId, key));
	}

	private async doDeletePassword(extensionId: string, key: string): Promise<void> {
		await this.validateExtensionHostOwnsExtension(extensionId);
		const fullKey = this.getKey(extensionId, key);
		await this.secretStorageService.delete(fullKey);
		this.logService.trace('[mainThreadSecretState] Password deleted for: ', extensionId, key);
	}

	$getKeys(extensionId: string): Promise<string[]> {
		this.logService.trace(`[mainThreadSecretState] Getting keys for ${extensionId} extension: `);
		return this._sequencer.queue(extensionId, () => this.doGetKeys(extensionId));
	}

	private async doGetKeys(extensionId: string): Promise<string[]> {
		await this.validateExtensionHostOwnsExtension(extensionId);
		if (!this.secretStorageService.keys) {
			throw new Error('Secret storage service does not support keys() method');
		}
		const allKeys = await this.secretStorageService.keys();
		const keys = allKeys
			.map(key => this.parseKey(key))
			.filter((parsedKey): parsedKey is { extensionId: string; key: string } => parsedKey !== undefined && parsedKey.extensionId === extensionId)
			.map(({ key }) => key); // Return only my keys
		this.logService.trace(`[mainThreadSecretState] Got ${keys.length}key(s) for: `, extensionId);
		return keys;
	}

	private getKey(extensionId: string, key: string): string {
		return JSON.stringify({ extensionId, key });
	}

	private parseKey(key: string): { extensionId: string; key: string } | undefined {
		try {
			return JSON.parse(key);
		} catch {
			return undefined;
		}
	}
}
