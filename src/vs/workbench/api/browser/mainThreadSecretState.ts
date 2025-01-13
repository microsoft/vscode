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

@extHostNamedCustomer(MainContext.MainThreadSecretState)
export class MainThreadSecretState extends Disposable implements MainThreadSecretStateShape {
	private readonly _proxy: ExtHostSecretStateShape;

	private readonly _sequencer = new SequencerByKey<string>();

	constructor(
		extHostContext: IExtHostContext,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService,
		@ILogService private readonly logService: ILogService,
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSecretState);

		this._register(this.secretStorageService.onDidChangeSecret((e: string) => {
			try {
				const { extensionId, key } = this.parseKey(e);
				if (extensionId && key) {
					this._proxy.$onDidChangePassword({ extensionId, key });
				}
			} catch (e) {
				// Core can use non-JSON values as keys, so we may not be able to parse them.
			}
		}));
	}

	$getPassword(extensionId: string, key: string): Promise<string | undefined> {
		this.logService.trace(`[mainThreadSecretState] Getting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doGetPassword(extensionId, key));
	}

	private async doGetPassword(extensionId: string, key: string): Promise<string | undefined> {
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
		const fullKey = this.getKey(extensionId, key);
		await this.secretStorageService.set(fullKey, value);
		this.logService.trace('[mainThreadSecretState] Password set for: ', extensionId, key);
	}

	$deletePassword(extensionId: string, key: string): Promise<void> {
		this.logService.trace(`[mainThreadSecretState] Deleting password for ${extensionId} extension: `, key);
		return this._sequencer.queue(extensionId, () => this.doDeletePassword(extensionId, key));
	}

	private async doDeletePassword(extensionId: string, key: string): Promise<void> {
		const fullKey = this.getKey(extensionId, key);
		await this.secretStorageService.delete(fullKey);
		this.logService.trace('[mainThreadSecretState] Password deleted for: ', extensionId, key);
	}

	private getKey(extensionId: string, key: string): string {
		return JSON.stringify({ extensionId, key });
	}

	private parseKey(key: string): { extensionId: string; key: string } {
		return JSON.parse(key);
	}
}
