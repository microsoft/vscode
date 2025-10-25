/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from '../../../../../common/contributions.js';
import { CHANGE_CELL_LANGUAGE, DETECT_CELL_LANGUAGE } from '../../notebookBrowser.js';
import { INotebookCellStatusBarService } from '../../../common/notebookCellStatusBarService.js';
import { CellKind, CellStatusbarAlignment, INotebookCellStatusBarItem, INotebookCellStatusBarItemList, INotebookCellStatusBarItemProvider } from '../../../common/notebookCommon.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { INotebookService } from '../../../common/notebookService.js';
import { ILanguageDetectionService, LanguageDetectionHintConfig } from '../../../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { LifecyclePhase } from '../../../../../services/lifecycle/common/lifecycle.js';

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

		const statusBarItems: INotebookCellStatusBarItem[] = [];
		let displayLanguage = cell.language;
		if (cell.cellKind === CellKind.Markup) {
			displayLanguage = 'markdown';
		} else {
			const registeredId = this._languageService.getLanguageIdByLanguageName(cell.language);
			if (registeredId) {
				displayLanguage = this._languageService.getLanguageName(displayLanguage) ?? displayLanguage;
			} else {
				// add unregistered lanugage warning item
				const searchTooltip = localize('notebook.cell.status.searchLanguageExtensions', "Unknown cell language. Click to search for '{0}' extensions", cell.language);
				statusBarItems.push({
					text: `$(dialog-warning)`,
					command: { id: 'workbench.extensions.search', arguments: [`@tag:${cell.language}`], title: 'Search Extensions' },
					tooltip: searchTooltip,
					alignment: CellStatusbarAlignment.Right,
					priority: -Number.MAX_SAFE_INTEGER + 1
				});
			}
		}

		statusBarItems.push({
			text: displayLanguage,
			command: CHANGE_CELL_LANGUAGE,
			tooltip: localize('notebook.cell.status.language', "Select Cell Language Mode"),
			alignment: CellStatusbarAlignment.Right,
			priority: -Number.MAX_SAFE_INTEGER
		});
		return {
			items: statusBarItems
		};
	}
}

class CellStatusBarLanguageDetectionProvider implements INotebookCellStatusBarItemProvider {

	readonly viewType = '*';

	private cache = new ResourceMap<{
		contentVersion: number;
		updateTimestamp: number;
		cellLanguage: string;

		guess?: string;
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

		const enablementConfig = this._configurationService.getValue<LanguageDetectionHintConfig>('workbench.editor.languageDetectionHints');
		const enabled = typeof enablementConfig === 'object' && enablementConfig?.notebookEditors;
		if (!enabled) {
			return;
		}
		const cellUri = cell.uri;
		const contentVersion = cell.textModel?.getVersionId();
		if (!contentVersion) {
			return;
		}

		const currentLanguageId = cell.cellKind === CellKind.Markup ?
			'markdown' :
			(this._languageService.getLanguageIdByLanguageName(cell.language) || cell.language);

		if (!this.cache.has(cellUri)) {
			this.cache.set(cellUri, {
				cellLanguage: currentLanguageId, // force a re-compute upon a change in configured language
				updateTimestamp: 0, // facilitates a disposable-free debounce operation
				contentVersion: 1, // dont run for the initial contents, only on update
			});
		}

		const cached = this.cache.get(cellUri)!;
		if (cached.cellLanguage !== currentLanguageId || (cached.updateTimestamp < Date.now() - 1000 && cached.contentVersion !== contentVersion)) {
			cached.updateTimestamp = Date.now();
			cached.cellLanguage = currentLanguageId;
			cached.contentVersion = contentVersion;

			const kernel = this._notebookKernelService.getSelectedOrSuggestedKernel(doc);
			if (kernel) {
				const supportedLangs = [...kernel.supportedLanguages, 'markdown'];
				cached.guess = await this._languageDetectionService.detectLanguage(cell.uri, supportedLangs);
			}
		}

		const items: INotebookCellStatusBarItem[] = [];
		if (cached.guess && currentLanguageId !== cached.guess) {
			const detectedName = this._languageService.getLanguageName(cached.guess) || cached.guess;
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
