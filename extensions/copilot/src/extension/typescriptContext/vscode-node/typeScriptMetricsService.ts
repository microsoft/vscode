/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { ITypeScriptMetricsService, NullTypeScriptMetricsService, type TypeScriptMetricsResult } from '../../../platform/languageContextProvider/common/typeScriptMetrics';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { TypeScript } from './tsService';
import { TS6TypeScriptMetricsProvider } from './ts6/typeScriptMetricsService';
import { TS7TypeScriptMetricsProvider } from './ts7/typeScriptMetricsService';

export class TypeScriptMetricsService implements ITypeScriptMetricsService {
	readonly _serviceBrand: undefined;

	private readonly disposables = new DisposableStore();
	private provider: Omit<ITypeScriptMetricsService, '_serviceBrand'>;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		this.disposables.add(this.configurationService.onDidChangeConfiguration(event => {
			if (TypeScript.affectsVersion(event) || event.affectsConfiguration(ConfigKey.TypeScript7LanguageContext.fullyQualifiedId)) {
				this.updateProvider();
			}
		}));
		this.provider = this.createProvider();
	}

	computeMetrics(filePath: string, content?: string): Promise<TypeScriptMetricsResult | undefined> {
		return this.provider.computeMetrics(filePath, content);
	}

	dispose(): void {
		this.provider.dispose();
		this.disposables.dispose();
	}

	private createProvider(): Omit<ITypeScriptMetricsService, '_serviceBrand'> {
		if (!TypeScript.runsVersion7()) {
			return new TS6TypeScriptMetricsProvider();
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7TypeScriptMetricsProvider(this.logService)
			: new NullTypeScriptMetricsService();
	}

	private updateProvider(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldProvider = this.provider;
		if (runsTS7) {
			if (oldProvider instanceof TS6TypeScriptMetricsProvider) {
				this.provider = enableTS7
					? new TS7TypeScriptMetricsProvider(this.logService)
					: new NullTypeScriptMetricsService();
			} else if (oldProvider instanceof TS7TypeScriptMetricsProvider && !enableTS7) {
				this.provider = new NullTypeScriptMetricsService();
			} else if (oldProvider instanceof NullTypeScriptMetricsService && enableTS7) {
				this.provider = new TS7TypeScriptMetricsProvider(this.logService);
			}
		} else if (!(oldProvider instanceof TS6TypeScriptMetricsProvider)) {
			this.provider = new TS6TypeScriptMetricsProvider();
		}
		if (oldProvider !== this.provider) {
			oldProvider.dispose();
		}
	}
}
