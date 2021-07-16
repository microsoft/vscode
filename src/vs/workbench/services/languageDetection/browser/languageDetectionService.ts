/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetection';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { FileAccess } from 'vs/base/common/network';
import type { ModelOperations } from '@vscode/vscode-languagedetection';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IModeService } from 'vs/editor/common/services/modeService';
import { URI } from 'vs/base/common/uri';
import { isWeb } from 'vs/base/common/platform';

export class LanguageDetectionService extends Disposable implements ILanguageDetectionService {
	private static readonly expectedConfidence = 0.6;

	private _loadFailed = false;
	private _modelOperations: ModelOperations | undefined;
	_serviceBrand: undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IModeService private readonly _modeService: IModeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService) {
		super();

		this._register(untitledTextEditorService.onDidChangeContent(async e => {
			if (!configurationService.getValue<boolean>('languageDetection.enabled', { overrideIdentifier: e.getMode() })) {
				return;
			}

			const value = untitledTextEditorService.getValue(e.resource);
			if (!value) { return; }
			const lang = await this.detectLanguage(value);
			if (!lang) { return; }
			e.setMode(lang);
		}));
	}

	async getModelOperations(): Promise<ModelOperations> {
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
					? FileAccess.asBrowserUri('../../../../../../node_modules.asar.unpacked/@vscode/vscode-oniguruma/model/group1-shard1of1.bin', require).toString(true)
					: FileAccess.asBrowserUri('../../../../../../node_modules/@vscode/vscode-languagedetection/model/group1-shard1of1.bin', require).toString(true));
				const buffer = await response.arrayBuffer();
				return buffer;
			}
		);

		return this._register(this._modelOperations);
	}

	async detectLanguage(content: string): Promise<string | undefined> {
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
		if (!modelResults) {
			return;
		}

		let { languageId, confidence } = modelResults[0];

		// TODO: this is the place where we can improve the results of the model with know hueristics (popular languages, etc).

		// For ts/js and c/cpp we "add" the confidence of the other language to ensure better results
		switch (languageId) {
			case 'ts':
				if (modelResults[1].languageId === 'js') {
					confidence += modelResults[1].confidence;
				}
				break;
			case 'js':
				if (modelResults[1].languageId === 'ts') {
					confidence += modelResults[1].confidence;
				}
				break;
			case 'c':
				if (modelResults[1].languageId === 'cpp') {
					confidence += modelResults[1].confidence;
				}
				break;
			case 'cpp':
				if (modelResults[1].languageId === 'c') {
					confidence += modelResults[1].confidence;
				}
				break;
			default:
				break;
		}

		if (confidence < LanguageDetectionService.expectedConfidence) {
			return;
		}

		// TODO: see if there's a better way to do this.
		const vscodeLanguageId = this._modeService.getModeIdByFilepathOrFirstLine(URI.file(`file.${languageId}`));
		return vscodeLanguageId ?? undefined;
	}
}
