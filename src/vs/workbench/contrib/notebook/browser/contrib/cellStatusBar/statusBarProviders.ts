/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { CHANGE_CELL_LANGUAGE, DETECT_CELL_LANGUAGE } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookCellStatusBarService } from 'vs/workbench/contrib/notebook/common/notebookCellStatusBarService';
import { CellKind, CellStatusbarAlignment, INotebookCellStatusBarItem, INotebookCellStatusBarItemList, INotebookCellStatusBarItemProvider } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { INotebookKernelService } from 'vs/workbench/contrib/notebook/common/notebookKernelService';
import { INotebookService } from 'vs/workbench/contrib/notebook/common/notebookService';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

class CellStatusBarLanguagePickerProvider implements INotebookCellStatusBarItemProvider {

	readonly viewType = '*';

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) { }

	async provideCellStatusBarItems(uri: URI, index: number, _token: CancellationToken): Promise<INotebookCellStatusBarItemList | undefined> {
		const doc = this._notebookService.getNotebookTextModel(uri);
		const cell = doc?.cells[index];
		if (!cell) {
			return;
		}

		const languageId = cell.cellKind === CellKind.Markup ?
			'markdown' :
			(this._languageService.getLanguageIdByLanguageName(cell.language) || cell.language);
		const text = this._languageService.getLanguageName(languageId) || languageId;
		const item = <INotebookCellStatusBarItem>{
			text,
			command: CHANGE_CELL_LANGUAGE,
			tooltip: localize('notebook.cell.status.language', "Select Cell Language Mode"),
			alignment: CellStatusbarAlignment.Right,
			priority: -Number.MAX_SAFE_INTEGER
		};
		return {
			items: [item]
		};
	}
}

class CellStatusBarLanguageDetectionProvider implements INotebookCellStatusBarItemProvider {

	readonly viewType = '*';

	private cache = new ResourceMap<{
		lastUpdate: number;
		lastCellLang: string;
		lastGuess?: string;
	}>();

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageDetectionService private readonly _languageDetectionService: ILanguageDetectionService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) { }

	async provideCellStatusBarItems(uri: URI, index: number, token: CancellationToken): Promise<INotebookCellStatusBarItemList | undefined> {
		const doc = this._notebookService.getNotebookTextModel(uri);
		const cell = doc?.cells[index];
		if (!cell) { return; }

		const enablementConfig = this._configurationService.getValue('workbench.editor.languageDetectionHints');
		const enabled = enablementConfig === 'always' || enablementConfig === 'notebookEditors';
		if (!enabled) {
			return;
		}

		const currentLanguageId = cell.cellKind === CellKind.Markup ?
			'markdown' :
			(this._languageService.getLanguageIdByLanguageName(cell.language) || cell.language);

		if (!this.cache.has(uri)) {
			this.cache.set(uri, { lastCellLang: currentLanguageId, lastUpdate: 0 });
		}

		const cached = this.cache.get(uri)!;
		if (cached.lastUpdate < Date.now() - 1000 || cached.lastCellLang !== currentLanguageId) {
			cached.lastUpdate = Date.now();
			cached.lastCellLang = currentLanguageId;

			const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(doc);

			if (kernel) {
				const availableLangs = [];
				availableLangs.push(...kernel.supportedLanguages, 'markdown');
				cached.lastGuess = await this._languageDetectionService.detectLanguage(cell.uri, availableLangs);
			}
		}

		const items: INotebookCellStatusBarItem[] = [];
		if (cached.lastGuess && currentLanguageId !== cached.lastGuess) {
			const detectedName = this._languageService.getLanguageName(cached.lastGuess) || cached.lastGuess;
			let tooltip = localize('notebook.cell.status.autoDetectLanguage', "Accept Detected Language: {0}", detectedName);
			const keybinding = this._keybindingService.lookupKeybinding(DETECT_CELL_LANGUAGE);
			const label = keybinding?.getLabel();
			if (label) {
				tooltip += ` (${label})`;
			}
			items.push({
				text: '$(lightbulb-autofix)',
				command: DETECT_CELL_LANGUAGE,
				tooltip,
				alignment: CellStatusbarAlignment.Right,
				priority: -Number.MAX_SAFE_INTEGER + 1
			});
		}

		return { items };
	}
}

class BuiltinCellStatusBarProviders extends Disposable {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@INotebookCellStatusBarService notebookCellStatusBarService: INotebookCellStatusBarService) {
		super();

		const builtinProviders = [
			CellStatusBarLanguagePickerProvider,
			CellStatusBarLanguageDetectionProvider,
		];
		builtinProviders.forEach(p => {
			this._register(notebookCellStatusBarService.registerCellStatusBarItemProvider(instantiationService.createInstance(p)));
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinCellStatusBarProviders, LifecyclePhase.Restored);
