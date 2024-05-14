/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
// import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';


// type FormattingEditProvider = DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider;

// interface IIndexedPick extends IQuickPickItem {
// 	index: number;
// }

export class NotebookDefaultFormatter extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebook.defaultFormatter';
	static readonly configName = 'notebook.defaultFormatter';

	static extensionIds: (string | null)[] = [];
	static extensionItemLabels: string[] = [];
	static extensionDescriptions: string[] = [];

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		// @IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		// @IConfigurationService private readonly _configService: IConfigurationService,
		// @INotificationService private readonly _notificationService: INotificationService,
		// @IDialogService private readonly _dialogService: IDialogService,
		// @IQuickInputService private readonly _quickInputService: IQuickInputService,
		// @ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
		this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
		// this._store.add(FormattingConflicts.setFormatterSelector((formatter, document, mode, kind) => this._selectFormatter(formatter, document, mode, kind)));
		// this._store.add(_configService.onDidChangeConfiguration(e => e.affectsConfiguration(NotebookDefaultFormatter.configName)));
		this._updateConfigValues();
	}

	private async _updateConfigValues(): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();
		let extensions = [...this._extensionService.extensions];

		extensions = extensions.sort((a, b) => {
			const boostA = a.categories?.find(cat => cat === 'Formatters' || cat === 'Programming Languages');
			const boostB = b.categories?.find(cat => cat === 'Formatters' || cat === 'Programming Languages');

			if (boostA && !boostB) {
				return -1;
			} else if (!boostA && boostB) {
				return 1;
			} else {
				return a.name.localeCompare(b.name);
			}
		});

		NotebookDefaultFormatter.extensionIds.length = 0;
		NotebookDefaultFormatter.extensionItemLabels.length = 0;
		NotebookDefaultFormatter.extensionDescriptions.length = 0;

		NotebookDefaultFormatter.extensionIds.push(null);
		NotebookDefaultFormatter.extensionItemLabels.push(nls.localize('null', 'None'));
		NotebookDefaultFormatter.extensionDescriptions.push(nls.localize('nullFormatterDescription', "None"));

		for (const extension of extensions) {
			if (extension.main || extension.browser) {
				NotebookDefaultFormatter.extensionIds.push(extension.identifier.value);
				NotebookDefaultFormatter.extensionItemLabels.push(extension.displayName ?? '');
				NotebookDefaultFormatter.extensionDescriptions.push(extension.description ?? '');
			}
		}
	}

	static _maybeQuotes(s: string): string {
		return s.match(/\s/) ? `'${s}'` : s;
	}

	// TODO@Yoyokrazy -- maybe unnecessary
	// private async _analyzeFormatter<T extends FormattingEditProvider>(kind: FormattingKind, formatter: T[], document: ITextModel): Promise<T | string> {
	// 	const defaultFormatterId = this._configService.getValue<string>(NotebookDefaultFormatter.configName, {
	// 		resource: document.uri,
	// 		overrideIdentifier: document.getLanguageId()
	// 	});

	// 	if (defaultFormatterId) {
	// 		// good -> formatter configured
	// 		const defaultFormatter = formatter.find(formatter => ExtensionIdentifier.equals(formatter.extensionId, defaultFormatterId));
	// 		if (defaultFormatter) {
	// 			// formatter available
	// 			return defaultFormatter;
	// 		}

	// 		// bad -> formatter gone
	// 		const extension = await this._extensionService.getExtension(defaultFormatterId);
	// 		if (extension && this._extensionEnablementService.isEnabled(toExtension(extension))) {
	// 			// formatter does not target this file
	// 			const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
	// 			const detail = kind === FormattingKind.File
	// 				? nls.localize('miss.1', "Extension '{0}' is configured as formatter but it cannot format '{1}'-files", extension.displayName || extension.name, langName)
	// 				: nls.localize('miss.2', "Extension '{0}' is configured as formatter but it can only format '{1}'-files as a whole, not selections or parts of it.", extension.displayName || extension.name, langName);
	// 			return detail;
	// 		}

	// 	} else if (formatter.length === 1) {
	// 		// ok -> nothing configured but only one formatter available
	// 		return formatter[0];
	// 	}

	// 	const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
	// 	const message = !defaultFormatterId
	// 		? nls.localize('config.needed', "There are multiple formatters for '{0}' files. One of them should be configured as default formatter.", NotebookDefaultFormatter._maybeQuotes(langName))
	// 		: nls.localize('config.bad', "Extension '{0}' is configured as formatter but not available. Select a different default formatter to continue.", defaultFormatterId);

	// 	return message;
	// }

	// TODO@Yoyokrazy -- maybe unnecessary
	// private async _selectFormatter<T extends FormattingEditProvider>(formatter: T[], document: ITextModel, mode: FormattingMode, kind: FormattingKind): Promise<T | undefined> {
	// 	const formatterOrMessage = await this._analyzeFormatter(kind, formatter, document);
	// 	if (typeof formatterOrMessage !== 'string') {
	// 		return formatterOrMessage;
	// 	}

	// 	if (mode !== FormattingMode.Silent) {
	// 		// running from a user action -> show modal dialog so that users configure
	// 		// a default formatter
	// 		const { confirmed } = await this._dialogService.confirm({
	// 			message: nls.localize('miss', "Configure Default Formatter"),
	// 			detail: formatterOrMessage,
	// 			primaryButton: nls.localize({ key: 'do.config', comment: ['&& denotes a mnemonic'] }, "&&Configure...")
	// 		});
	// 		if (confirmed) {
	// 			return this._pickAndPersistDefaultFormatter(formatter, document);
	// 		}
	// 	} else {
	// 		// no user action -> show a silent notification and proceed
	// 		this._notificationService.prompt(
	// 			Severity.Info,
	// 			formatterOrMessage,
	// 			[{ label: nls.localize('do.config.notification', "Configure..."), run: () => this._pickAndPersistDefaultFormatter(formatter, document) }],
	// 			{ priority: NotificationPriority.SILENT }
	// 		);
	// 	}
	// 	return undefined;
	// }

	// TODO@Yoyokrazy -- maybe unnecessary
	// private async _pickAndPersistDefaultFormatter<T extends FormattingEditProvider>(formatter: T[], document: ITextModel): Promise<T | undefined> {
	// 	const picks = formatter.map((formatter, index): IIndexedPick => {
	// 		return {
	// 			index,
	// 			label: formatter.displayName || (formatter.extensionId ? formatter.extensionId.value : '?'),
	// 			description: formatter.extensionId && formatter.extensionId.value
	// 		};
	// 	});
	// 	const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
	// 	const pick = await this._quickInputService.pick(picks, { placeHolder: nls.localize('select', "Select a default formatter for '{0}' files", NotebookDefaultFormatter._maybeQuotes(langName)) });
	// 	if (!pick || !formatter[pick.index].extensionId) {
	// 		return undefined;
	// 	}
	// 	this._configService.updateValue(NotebookDefaultFormatter.configName, formatter[pick.index].extensionId!.value, {
	// 		resource: document.uri,
	// 		overrideIdentifier: document.getLanguageId()
	// 	});
	// 	return formatter[pick.index];
	// }

	// TODO@Yoyokrazy -- maybe unnecessary --- status item
	// --- status item

	// private _updateStatus() {
	// 	this._languageStatusStore.clear();

	// 	const editor = getCodeEditor(this._editorService.activeTextEditorControl);
	// 	if (!editor || !editor.hasModel()) {
	// 		return;
	// 	}


	// 	const document = editor.getModel();
	// 	const formatter = getRealAndSyntheticDocumentFormattersOrdered(this._languageFeaturesService.documentFormattingEditProvider, this._languageFeaturesService.documentRangeFormattingEditProvider, document);

	// 	if (formatter.length === 0) {
	// 		return;
	// 	}

	// 	const cts = new CancellationTokenSource();
	// 	this._languageStatusStore.add(toDisposable(() => cts.dispose(true)));

	// 	this._analyzeFormatter(FormattingKind.File, formatter, document).then(result => {
	// 		if (cts.token.isCancellationRequested) {
	// 			return;
	// 		}
	// 		if (typeof result !== 'string') {
	// 			return;
	// 		}
	// 		const command = { id: `formatter/configure/dfl/${generateUuid()}`, title: nls.localize('do.config.command', "Configure...") };
	// 		this._languageStatusStore.add(CommandsRegistry.registerCommand(command.id, () => this._pickAndPersistDefaultFormatter(formatter, document)));
	// 		this._languageStatusStore.add(this._languageStatusService.addStatus({
	// 			id: 'formatter.conflict',
	// 			name: nls.localize('summary', "Formatter Conflicts"),
	// 			selector: { language: document.getLanguageId(), pattern: document.uri.fsPath },
	// 			severity: Severity.Error,
	// 			label: nls.localize('formatter', "Formatting"),
	// 			detail: result,
	// 			busy: false,
	// 			source: '',
	// 			command,
	// 			accessibilityInfo: undefined
	// 		}));
	// 	});
	// }
}
