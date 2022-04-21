/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable } from 'vs/base/common/lifecycle';
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

	private delayer = new Delayer<INotebookCellStatusBarItemList | undefined>(500);

	constructor(
		@INotebookService private readonly _notebookService: INotebookService,
		@INotebookKernelService private readonly _notebookKernelService: INotebookKernelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILanguageDetectionService private readonly _languageDetectionService: ILanguageDetectionService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
	) { }

	async provideCellStatusBarItems(uri: URI, index: number, token: CancellationToken): Promise<INotebookCellStatusBarItemList | undefined> {
		return await this.delayer.trigger(async () => {
			const doc = this._notebookService.getNotebookTextModel(uri);
			const cell = doc?.cells[index];
			if (!cell || token.isCancellationRequested) {
				return;
			}

			const enablementConfig = this._configurationService.getValue('workbench.editor.languageDetectionHints');
			const enabled = enablementConfig === 'always' || enablementConfig === 'notebookEditors';
			if (!enabled) {
				return;
			}

			const currentLanguageId = cell.cellKind === CellKind.Markup ?
				'markdown' :
				(this._languageService.getLanguageIdByLanguageName(cell.language) || cell.language);

			const kernel = this._notebookKernelService.getMatchingKernel(doc);
			const items: INotebookCellStatusBarItem[] = [];

			if (kernel.selected) {
				const availableLangs = [];
				availableLangs.push(...kernel.selected.supportedLanguages, 'markdown');
				const detectedLanguageId = await this._languageDetectionService.detectLanguage(cell.uri, availableLangs);

				if (detectedLanguageId && currentLanguageId !== detectedLanguageId) {
					const detectedName = this._languageService.getLanguageName(detectedLanguageId) || detectedLanguageId;
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
			}

			return { items };
		});

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
