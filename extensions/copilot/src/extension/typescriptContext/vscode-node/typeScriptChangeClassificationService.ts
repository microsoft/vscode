/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ITypeScriptChangeClassificationService, NullTypeScriptChangeClassificationService, type TypeScriptChangeClassificationInput, type TypeScriptChangeClassificationResult } from '../../../platform/languageContextProvider/common/typeScriptChangeClassification';
import { ILogService } from '../../../platform/log/common/logService';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { TS6TypeScriptChangeClassificationProvider } from './ts6/typeScriptChangeClassificationService';
import { TS7TypeScriptChangeClassificationProvider } from './ts7/typeScriptChangeClassificationService';
import { TypeScript } from './tsService';

export class TypeScriptChangeClassificationService implements ITypeScriptChangeClassificationService {
	readonly _serviceBrand: undefined;

	private readonly disposables = new DisposableStore();
	private provider: Omit<ITypeScriptChangeClassificationService, '_serviceBrand'>;

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

	classifyChanges(filePath: string, changes: TypeScriptChangeClassificationInput, content?: string): Promise<TypeScriptChangeClassificationResult | undefined> {
		if (!changes.added.every(range => Number.isInteger(range.start) && range.start >= 0 && Number.isInteger(range.end) && range.end > range.start)
			|| !changes.changed.every(range => Number.isInteger(range.start) && range.start >= 0 && Number.isInteger(range.end) && range.end > range.start)
			|| !changes.deleted.every(deleted => Number.isInteger(deleted.line) && deleted.line >= 0
				&& Number.isInteger(deleted.deletedLineCount) && deleted.deletedLineCount > 0)) {
			throw new Error('TypeScript change buckets contain invalid line information');
		}
		return this.provider.classifyChanges(filePath, changes, content);
	}

	dispose(): void {
		this.provider.dispose();
		this.disposables.dispose();
	}

	private createProvider(): Omit<ITypeScriptChangeClassificationService, '_serviceBrand'> {
		if (!TypeScript.runsVersion7()) {
			return new TS6TypeScriptChangeClassificationProvider();
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7TypeScriptChangeClassificationProvider(this.logService)
			: new NullTypeScriptChangeClassificationService();
	}

	private updateProvider(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldProvider = this.provider;
		if (runsTS7) {
			if (oldProvider instanceof TS6TypeScriptChangeClassificationProvider) {
				this.provider = enableTS7
					? new TS7TypeScriptChangeClassificationProvider(this.logService)
					: new NullTypeScriptChangeClassificationService();
			} else if (oldProvider instanceof TS7TypeScriptChangeClassificationProvider && !enableTS7) {
				this.provider = new NullTypeScriptChangeClassificationService();
			} else if (oldProvider instanceof NullTypeScriptChangeClassificationService && enableTS7) {
				this.provider = new TS7TypeScriptChangeClassificationProvider(this.logService);
			}
		} else if (!(oldProvider instanceof TS6TypeScriptChangeClassificationProvider)) {
			this.provider = new TS6TypeScriptChangeClassificationProvider();
		}
		if (oldProvider !== this.provider) {
			oldProvider.dispose();
		}
	}
}
