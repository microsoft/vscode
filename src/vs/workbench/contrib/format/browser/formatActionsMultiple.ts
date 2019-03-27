/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorAction, registerEditorAction, ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { DocumentRangeFormattingEditProviderRegistry, DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider } from 'vs/editor/common/modes';
import * as nls from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IQuickInputService, IQuickPickItem, IQuickInputButton } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { formatDocumentRangeWithProvider, formatDocumentWithProvider, getRealAndSyntheticDocumentFormattersOrdered, FormattingConflicts, FormattingMode } from 'vs/editor/contrib/format/format';
import { Range } from 'vs/editor/common/core/range';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITextModel } from 'vs/editor/common/model';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IModeService } from 'vs/editor/common/services/modeService';

class DefaultFormatter extends Disposable implements IWorkbenchContribution {

	static configName = 'editor.defaultFormatter';

	static extensionIds: string[] = [];
	static extensionDescriptions: string[] = [];

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IModeService private readonly _modeService: IModeService,
	) {
		super();
		this._register(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
		this._register(FormattingConflicts.setFormatterSelector((formatter, document, mode) => this._selectFormatter(formatter, document, mode)));
		this._updateConfigValues();
	}

	private async _updateConfigValues(): Promise<void> {
		const extensions = await this._extensionService.getExtensions();

		DefaultFormatter.extensionIds.length = 0;
		DefaultFormatter.extensionDescriptions.length = 0;
		for (const extension of extensions) {
			DefaultFormatter.extensionIds.push(extension.identifier.value);
			DefaultFormatter.extensionDescriptions.push(extension.description || '');
		}
	}

	private static _maybeQuotes(s: string): string {
		return s.match(/\s/) ? `'${s}'` : s;
	}

	private async _selectFormatter<T extends DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider>(formatter: T[], document: ITextModel, mode: FormattingMode): Promise<T | undefined> {

		const defaultFormatterId = this._configService.getValue<string>(DefaultFormatter.configName, {
			resource: document.uri,
			overrideIdentifier: document.getModeId()
		});

		if (defaultFormatterId) {
			// good -> formatter configured
			const [defaultFormatter] = formatter.filter(formatter => formatter.extensionId && ExtensionIdentifier.equals(formatter.extensionId, defaultFormatterId));
			if (defaultFormatter) {
				// good -> formatter configured and available
				return defaultFormatter;
			}
		}

		const langName = this._modeService.getLanguageName(document.getModeId()) || document.getModeId();
		const message = defaultFormatterId
			? nls.localize('config.bad', "The configured default formatter is not available. Select a different default formatter to continue.")
			: nls.localize('config.needed', "There are multiple formatters for {0}-files. Select a default formatter to continue.", DefaultFormatter._maybeQuotes(langName));

		return new Promise<T | undefined>((resolve, reject) => {
			this._notificationService.prompt(
				Severity.Info,
				message,
				[{ label: nls.localize('do.config', "Configure..."), run: () => this._pickAndPersistDefaultFormatter(formatter, document).then(resolve, reject) }],
				{ silent: mode === FormattingMode.Silent, onCancel: resolve }
			);

			if (mode === FormattingMode.Silent) {
				// don't wait when formatting happens without interaction
				// but pick some formatter...
				resolve(formatter[0]);
			}
		});
	}

	private async _pickAndPersistDefaultFormatter<T extends DocumentFormattingEditProvider | DocumentRangeFormattingEditProvider>(formatter: T[], document: ITextModel): Promise<T | undefined> {
		const picks = formatter.map((formatter, index) => {
			return <IIndexedPick>{
				index,
				label: formatter.displayName || formatter.extensionId || '?'
			};
		});
		const langName = this._modeService.getLanguageName(document.getModeId()) || document.getModeId();
		const pick = await this._quickInputService.pick(picks, { placeHolder: nls.localize('select', "Select a default formatter for {0}-files", DefaultFormatter._maybeQuotes(langName)) });
		if (!pick || !formatter[pick.index].extensionId) {
			return undefined;
		}
		this._configService.updateValue(DefaultFormatter.configName, formatter[pick.index].extensionId!.value, {
			resource: document.uri,
			overrideIdentifier: document.getModeId()
		});
		return formatter[pick.index];
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DefaultFormatter,
	LifecyclePhase.Restored
);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'editor',
	order: 5,
	type: 'object',
	overridable: true,
	properties: {
		[DefaultFormatter.configName]: {
			description: nls.localize('formatter.default', "Defines a default formatter takes precedence over all other formatter settings. Must be the identifier of an extension contributing a formatter."),
			type: 'string',
			enum: DefaultFormatter.extensionIds,
			markdownEnumDescriptions: DefaultFormatter.extensionDescriptions
		}
	}
});

interface IIndexedPick extends IQuickPickItem {
	index: number;
}

const openExtensionAction: IQuickInputButton = {
	tooltip: nls.localize('show.ext', "Show extension..."),
	iconClass: 'format-show-extension'
};

function logFormatterTelemetry<T extends { extensionId?: ExtensionIdentifier }>(telemetryService: ITelemetryService, mode: 'document' | 'range', options: T[], pick?: T) {

	function extKey(obj: T): string {
		return obj.extensionId ? ExtensionIdentifier.toKey(obj.extensionId) : 'unknown';
	}
	/*
	 * __GDPR__
		"formatterpick" : {
			"mode" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"extensions" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
			"pick" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
		}
	 */
	telemetryService.publicLog('formatterpick', {
		mode,
		extensions: options.map(extKey),
		pick: pick ? extKey(pick) : 'none'
	});
}

registerEditorAction(class FormatDocumentMultipleAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatDocument.multiple',
			label: nls.localize('formatDocument.label.multiple', "Format Document With..."),
			alias: 'Format Document...',
			precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasMultipleDocumentFormattingProvider),
			menuOpts: {
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
		const quickPickService = accessor.get(IQuickInputService);
		const telemetryService = accessor.get(ITelemetryService);
		const configService = accessor.get(IConfigurationService);

		const model = editor.getModel();
		const defaultFormatter = configService.getValue<string>(DefaultFormatter.configName, {
			resource: model.uri,
			overrideIdentifier: model.getModeId()
		});

		const provider = getRealAndSyntheticDocumentFormattersOrdered(model);
		const picks = provider.map((provider, index) => {
			return <IIndexedPick>{
				index,
				label: provider.displayName || '',
				description: ExtensionIdentifier.equals(provider.extensionId, defaultFormatter) ? nls.localize('def', "(default)") : undefined,
				buttons: [openExtensionAction]
			};
		});

		const pick = await quickPickService.pick(picks, {
			placeHolder: nls.localize('format.placeHolder', "Select a formatter")
		});
		if (pick) {
			await instaService.invokeFunction(formatDocumentWithProvider, provider[pick.index], editor, CancellationToken.None);
		}

		logFormatterTelemetry(telemetryService, 'document', provider, pick && provider[pick.index]);
	}
});

registerEditorAction(class FormatSelectionMultipleAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.formatSelection.multiple',
			label: nls.localize('formatSelection.label.multiple', "Format Selection With..."),
			alias: 'Format Code...',
			precondition: ContextKeyExpr.and(ContextKeyExpr.and(EditorContextKeys.writable), EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider),
			menuOpts: {
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
		const quickPickService = accessor.get(IQuickInputService);
		const telemetryService = accessor.get(ITelemetryService);
		const configService = accessor.get(IConfigurationService);

		const model = editor.getModel();
		const defaultFormatter = configService.getValue<string>(DefaultFormatter.configName, {
			resource: model.uri,
			overrideIdentifier: model.getModeId()
		});

		let range: Range = editor.getSelection();
		if (range.isEmpty()) {
			range = new Range(range.startLineNumber, 1, range.startLineNumber, model.getLineMaxColumn(range.startLineNumber));
		}

		const provider = DocumentRangeFormattingEditProviderRegistry.ordered(model);
		const picks = provider.map((provider, index) => {
			return <IIndexedPick>{
				index,
				label: provider.displayName || '',
				description: ExtensionIdentifier.equals(provider.extensionId, defaultFormatter) ? nls.localize('def', "(default)") : undefined,
				buttons: [openExtensionAction]
			};
		});

		const pick = await quickPickService.pick(picks, {
			placeHolder: nls.localize('format.placeHolder', "Select a formatter")
		});
		if (pick) {
			await instaService.invokeFunction(formatDocumentRangeWithProvider, provider[pick.index], editor, range, CancellationToken.None);
		}

		logFormatterTelemetry(telemetryService, 'range', provider, pick && provider[pick.index]);
	}
});
