/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import type { MultiDiffEditorVariant } from '../../../../editor/common/multiDiffEditor.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

export const multiDiffEditorExperimentalVariantSetting = 'multiDiffEditor.experimental.variant';
export const defaultMultiDiffEditorExperimentalVariant = 'noCards';

export type MultiDiffEditorExperimentalVariant = 'cards' | 'noCards';

export function getWorkbenchMultiDiffEditorVariant(variant: MultiDiffEditorExperimentalVariant): MultiDiffEditorVariant {
	return variant;
}

export function observableWorkbenchMultiDiffEditorVariant(
	owner: object,
	configurationService: IConfigurationService,
): IObservable<MultiDiffEditorVariant> {
	return observableConfigValue<MultiDiffEditorExperimentalVariant>(
		multiDiffEditorExperimentalVariantSetting,
		defaultMultiDiffEditorExperimentalVariant,
		configurationService,
	).map(owner, getWorkbenchMultiDiffEditorVariant);
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'multiDiffEditor',
	title: localize('multiDiffEditorConfigurationTitle', "Multi Diff Editor"),
	type: 'object',
	properties: {
		[multiDiffEditorExperimentalVariantSetting]: {
			type: 'string',
			enum: ['cards', 'noCards'],
			enumDescriptions: [
				localize('multiDiffEditor.experimental.variant.cards', "Use the compact card-based variant."),
				localize('multiDiffEditor.experimental.variant.noCards', "Use the compact variant without cards."),
			],
			default: defaultMultiDiffEditorExperimentalVariant,
			description: localize('multiDiffEditor.experimental.variant', "Controls the experimental variant of the multi diff editor."),
			scope: ConfigurationScope.WINDOW,
			tags: ['experimental'],
			experiment: { mode: 'auto' },
		},
	},
});
