/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { ICanonicalWorkspaceIdentityProvider, ICanonicalWorkspaceService } from 'vs/platform/workspace/common/canonicalWorkspace';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';

export class CanonicalWorkspaceService implements ICanonicalWorkspaceService {
	readonly _serviceBrand: undefined;

	private _canonicalWorkspaceIdentifierProviders = new Map<string, ICanonicalWorkspaceIdentityProvider>();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
	) { }

	registerCanonicalWorkspaceIdentityProvider(provider: ICanonicalWorkspaceIdentityProvider): void {
		if (this._canonicalWorkspaceIdentifierProviders.get(provider.scheme)) {
			throw new Error(`A provider has already been registered for scheme ${provider.scheme}`);
		}

		this._canonicalWorkspaceIdentifierProviders.set(provider.scheme, provider);
	}

	async getCanonicalWorkspaceIdentifier(workspaceFolder: IWorkspaceFolder, cancellationTokenSource: CancellationTokenSource): Promise<string | null> {
		const { scheme } = workspaceFolder.uri;

		const provider = await this.activateProvider(scheme);
		this._logService.info(`CanonicalWorkspaceIdentityProvider for scheme ${scheme} available: ${!!provider}`);

		return provider?.getCanonicalWorkspaceIdentifier(workspaceFolder, cancellationTokenSource.token) ?? null;
	}

	private async activateProvider(scheme: string) {
		const provider = this._canonicalWorkspaceIdentifierProviders.get(scheme);
		if (provider) {
			return provider;
		}

		await this._extensionService.activateByEvent(`onEditSession:${scheme}`);
		return this._canonicalWorkspaceIdentifierProviders.get(scheme);
	}
}

registerSingleton(ICanonicalWorkspaceService, CanonicalWorkspaceService, true);
