/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICodeReviewService, NullCodeReviewService, type TypeScriptChangeClassificationInput, type TypeScriptChangeClassificationResult, type TypeScriptMetricsResult } from '../../../platform/languageContextProvider/common/codeReviewService';
import { ILogService } from '../../../platform/log/common/logService';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { TS6CodeReviewProvider } from './ts6/codeReviewService';
import { TS7CodeReviewProvider } from './ts7/codeReviewService';
import { TypeScript } from './tsService';

export class CodeReviewService implements ICodeReviewService {
	readonly _serviceBrand: undefined;

	private readonly disposables = new DisposableStore();
	private provider: Omit<ICodeReviewService, '_serviceBrand'>;

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

	classifyChanges(input: TypeScriptChangeClassificationInput): Promise<TypeScriptChangeClassificationResult | undefined> {
		if (!input.modified.added.every(CodeReviewService.isValidLineRange)
			|| !input.modified.changed.every(CodeReviewService.isValidLineRange)
			|| !input.original.deleted.every(CodeReviewService.isValidLineRange)) {
			throw new Error('TypeScript change buckets contain invalid line information');
		}
		return this.provider.classifyChanges(input);
	}

	dispose(): void {
		this.provider.dispose();
		this.disposables.dispose();
	}

	private createProvider(): Omit<ICodeReviewService, '_serviceBrand'> {
		if (!TypeScript.runsVersion7()) {
			return new TS6CodeReviewProvider();
		}
		return TypeScript.isVersion7SupportEnabled(this.configurationService)
			? new TS7CodeReviewProvider(this.logService)
			: new NullCodeReviewService();
	}

	private updateProvider(): void {
		const runsTS7 = TypeScript.runsVersion7();
		const enableTS7 = TypeScript.isVersion7SupportEnabled(this.configurationService);
		const oldProvider = this.provider;
		if (runsTS7) {
			if (oldProvider instanceof TS6CodeReviewProvider) {
				this.provider = enableTS7
					? new TS7CodeReviewProvider(this.logService)
					: new NullCodeReviewService();
			} else if (oldProvider instanceof TS7CodeReviewProvider && !enableTS7) {
				this.provider = new NullCodeReviewService();
			} else if (oldProvider instanceof NullCodeReviewService && enableTS7) {
				this.provider = new TS7CodeReviewProvider(this.logService);
			}
		} else if (!(oldProvider instanceof TS6CodeReviewProvider)) {
			this.provider = new TS6CodeReviewProvider();
		}
		if (oldProvider !== this.provider) {
			oldProvider.dispose();
		}
	}

	private static isValidLineRange(range: { start: number; end: number }): boolean {
		return Number.isInteger(range.start) && range.start >= 0 && Number.isInteger(range.end) && range.end > range.start;
	}
}
