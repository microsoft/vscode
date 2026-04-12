/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DefaultFormatter_1;
import { getCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction, registerEditorAction } from '../../../../editor/browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import * as nls from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { formatDocumentRangesWithProvider, formatDocumentWithProvider, getRealAndSyntheticDocumentFormattersOrdered, FormattingConflicts } from '../../../../editor/contrib/format/browser/format.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IExtensionService, toExtension } from '../../../services/extensions/common/extensions.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { ILanguageStatusService } from '../../../services/languageStatus/common/languageStatusService.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { generateUuid } from '../../../../base/common/uuid.js';
let DefaultFormatter = class DefaultFormatter extends Disposable {
    static { DefaultFormatter_1 = this; }
    static { this.configName = 'editor.defaultFormatter'; }
    static { this.extensionIds = []; }
    static { this.extensionItemLabels = []; }
    static { this.extensionDescriptions = []; }
    constructor(_extensionService, _extensionEnablementService, _configService, _notificationService, _dialogService, _quickInputService, _languageService, _languageFeaturesService, _languageStatusService, _editorService) {
        super();
        this._extensionService = _extensionService;
        this._extensionEnablementService = _extensionEnablementService;
        this._configService = _configService;
        this._notificationService = _notificationService;
        this._dialogService = _dialogService;
        this._quickInputService = _quickInputService;
        this._languageService = _languageService;
        this._languageFeaturesService = _languageFeaturesService;
        this._languageStatusService = _languageStatusService;
        this._editorService = _editorService;
        this._languageStatusStore = this._store.add(new DisposableStore());
        this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
        this._store.add(FormattingConflicts.setFormatterSelector((formatter, document, mode, kind) => this._selectFormatter(formatter, document, mode, kind)));
        this._store.add(_editorService.onDidActiveEditorChange(this._updateStatus, this));
        this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateStatus, this));
        this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateStatus, this));
        this._store.add(_languageFeaturesService.documentFormattingEditProvider.onDidChange(this._updateConfigValues, this));
        this._store.add(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(this._updateConfigValues, this));
        this._store.add(_configService.onDidChangeConfiguration(e => e.affectsConfiguration(DefaultFormatter_1.configName) && this._updateStatus()));
        this._updateConfigValues();
    }
    async _updateConfigValues() {
        await this._extensionService.whenInstalledExtensionsRegistered();
        let extensions = [...this._extensionService.extensions];
        // Get all formatter providers to identify which extensions actually contribute formatters
        const documentFormatters = this._languageFeaturesService.documentFormattingEditProvider.allNoModel();
        const rangeFormatters = this._languageFeaturesService.documentRangeFormattingEditProvider.allNoModel();
        const formatterExtensionIds = new Set();
        for (const formatter of documentFormatters) {
            if (formatter.extensionId) {
                formatterExtensionIds.add(ExtensionIdentifier.toKey(formatter.extensionId));
            }
        }
        for (const formatter of rangeFormatters) {
            if (formatter.extensionId) {
                formatterExtensionIds.add(ExtensionIdentifier.toKey(formatter.extensionId));
            }
        }
        extensions = extensions.sort((a, b) => {
            // Ultimate boost: extensions that actually contribute formatters
            const contributesFormatterA = formatterExtensionIds.has(ExtensionIdentifier.toKey(a.identifier));
            const contributesFormatterB = formatterExtensionIds.has(ExtensionIdentifier.toKey(b.identifier));
            if (contributesFormatterA && !contributesFormatterB) {
                return -1;
            }
            else if (!contributesFormatterA && contributesFormatterB) {
                return 1;
            }
            // Secondary boost: category-based sorting
            const boostA = a.categories?.find(cat => cat === 'Formatters' || cat === 'Programming Languages');
            const boostB = b.categories?.find(cat => cat === 'Formatters' || cat === 'Programming Languages');
            if (boostA && !boostB) {
                return -1;
            }
            else if (!boostA && boostB) {
                return 1;
            }
            else {
                return a.name.localeCompare(b.name);
            }
        });
        DefaultFormatter_1.extensionIds.length = 0;
        DefaultFormatter_1.extensionItemLabels.length = 0;
        DefaultFormatter_1.extensionDescriptions.length = 0;
        DefaultFormatter_1.extensionIds.push(null);
        DefaultFormatter_1.extensionItemLabels.push(nls.localize('null', 'None'));
        DefaultFormatter_1.extensionDescriptions.push(nls.localize('nullFormatterDescription', "None"));
        for (const extension of extensions) {
            if (extension.main || extension.browser) {
                DefaultFormatter_1.extensionIds.push(extension.identifier.value);
                DefaultFormatter_1.extensionItemLabels.push(extension.displayName ?? '');
                DefaultFormatter_1.extensionDescriptions.push(extension.description ?? '');
            }
        }
    }
    static _maybeQuotes(s) {
        return s.match(/\s/) ? `'${s}'` : s;
    }
    async _analyzeFormatter(kind, formatter, document) {
        const defaultFormatterId = this._configService.getValue(DefaultFormatter_1.configName, {
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
                const detail = kind === 1 /* FormattingKind.File */
                    ? nls.localize('miss.1', "Extension '{0}' is configured as formatter but it cannot format '{1}'-files", extension.displayName || extension.name, langName)
                    : nls.localize('miss.2', "Extension '{0}' is configured as formatter but it can only format '{1}'-files as a whole, not selections or parts of it.", extension.displayName || extension.name, langName);
                return detail;
            }
        }
        else if (formatter.length === 1) {
            // ok -> nothing configured but only one formatter available
            return formatter[0];
        }
        const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
        const message = !defaultFormatterId
            ? nls.localize('config.needed', "There are multiple formatters for '{0}' files. One of them should be configured as default formatter.", DefaultFormatter_1._maybeQuotes(langName))
            : nls.localize('config.bad', "Extension '{0}' is configured as formatter but not available. Select a different default formatter to continue.", defaultFormatterId);
        return message;
    }
    async _selectFormatter(formatter, document, mode, kind) {
        const formatterOrMessage = await this._analyzeFormatter(kind, formatter, document);
        if (typeof formatterOrMessage !== 'string') {
            return formatterOrMessage;
        }
        if (mode !== 2 /* FormattingMode.Silent */) {
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
        }
        else {
            // no user action -> show a silent notification and proceed
            this._notificationService.prompt(Severity.Info, formatterOrMessage, [{ label: nls.localize('do.config.notification', "Configure..."), run: () => this._pickAndPersistDefaultFormatter(formatter, document) }], { priority: NotificationPriority.SILENT });
        }
        return undefined;
    }
    async _pickAndPersistDefaultFormatter(formatter, document) {
        const picks = formatter.map((formatter, index) => {
            return {
                index,
                label: formatter.displayName || (formatter.extensionId ? formatter.extensionId.value : '?'),
                description: formatter.extensionId && formatter.extensionId.value
            };
        });
        const langName = this._languageService.getLanguageName(document.getLanguageId()) || document.getLanguageId();
        const pick = await this._quickInputService.pick(picks, { placeHolder: nls.localize('select', "Select a default formatter for '{0}' files", DefaultFormatter_1._maybeQuotes(langName)) });
        if (!pick || !formatter[pick.index].extensionId) {
            return undefined;
        }
        this._configService.updateValue(DefaultFormatter_1.configName, formatter[pick.index].extensionId.value, {
            resource: document.uri,
            overrideIdentifier: document.getLanguageId()
        });
        return formatter[pick.index];
    }
    // --- status item
    _updateStatus() {
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
        this._analyzeFormatter(1 /* FormattingKind.File */, formatter, document).then(result => {
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
};
DefaultFormatter = DefaultFormatter_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IWorkbenchExtensionEnablementService),
    __param(2, IConfigurationService),
    __param(3, INotificationService),
    __param(4, IDialogService),
    __param(5, IQuickInputService),
    __param(6, ILanguageService),
    __param(7, ILanguageFeaturesService),
    __param(8, ILanguageStatusService),
    __param(9, IEditorService)
], DefaultFormatter);
export { DefaultFormatter };
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(DefaultFormatter, 3 /* LifecyclePhase.Restored */);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
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
async function showFormatterPick(accessor, model, formatters) {
    const quickPickService = accessor.get(IQuickInputService);
    const configService = accessor.get(IConfigurationService);
    const languageService = accessor.get(ILanguageService);
    const overrides = { resource: model.uri, overrideIdentifier: model.getLanguageId() };
    const defaultFormatter = configService.getValue(DefaultFormatter.configName, overrides);
    let defaultFormatterPick;
    const picks = formatters.map((provider, index) => {
        const isDefault = ExtensionIdentifier.equals(provider.extensionId, defaultFormatter);
        const pick = {
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
    const configurePick = {
        label: nls.localize('config', "Configure Default Formatter...")
    };
    const pick = await quickPickService.pick([...picks, { type: 'separator' }, configurePick], {
        placeHolder: nls.localize('format.placeHolder', "Select a formatter"),
        activeItem: defaultFormatterPick
    });
    if (!pick) {
        // dismissed
        return undefined;
    }
    else if (pick === configurePick) {
        // config default
        const langName = languageService.getLanguageName(model.getLanguageId()) || model.getLanguageId();
        const pick = await quickPickService.pick(picks, { placeHolder: nls.localize('select', "Select a default formatter for '{0}' files", DefaultFormatter._maybeQuotes(langName)) });
        if (pick && formatters[pick.index].extensionId) {
            configService.updateValue(DefaultFormatter.configName, formatters[pick.index].extensionId.value, overrides);
        }
        return undefined;
    }
    else {
        // picked one
        return pick.index;
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
    async run(accessor, editor, args) {
        if (!editor.hasModel()) {
            return;
        }
        const instaService = accessor.get(IInstantiationService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const model = editor.getModel();
        const provider = getRealAndSyntheticDocumentFormattersOrdered(languageFeaturesService.documentFormattingEditProvider, languageFeaturesService.documentRangeFormattingEditProvider, model);
        const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
        if (typeof pick === 'number') {
            await instaService.invokeFunction(formatDocumentWithProvider, provider[pick], editor, 1 /* FormattingMode.Explicit */, CancellationToken.None);
        }
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
    async run(accessor, editor) {
        if (!editor.hasModel()) {
            return;
        }
        const instaService = accessor.get(IInstantiationService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const model = editor.getModel();
        let range = editor.getSelection();
        if (range.isEmpty()) {
            range = new Range(range.startLineNumber, 1, range.startLineNumber, model.getLineMaxColumn(range.startLineNumber));
        }
        const provider = languageFeaturesService.documentRangeFormattingEditProvider.ordered(model);
        const pick = await instaService.invokeFunction(showFormatterPick, model, provider);
        if (typeof pick === 'number') {
            await instaService.invokeFunction(formatDocumentRangesWithProvider, provider[pick], editor, range, CancellationToken.None, true);
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9ybWF0QWN0aW9uc011bHRpcGxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0QWN0aW9uc011bHRpcGxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsYUFBYSxFQUFlLE1BQU0sNkNBQTZDLENBQUM7QUFDekYsT0FBTyxFQUFFLFlBQVksRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRW5GLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBa0IsTUFBTSxzREFBc0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRyxPQUFPLEVBQUUscUJBQXFCLEVBQW9CLE1BQU0sNERBQTRELENBQUM7QUFDckgsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLDBCQUEwQixFQUFFLDRDQUE0QyxFQUFFLG1CQUFtQixFQUFrQyxNQUFNLHFEQUFxRCxDQUFDO0FBQ3RPLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUEwQixVQUFVLElBQUksdUJBQXVCLEVBQUUsTUFBTSxvRUFBb0UsQ0FBQztBQUNuSixPQUFPLEVBQUUsVUFBVSxJQUFJLG1CQUFtQixF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