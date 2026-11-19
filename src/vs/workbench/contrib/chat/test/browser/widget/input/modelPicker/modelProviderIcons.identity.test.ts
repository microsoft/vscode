/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, LanguageModelProviderIcon } from '../../../../common/languageModels.js';
import { getModelIdentityIcon } from '../../../../browser/widget/input/modelPicker/modelProviderIcons.js';

function model(partial: Partial<ILanguageModelChatMetadataAndIdentifier['metadata']> & { id: string; name: string; vendor: string }): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${partial.vendor}/${partial.id}`,
		metadata: {
			extension: new ExtensionIdentifier('test.ext'),
			family: partial.family ?? 'test',
			version: '1',
			maxInputTokens: 1000,
			maxOutputTokens: 1000,
			isDefaultForLocation: {},
			isBYOK: partial.isBYOK ?? true,
			...partial,
		},
	};
}

suite('getModelIdentityIcon', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function serviceWithVendorIcon(vendor: string, icon: LanguageModelProviderIcon | undefined): ILanguageModelsService {
		return {
			getVendors: () => [{ vendor, displayName: vendor, icon, isDefault: false }],
		} as unknown as ILanguageModelsService;
	}

	test('uses contributed provider image icon for BYOK models instead of sparkle', () => {
		const light = URI.file('/ext/light.svg');
		const dark = URI.file('/ext/dark.svg');
		const lm = serviceWithVendorIcon('xiaomi-mimo', { light, dark });
		const icon = getModelIdentityIcon(model({ id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash', vendor: 'xiaomi-mimo', isBYOK: true }), lm);
		assert.deepStrictEqual(icon, { light, dark });
	});

	test('uses contributed provider ThemeIcon for BYOK models', () => {
		const brand = new ThemeIcon('xiaomi-mimo');
		const lm = serviceWithVendorIcon('xiaomi-mimo', brand);
		const icon = getModelIdentityIcon(model({ id: 'mimo-v2.6-flash', name: 'MiMo V2.6 Flash', vendor: 'xiaomi-mimo', isBYOK: true }), lm);
		assert.strictEqual(ThemeIcon.isThemeIcon(icon) && icon.id, 'xiaomi-mimo');
	});

	test('does not replace a matched first-party brand with the vendor tab icon', () => {
		const lm = serviceWithVendorIcon('copilot', new ThemeIcon('chat-model-provider-copilot'));
		const icon = getModelIdentityIcon(model({
			id: 'claude-sonnet',
			name: 'Claude Sonnet',
			vendor: 'copilot',
			family: 'claude',
			isBYOK: false,
		}), lm);
		assert.ok(ThemeIcon.isThemeIcon(icon));
		assert.strictEqual((icon as ThemeIcon).id, 'chat-model-provider-claude');
	});

	test('statusIcon wins over provider icon', () => {
		const lm = serviceWithVendorIcon('xiaomi-mimo', { light: URI.file('/l.svg'), dark: URI.file('/d.svg') });
		const icon = getModelIdentityIcon(model({
			id: 'mimo-v2.6-flash',
			name: 'MiMo V2.6 Flash',
			vendor: 'xiaomi-mimo',
			isBYOK: true,
			statusIcon: new ThemeIcon('warning'),
		}), lm);
		assert.ok(ThemeIcon.isThemeIcon(icon));
		assert.strictEqual((icon as ThemeIcon).id, 'warning');
	});
});
