/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetection';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { FileAccess } from 'vs/base/common/network';
import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { URI } from 'vs/base/common/uri';
import { isWeb } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { debounce } from 'vs/base/common/decorators';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { IWorkingCopy } from 'vs/workbench/services/workingCopy/common/workingCopy';

export class LanguageDetectionService extends Disposable implements ILanguageDetectionService {
	private static readonly expectedRelativeConfidence = 0.2;
	static readonly enablementSettingKey = 'workbench.editor.untitled.experimentalLanguageDetection';

	private _loadFailed = false;
	private _modelOperations: ModelOperations | undefined;
	_serviceBrand: undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IModeService private readonly _modeService: IModeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IUntitledTextEditorService private readonly _untitledTextEditorService: IUntitledTextEditorService,
		@IWorkingCopyService _workingCopyService: IWorkingCopyService) {
		super();

		this._register(_workingCopyService.onDidChangeContent(e => this.handleChangeEvent(e)));
	}

	@debounce(600)
	private async handleChangeEvent(e: IWorkingCopy) {
		const untitledEditorModel = this._untitledTextEditorService.get(e.resource);
		if (!untitledEditorModel
			|| !this.isEnabledForMode(untitledEditorModel.getMode())
			|| untitledEditorModel.hasModeSetExplicitly) {
			return;
		}

		const value = this._untitledTextEditorService.getValue(e.resource);
		if (!value) { return; }
		const lang = await this.detectLanguage(value);
		if (!lang) { return; }
		untitledEditorModel.setMode(lang, false);
	}

	private async getModelOperations(): Promise<ModelOperations> {
		if (this._modelOperations) {
			return this._modelOperations;
		}

		const { ModelOperations } = await import('@vscode/vscode-languagedetection');
		this._modelOperations = new ModelOperations(
			async () => {
				const response = await fetch(this._environmentService.isBuilt && !isWeb
					? FileAccess.asBrowserUri('../../../../../../node_modules.asar.unpacked/@vscode/vscode-languagedetection/model/model.json', require).toString(true)
					: FileAccess.asBrowserUri('../../../../../../node_modules/@vscode/vscode-languagedetection/model/model.json', require).toString(true));
				try {
					const modelJSON = await response.json();
					return modelJSON;
				} catch (e) {
					const message = `Failed to parse model JSON.`;
					throw new Error(message);
				}
			},
			async () => {
				const response = await fetch(this._environmentService.isBuilt && !isWeb
					? FileAccess.asBrowserUri('../../../../../../node_modules.asar.unpacked/@vscode/vscode-languagedetection/model/group1-shard1of1.bin', require).toString(true)
					: FileAccess.asBrowserUri('../../../../../../node_modules/@vscode/vscode-languagedetection/model/group1-shard1of1.bin', require).toString(true));
				const buffer = await response.arrayBuffer();
				return buffer;
			}
		);

		return this._register(this._modelOperations);
	}

	private isEnabledForMode(modeId: string | undefined): boolean {
		return !!modeId && this._configurationService.getValue<boolean>(LanguageDetectionService.enablementSettingKey, { overrideIdentifier: modeId });
	}

	async detectLanguage(contentOrResource: string | URI): Promise<string | undefined> {
		let content: string | undefined = URI.isUri(contentOrResource) ? this._untitledTextEditorService.getValue(contentOrResource) : contentOrResource;

		if (content) {
			for await (const language of this.detectLanguagesImpl(content)) {
				return language;
			}
		}
		return undefined;
	}

	async detectLanguages(contentOrResource: string | URI): Promise<string[]> {
		let content: string | undefined = URI.isUri(contentOrResource) ? this._untitledTextEditorService.getValue(contentOrResource) : contentOrResource;

		const languages: string[] = [];
		if (content) {
			for await (const language of this.detectLanguagesImpl(content)) {
				languages.push(language);
			}
		}
		return languages;
	}

	private async * detectLanguagesImpl(content: string) {
		if (this._loadFailed) {
			return;
		}

		let modelOperations: ModelOperations | undefined;
		try {
			modelOperations = await this.getModelOperations();
		} catch (e) {
			this._loadFailed = true;
			return;
		}

		const modelResults = await modelOperations.runModel(content);
		if (!modelResults
			|| modelResults.length === 0
			|| modelResults[0].confidence < LanguageDetectionService.expectedRelativeConfidence) {
			return;
		}

		const possibleLanguages: ModelResult[] = [modelResults[0]];

		for (let current of modelResults) {

			if (current === modelResults[0]) {
				continue;
			}

			const currentHighest = possibleLanguages[possibleLanguages.length - 1];

			if (currentHighest.confidence - current.confidence >= LanguageDetectionService.expectedRelativeConfidence) {
				while (possibleLanguages.length) {
					// TODO: see if there's a better way to do this.
					const vscodeLanguageId = this._modeService.getModeIdByFilepathOrFirstLine(URI.file(`file.${possibleLanguages.shift()!.languageId}`));
					if (vscodeLanguageId) {
						yield vscodeLanguageId;
					}
				}
				if (current.confidence > LanguageDetectionService.expectedRelativeConfidence) {
					possibleLanguages.push(current);
					continue;
				}
				return;
			} else {
				if (current.confidence > LanguageDetectionService.expectedRelativeConfidence) {
					possibleLanguages.push(current);
					continue;
				}
				return;
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)
	.registerWorkbenchContribution(LanguageDetectionService, LifecyclePhase.Eventually);
registerSingleton(ILanguageDetectionService, LanguageDetectionService);
