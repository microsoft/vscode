/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getCodeEditor, ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider } from 'vs/editor/common/languages';
import * as nls from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IQuickInputService, IQuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { formatDocumentRangesWithProvider, formatDocumentWithProvider, getRealAndSyntheticDocumentFormattersOrdered, FormattingConflicts, FormattingMode, FormattingKind } from 'vs/editor/contrib/format/browser/format';
import { Range } from 'vs/editor/common/core/range';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IExtensionService, toExtension } from 'vs/workbench/services/extensions/common/extensions';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextModel } from 'vs/editor/common/model';
import { INotificationService, NotificationPriority, Severity } from 'vs/platform/notification/common/notification';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { generateUuid } from 'vs/base/common/uuid';

type FormattingEditProvider = DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider;

export class DefaultFormatter extends Disposable implements IWorkbenchContribution {

	static readonly configName = 'editor.defaultFormatter';

	static extensionIds: (string | null)[] = [];
	static extensionItemLabels: string[] = [];
	static extensionDescriptions: string[] = [];

	private readonly _languageStatusStore = this._store.add(new DisposableStore());

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageFeaturesService private readonly _languageFeaturesService: ILanguageFeaturesService,
		@ILanguageStatusService private readonly _languageStatusService: ILanguageStatusService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		super();
		this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
		this._store.add(FormattingConflicts.setFormatterSelector((formatter, document, mode, kind) => this._selectFormatter(formatter, document, mode, kind)));
		this._store.add(_editorService.onDidActiveEditorChange(this._updateStatus, this));
		this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateStatus, this));
		this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateStatus, this));
		this._store.add(_configService.onDidChangeConfiguration(e => e.affectsConfiguration(DefaultFormatter.configName) && this._updateStatus()));
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

		DefaultFormatter.extensionIds.length = 0;
		DefaultFormatter.extensionItemLabels.length = 0;
		DefaultFormatter.extensionDescriptions.length = 0;

		DefaultFormatter.extensionIds.push(null);
		DefaultFormatter.extensionItemLabels.push(nls.localize('null', 'None'));
		DefaultFormatter.extensionDescriptions.push(nls.localize('nullFormatterDescription', "None"));

		for (const extension of extensions) {
			if (extension.main || extension.browser) {
				DefaultFormatter.extensionIds.push(extension.identifier.value);
				DefaultFormatter.extensionItemLabels.push(extension.displayName ?? '');
				DefaultFormatter.extensionDescriptions.push(extension.description ?? '');
			}
		}
	}

	static _maybeQuotes(s: string): string {
		return s.match(/\s/) ? `'${s}'` : s;
	}

	private async _analyzeFormatter<T extends FormattingEditProvider>(kind: FormattingKind, formatter: T[], document: ITextModel): Promise<T | string> {
		const defaultFormatterId = this._configService.getValue<string>(DefaultFormatter.configName, {
			resource: document.uri,
			overrideIdentifier: document.getLanguageId()
		});

		if (defaultFormatterId) {
			// good -> formatter configured
			const defaultFormatter = formatter.find(formatter => ExtensionIdentifier.equals(formatter.extensionId, defaultFormatterId));
			if (defaultFormatter) {
				// formatter available
				return defaultFormatter;
			}

			// bad -> formatter gone
			const extension = await this._extensionService.getExtension(defaultFormatterId);
			if (extension && this._extensionEnablementService.isEnabled(toExtension(extension))) {
				// formatter does not target this file
				const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
				const detail = kind === FormattingKind.File
					? nls.localize('miss.1', "Extension '{0}' is configured as formatter but it cannot format '{1}'-files", extension.displayName || extension.name, langName)
					: nls.localize('miss.2', "Extension '{0}' is configured as formatter but it can only format '{1}'-files as a whole, not selections or parts of it.", extension.displayName || extension.name, langName);
				return detail;
			}

		} else if (formatter.length === 1) {
			// ok -> nothing configured but only one formatter available
			return formatter[0];
		}

		const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
		const message = !defaultFormatterId
			? nls.localize('config.needed', "There are multiple formatters for '{0}' files. One of them should be configured as default formatter.", DefaultFormatter._maybeQuotes(langName))
			: nls.localize('config.bad', "Extension '{0}' is configured as formatter but not available. Select a different default formatter to continue.", defaultFormatterId);

		return message;
	}

	private async _selectFormatter<T extends FormattingEditProvider>(formatter: T[], document: ITextModel, mode: FormattingMode, kind: FormattingKind): Promise<T | undefined> {
		const formatterOrMessage = await this._analyzeFormatter(kind, formatter, document);
		if (typeof formatterOrMessage !== 'string') {
			return formatterOrMessage;
		}

		if (mode !== FormattingMode.Silent) {
			// running from a user action -> show modal dialog so that users configure
			// a default formatter
			const { confirmed } = await this._dialogService.confirm({
				message: nls.localize('miss', "Configure Default Formatter"),
				detail: formatterOrMessage,
				primaryButton: nls.localize({ key: 'do.config', comment: ['&& denotes a mnemonic'] }, "&&Configure...")
			});
			if (confirmed) {
				return this._pickAndPersistDefaultFormatter(formatter, document);
			}
		} else {
			// no user action -> show a silent notification and proceed
			this._notificationService.prompt(
				Severity.Info,
				formatterOrMessage,
				[{ label: nls.localize('do.config.notification', "Configure..."), run: () => this._pickAndPersistDefaultFormatter(formatter, document) }],
				{ priority: NotificationPriority.SILENT }
			);
		}
		return undefined;
	}

	private async _pickAndPersistDefaultFormatter<T extends FormattingEditProvider>(formatter: T[], document: ITextModel): Promise<T | undefined> {
		const picks = formatter.map((formatter, index): IIndexedPick => {
			return {
				index,
				label: formatter.displayName || (formatter.extensionId ? formatter.extensionId.value : '?'),
				description: formatter.extensionId && formatter.extensionId.value
			};
		});
		const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
		const pick = await this._quickInputService.pick(picks, { placeHolder: nls.localize('select', "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
		if (!pick || !formatter[pick.index].extensionId) {
			return undefined;
		}
		this._configService.updateValue(DefaultFormatter.configName, formatter[pick.index].extensionId!.value, {
			resource: document.uri,
			overrideIdentifier: document.getLanguageId()
		});
		return formatter[pick.index];
	}

	// --- status item

	private _updateStatus() {
		this._languageStatusStore.clear();

		const editor = getCodeEditor(this._editorService.activeTextEditorControl);
		if (!editor || !editor.hasModel()) {
			return;
		}


		const document = editor.getModel();
		const formatter = getRealAndSyntheticDocumentFormattersOrdered(this._languageFeaturesService.documentFormattingEditProvider, this._languageFeaturesService.documentRangeFormattingEditProvider, document);

		if (formatter.length === 0) {
			return;
		}

		const cts = new CancellationTokenSource();
		this._languageStatusStore.add(toDisposable(() => cts.dispose(true)));

		this._analyzeFormatter(FormattingKind.File, formatter, document).then(result => {
			if (cts.token.isCancellationRequested) {
				return;
			}
			if (typeof result !== 'string') {
				return;
			}
			const command = { id: `formatter/configure/dfl/${generateUuid()}`, title: nls.localize('do.config.command', "Configure...") };
			this._languageStatusStore.add(CommandsRegistry.registerCommand(command.id, () => this._pickAndPersistDefaultFormatter(formatter, document)));
			this._languageStatusStore.add(this._languageStatusService.addStatus({
				id: 'formatter.conflict',
				name: nls.localize('summary', "Formatter Conflicts"),
				selector: { language: document.getLanguageId(), pattern: document.uri.fsPath },
				severity: Severity.Error,
				label: nls.localize('formatter', "Formatting"),
				detail: result,
				busy: false,
				source: '',
				command,
				accessibilityInfo: undefined
			}));
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DefaultFormatter,
	LifecyclePhase.Restored
);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		[DefaultFormatter.configName]: {
			description: nls.localize('formatter.default', "Defines a default formatter which takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
			type: ['string', 'null'],
			default: null,
			enum: DefaultFormatter.extensionIds,
			enumItemLabels: DefaultFormatter.extensionItemLabels,
			markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
		}
	}
});

interface IIndexedPick extends IQuickPickItem {
	index: number;
}

function logFormatterTelemetry<T extends { extensionId?: ExtensionIdentifier }>(telemetryService: ITelemetryService, mode: 'document' | 'range', options: T[], pick?: T) {
	type FormatterPicks = {
		mode: 'document' | 'range';
		extensions: string[];
		pick: string;
	};
	type FormatterPicksClassification = {
		owner: 'jrieken';
		comment: 'Information about resolving formatter conflicts';
		mode: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Formatting mode: whole document or a range/selection' };
		extensions: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The extension that got picked' };
		pick: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The possible extensions to pick' };
	};
	function extKey(obj: T): string {
		return obj.extensionId ? ExtensionIdentifier.toKey(obj.extensionId) : 'unknown';
	}
	telemetryService.publicLog2<FormatterPicks, FormatterPicksClassification>('formatterpick', {
		mode,
		extensions: options.map(extKey),
		pick: pick ? extKey(pick) : 'none'
	});
}

async function showFormatterPick(accessor: ServicesAccessor, model: ITextModel, formatters: FormattingEditProvider[]): Promise<number | undefined> {
	const quickPickService = accessor.get(IQuickInputService);
	const configService = accessor.get(IConfigurationService);
	const languageService = accessor.get(ILanguageService);

	const overrides = { resource: model.uri, overrideIdentifier: model.getLanguageId() };
	const defaultFormatter = configService.getValue<string>(DefaultFormatter.configName, overrides);

	let defaultFormatterPick: IIndexedPick | undefined;

	const picks = formatters.map((provider, index) => {
		const isDefault = ExtensionIdentifier.equals(provider.extensionId, defaultFormatter);
		const pick: IIndexedPick = {
			index,
			label: provider.displayName || '',
			description: isDefault ? nls.localize('def', "(default)") : undefined,
		};

		if (isDefault) {
			// autofocus default pick
			defaultFormatterPick = pick;
		}

		return pick;
	});

	const configurePick: IQuickPickItem = {
		label: nls.localize('config', "Configure Default Formatter...")
	};

	const pick = await quickPickService.pick([...picks, { type: 'separator' }, configurePick],
		{
			placeHolder: nls.localize('format.placeHolder', "Select a formatter"),
			activeItem: defaultFormatterPick
		}
	);
	if (!pick) {
		// dismissed
		return undefined;

	} else if (pick === configurePick) {
		// config default
		const langName = languageService.getLanguageName(model.getLanguageId()) || model.getLanguageId();
		const pick = await quickPickService.pick(picks, { placeHolder: nls.localize('select', "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
		if (pick && formatters[pick.index].extensionId) {
			configService.updateValue(DefaultFormatter.configName, formatters[pick.index].extensionId!.value, overrides);
		}
		return undefined;

	} else {
		// picked one
		return (<IIndexedPick>pick).index;
	}

}

registerEditorAction(class FormatDocumentMultipleAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatDocument.multiple',
			label: nls.localize('formatDocument.label.multiple', "Format Document With..."),
			alias: 'Format Document...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasMultipleDocumentFormattingProvider),
			contextMenuOpts: {
				group: '1_modification',
				order: 1.3
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor, args: any): Promise<void> {
		if (!editor.hasModel()) {
			return;
		}
		const instaService = accessor.get(IInstantiationService);
		const telemetryService = accessor.get(ITelemetryService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const model = editor.getModel();
		const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
		const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
		if (typeof pick === 'number') {
			await instaService.invokeFunction(formatDocumentWithProvider, provider[pick], editor, FormattingMode.Explicit, CancellationToken.None);
		}
		logFormatterTelemetry(telemetryService, 'document', provider, typeof pick === 'number' && provider[pick] || undefined);
	}
});

registerEditorAction(class FormatSelectionMultipleAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatSelection.multiple',
			label: nls.localize('formatSelection.label.multiple', "Format Selection With..."),
			alias: 'Format Code...',
			precondition: ContextKeyExpr.and(ContextKeyExpr.and(EditorContextKeys.writable), EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider),
			contextMenuOpts: {
				when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection),
				group: '1_modification',
				order: 1.31
			}
		});
	}

	async run(accessor: ServicesAccessor, editor: ICodeEditor): Promise<void> {
		if (!editor.hasModel()) {
			return;
		}
		const instaService = accessor.get(IInstantiationService);
		const languageFeaturesService = accessor.get(ILanguageFeaturesService);
		const telemetryService = accessor.get(ITelemetryService);

		const model = editor.getModel();
		let range: Range = editor.getSelection();
		if (range.isEmpty()) {
			range = new Range(range.startLineNumber, 1, range.startLineNumber, model.getLineMaxColumn(range.startLineNumber));
		}

		const provider = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
		const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
		if (typeof pick === 'number') {
			await instaService.invokeFunction(formatDocumentRangesWithProvider, provider[pick], editor, range, CancellationToken.None, true);
		}

		logFormatterTelemetry(telemetryService, 'range', provider, typeof pick === 'number' && provider[pick] || undefined);
	}
});
