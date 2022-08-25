/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IEditSessionIdentityProvider, IEditSessionIdentityService } from 'vs/platform/workspace/common/editSessions';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class EditSessionIdentityService implements IEditSessionIdentityService {
	readonly _serviceBrand: undefined;

	private _editSessionIdentifierProviders = new Map<string, IEditSessionIdentityProvider>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) { }

	registerEditSessionIdentityProvider(provider: IEditSessionIdentityProvider): void {
		if (this._editSessionIdentifierProviders.get(provider.scheme)) {
			throw new Error(`A provider has already been registered for scheme ${provider.scheme}`);
		}

		this._editSessionIdentifierProviders.set(provider.scheme, provider);
	}

	unregisterEditSessionIdentityProvider(scheme: string): void {
		this._editSessionIdentifierProviders.delete(scheme);
	}

	async getEditSessionIdentifier(workspaceFolder: IWorkspaceFolder, cancellationTokenSource: CancellationTokenSource): Promise<string | undefined> {
		const { scheme } = workspaceFolder.uri;

		const provider = await this.activateProvider(scheme);
		this._logService.info(`EditSessionIdentityProvider for scheme ${scheme} available: ${!!provider}`);

		return provider?.getEditSessionIdentifier(workspaceFolder, cancellationTokenSource.token);
	}

	private async activateProvider(scheme: string) {
		const transformedScheme = scheme === 'vscode-remote' ? 'file' : scheme;

		const provider = this._editSessionIdentifierProviders.get(scheme);
		if (provider) {
			return provider;
		}

		await this._extensionService.activateByEvent(`onEditSession:${transformedScheme}`);
		return this._editSessionIdentifierProviders.get(scheme);
	}
}

registerSingleton(IEditSessionIdentityService, EditSessionIdentityService, true);
