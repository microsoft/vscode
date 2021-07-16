/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetection';
import { IUntitledTextEditorService } from 'vs/workbench/services/untitled/common/untitledTextEditorService';
import { FileAccess } from 'vs/base/common/network';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import type { ModelOperations } from '@vscode/vscode-languagedetection';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ModesRegistry } from 'vs/editor/common/modes/modesRegistry';

export class LanguageDetectionService extends Disposable implements ILanguageDetectionService {
	private static readonly expectedConfidence = 0.6;
	private static readonly ModelLangToLangIdMap: { [key: string]: string } = {
		bat: 'bat',
		cmd: 'bat',
		btm: 'bat',
		c: 'c',
		cs: 'csharp',
		cpp: 'cpp',
		cc: 'cpp',
		coffee: 'coffeescript',
		litcoffee: 'coffeescript',
		css: 'css',
		erl: 'erlang',
		hrl: 'erlang',
		go: 'go',
		hs: 'haskell',
		lhs: 'haskell',
		html: 'html',
		java: 'java',
		js: 'javascript',
		es6: 'javascript',
		ipynb: 'jupyter',
		lua: 'lua',
		md: 'markdown',
		matlab: 'matlab',
		m: 'objective-c',
		mm: 'objective-c',
		pl: 'perl',
		pm: 'perl',
		php: 'php',
		ps1: 'powershell',
		py: 'python',
		r: 'r',
		rdata: 'r',
		rds: 'r',
		rda: 'r',
		rb: 'ruby',
		rs: 'rust',
		scala: 'scala',
		sh: 'shellscript',
		sql: 'sql',
		swift: 'swift',
		tex: 'tex',
		ts: 'typescript',
		tsx: 'typescriptreact'
	};

	private _loadFailed = false;
	private _modelOperations: ModelOperations | undefined;
	_serviceBrand: undefined;

	constructor(
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService) {
		super();

		untitledTextEditorService.onDidChangeDirty(async e => {
			const mode = e.getMode();
			if (!mode || mode === 'plaintext') {
				const value = untitledTextEditorService.getValue(e.resource);
				if (!value) { return; }
				const lang = await this.detectLanguage(value);
				if (!lang) { return; }
				e.setMode(lang);
			}
		});
	}

	async getModelOperations(): Promise<ModelOperations> {
		if (this._modelOperations) {
			return this._modelOperations;
		}

		const { ModelOperations } = await import('@vscode/vscode-languagedetection');
		this._modelOperations = new ModelOperations(
			async () => {
				const response = await fetch(this._environmentService.isBuilt
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
				const response = await fetch(this._environmentService.isBuilt
					? FileAccess.asBrowserUri('../../../../../../node_modules.asar.unpacked/@vscode/vscode-oniguruma/model/group1-shard1of1.bin', require).toString(true)
					: FileAccess.asBrowserUri('../../../../../../node_modules/@vscode/vscode-languagedetection/model/group1-shard1of1.bin', require).toString(true));
				const buffer = await response.arrayBuffer();
				return buffer;
			}
		);

		return this._modelOperations;
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

		const vscodeLanguageId = LanguageDetectionService.ModelLangToLangIdMap[languageId];
		if (vscodeLanguageId && confidence >= LanguageDetectionService.expectedConfidence) {
			const langIds = ModesRegistry.getLanguages();
			if (!langIds.some(l => l.id === vscodeLanguageId)) {
				// The language isn't supported in VS Code
				return;
			}

			return vscodeLanguageId;
		}

		return;
	}
}

Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench).registerWorkbenchContribution(LanguageDetectionService, LifecyclePhase.Eventually);
