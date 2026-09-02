/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { type IRegionContextProviderService, type Region, type LineRange, NullRegionContextProviderService } from '../../../platform/languageContextProvider/common/regionContextProvider';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { TypeScript } from './tsService';
import { TS7RegionContextProvider } from './ts7/regionContextProvider';
import { TS6RegionContextProvider } from './ts6/regionContextProvider';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';

export class ContainerContextProviderService implements IRegionContextProviderService {

	readonly _serviceBrand: undefined;

	private readonly disposables: DisposableStore;
	private provider: Omit<IRegionContextProviderService, '_serviceBrand'>;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		this.disposables = new DisposableStore();
		this.disposables.add(this.configurationService.onDidChangeConfiguration(e => {
			if (TypeScript.affectsVersion(e) || e.affectsConfiguration(ConfigKey.TypeScript7LanguageContext.fullyQualifiedId)) {
				this.updateProvider();
			}
		}));
		this.provider = this.createProvider();
	}

	dispose(): void {
		this.provider.dispose();
		this.disposables.dispose();
	}

	getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined> {
		return this.provider.getRegions(document, languageId, ranges, requested);
	}

	private createProvider(): Omit<IRegionContextProviderService, '_serviceBrand'> {
		if (!TypeScript.runsVersion7()) {
			return new TS6RegionContextProvider();
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7RegionContextProvider(this.logService)
			: new NullRegionContextProviderService();
	}

	private updateProvider(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldProvider = this.provider;
		if (runsTS7) {
			if (oldProvider instanceof TS6RegionContextProvider) {
				this.provider = enableTS7
					? new TS7RegionContextProvider(this.logService)
					: new NullRegionContextProviderService();
			} else if (oldProvider instanceof TS7RegionContextProvider && !enableTS7) {
				this.provider = new NullRegionContextProviderService();
			} else if (oldProvider instanceof NullRegionContextProviderService && enableTS7) {
				this.provider = new TS7RegionContextProvider(this.logService);
			}
		} else if (!(oldProvider instanceof TS6RegionContextProvider)) {
			this.provider = new TS6RegionContextProvider();
		}
		if (oldProvider !== this.provider) {
			oldProvider.dispose();
		}
	}
}
