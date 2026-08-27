/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { type IContainerContextProviderService, type Container, NullContainerContextProviderService } from '../../../platform/languageContextProvider/common/containerContextProvider';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { TypeScript } from './tsService';
import { TS7ContainerContextProvider } from './ts7/containerContextProvider';
import { TS6ContainerContextProvider } from './ts6/containerContextProvider';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';

export class ContainerContextProviderService implements IContainerContextProviderService {

	readonly _serviceBrand: undefined;

	private readonly disposables: DisposableStore;
	private provider: Omit<IContainerContextProviderService, '_serviceBrand'>;

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
		this.provider = this.disposables.add(this.createProvider());
	}

	dispose(): void {
		this.disposables.dispose();
	}

	getContainers(document: vscode.Uri, languageId: string, line: number): Promise<Container[] | undefined> {
		return this.provider.getContainers(document, languageId, line);
	}

	private createProvider(): Omit<IContainerContextProviderService, '_serviceBrand'> {
		if (!TypeScript.runsVersion7()) {
			return new TS6ContainerContextProvider();
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7ContainerContextProvider(this.logService)
			: new NullContainerContextProviderService();
	}

	private updateProvider(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldProvider = this.provider;
		if (runsTS7) {
			if (oldProvider instanceof TS6ContainerContextProvider) {
				this.provider = enableTS7
					? new TS7ContainerContextProvider(this.logService)
					: new NullContainerContextProviderService();
			} else if (oldProvider instanceof TS7ContainerContextProvider && !enableTS7) {
				this.provider = new NullContainerContextProviderService();
			} else if (oldProvider instanceof NullContainerContextProviderService && enableTS7) {
				this.provider = new TS7ContainerContextProvider(this.logService);
			}
		} else if (!(oldProvider instanceof TS6ContainerContextProvider)) {
			this.provider = new TS6ContainerContextProvider();
		}
		if (oldProvider !== this.provider) {
			oldProvider.dispose();
		}
	}
}
