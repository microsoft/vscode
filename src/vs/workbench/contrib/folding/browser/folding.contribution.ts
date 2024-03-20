/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { FoldingController } from 'vs/editor/contrib/folding/browser/folding';
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

	private _selectFoldingRangeProvider(providers: FoldingRangeProvider[], document: ITextModel): FoldingRangeProvider[] | undefined {
		const value = this._configurationService.getValue<string>(DefaultFoldingRangeProvider.configName, { overrideIdentifier: document.getLanguageId() });
		if (value) {
			return providers.filter(p => p.id === value);
		}
		return undefined;
	}
}

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	...editorConfigurationBaseNode,
	properties: {
		[DefaultFoldingRangeProvider.configName]: {
			description: nls.localize('formatter.default', "Defines a default folding range provider that takes precedence over all other folding range providers. Must be the identifier of an extension contributing a folding range provider."),
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

