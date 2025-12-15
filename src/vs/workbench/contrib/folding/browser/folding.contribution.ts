/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { FoldingController } from '../../../../editor/contrib/folding/browser/folding.js';
import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry, IWorkbenchContribution } from '../../../common/contributions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { editorConfigurationBaseNode } from '../../../../editor/common/config/editorConfigurationSchema.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { FoldingRangeProvider } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';

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

