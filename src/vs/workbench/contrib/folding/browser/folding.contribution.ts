/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import { getCodeEditor } from 'vs/editor/browser/editorBrowser';
import { FoldingController, FoldingLimitInfo } from 'vs/editor/contrib/folding/browser/folding';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILanguageStatus, ILanguageStatusService } from 'vs/workbench/services/languageStatus/common/languageStatusService';
import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { editorConfigurationBaseNode } from 'vs/editor/common/config/editorConfigurationSchema';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { FoldingRangeProvider } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';

const openSettingsCommand = 'workbench.action.openSettings';
const configureSettingsLabel = nls.localize('status.button.configure', "Configure");

const foldingMaximumRegionsSettingsId = 'editor.foldingMaximumRegions';

export class FoldingLimitIndicatorContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@ILanguageStatusService private readonly languageStatusService: ILanguageStatusService
	) {
		super();

		let changeListener: IDisposable | undefined;
		let control: any;

		const onActiveEditorChanged = () => {
			const activeControl = editorService.activeTextEditorControl;
			if (activeControl === control) {
				return;
			}
			control = undefined;
			if (changeListener) {
				changeListener.dispose();
				changeListener = undefined;
			}
			const editor = getCodeEditor(activeControl);
			if (editor) {
				const controller = FoldingController.get(editor);
				if (controller) {
					const info = controller.foldingLimitInfo;
					this.updateLimitInfo(info);
					control = activeControl;
					changeListener = controller.onDidChangeFoldingLimit(info => {
						this.updateLimitInfo(info);
					});
				} else {
					this.updateLimitInfo(undefined);
				}
			} else {
				this.updateLimitInfo(undefined);
			}
		};

		this._register(this.editorService.onDidActiveEditorChange(onActiveEditorChanged));

		onActiveEditorChanged();
	}

	private _limitStatusItem: IDisposable | undefined;

	private updateLimitInfo(info: FoldingLimitInfo | undefined) {
		if (this._limitStatusItem) {
			this._limitStatusItem.dispose();
			this._limitStatusItem = undefined;
		}
		if (info && info.limited !== false) {
			const status: ILanguageStatus = {
				id: 'foldingLimitInfo',
				selector: '*',
				name: nls.localize('foldingRangesStatusItem.name', 'Folding Status'),
				severity: Severity.Warning,
				label: nls.localize('status.limitedFoldingRanges.short', 'Folding Ranges Limited'),
				detail: nls.localize('status.limitedFoldingRanges.details', 'only {0} folding ranges shown for performance reasons', info.limited),
				command: { id: openSettingsCommand, arguments: [foldingMaximumRegionsSettingsId], title: configureSettingsLabel },
				accessibilityInfo: undefined,
				source: nls.localize('foldingRangesStatusItem.source', 'Folding'),
				busy: false
			};
			this._limitStatusItem = this.languageStatusService.addStatus(status);
		}

	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	FoldingLimitIndicatorContribution,
	LifecyclePhase.Restored
);

class DefaultFoldingRangeProvider extends Disposable implements IWorkbenchContribution {

	static readonly configName = 'editor.defaultFoldingRangeProvider';

	static extensionIds: (string | null)[] = [];
	static extensionItemLabels: string[] = [];
	static extensionDescriptions: string[] = [];

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._store.add(this._extensionService.onDidChangeExtensions(this._updateConfigValues, this));
		this._store.add(FoldingController.setFoldingRangeProviderSelector(this._selectFoldingRangeProvider.bind(this)));

		this._updateConfigValues();
	}

	private async _updateConfigValues(): Promise<void> {
		await this._extensionService.whenInstalledExtensionsRegistered();

		DefaultFoldingRangeProvider.extensionIds.length = 0;
		DefaultFoldingRangeProvider.extensionItemLabels.length = 0;
		DefaultFoldingRangeProvider.extensionDescriptions.length = 0;

		DefaultFoldingRangeProvider.extensionIds.push(null);
		DefaultFoldingRangeProvider.extensionItemLabels.push(nls.localize('null', 'All'));
		DefaultFoldingRangeProvider.extensionDescriptions.push(nls.localize('nullFormatterDescription', "All active folding range providers"));

		const languageExtensions: IExtensionDescription[] = [];
		const otherExtensions: IExtensionDescription[] = [];

		for (const extension of this._extensionService.extensions) {
			if (extension.main || extension.browser) {
				if (extension.categories?.find(cat => cat === 'Programming Languages')) {
					languageExtensions.push(extension);
				} else {
					otherExtensions.push(extension);
				}
			}
		}

		const sorter = (a: IExtensionDescription, b: IExtensionDescription) => a.name.localeCompare(b.name);

		for (const extension of languageExtensions.sort(sorter)) {
			DefaultFoldingRangeProvider.extensionIds.push(extension.identifier.value);
			DefaultFoldingRangeProvider.extensionItemLabels.push(extension.displayName ?? '');
			DefaultFoldingRangeProvider.extensionDescriptions.push(extension.description ?? '');
		}
		for (const extension of otherExtensions.sort(sorter)) {
			DefaultFoldingRangeProvider.extensionIds.push(extension.identifier.value);
			DefaultFoldingRangeProvider.extensionItemLabels.push(extension.displayName ?? '');
			DefaultFoldingRangeProvider.extensionDescriptions.push(extension.description ?? '');
		}
	}

	private _selectFoldingRangeProvider(providers: FoldingRangeProvider[], document: ITextModel): FoldingRangeProvider[] {
		const value = this._configurationService.getValue<string>(DefaultFoldingRangeProvider.configName, { overrideIdentifier: document.getLanguageId() });
		if (value) {
			return providers.filter(p => p.id === value);
		}
		return providers;
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		[DefaultFoldingRangeProvider.configName]: {
			description: nls.localize('formatter.default', "Defines a default folding range provider which takes precedence over all other folding range provider. Must be the identifier of an extension contributing a folding range provider."),
			type: ['string', 'null'],
			default: null,
			enum: DefaultFoldingRangeProvider.extensionIds,
			enumItemLabels: DefaultFoldingRangeProvider.extensionItemLabels,
			markdownEnumDescriptions: DefaultFoldingRangeProvider.extensionDescriptions
		}
	}
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	DefaultFoldingRangeProvider,
	LifecyclePhase.Restored
);

