/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderADMLString, renderProfileString, renderADMX, renderADML, renderProfileManifest } from '../../../node/writer/render.js';
import { NlsString, LanguageTranslations, Category, Policy, PolicyType } from '../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Render Functions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('renderADMLString', () => {

		test('should render ADML string without translations', () => {
			const nlsString: NlsString = {
				value: 'Test description',
				nlsKey: 'test.description'
			};

			const result = renderADMLString('TestPrefix', nlsString);

			assert.strictEqual(result, '<string id="TestPrefix_test_description">Test description</string>');
		});

		test('should replace dots with underscores in nls key', () => {
			const nlsString: NlsString = {
				value: 'Test value',
				nlsKey: 'my.test.nls.key'
			};

			const result = renderADMLString('Prefix', nlsString);

			assert.ok(result.includes('id="Prefix_my_test_nls_key"'));
		});

		test('should use translation when available', () => {
			const nlsString: NlsString = {
				value: 'Original value',
				nlsKey: 'test.key'
			};

			const translations: LanguageTranslations = {
				'test.key': 'Translated value'
			};

			const result = renderADMLString('TestPrefix', nlsString, translations);

			assert.ok(result.includes('>Translated value</string>'));
		});

		test('should fallback to original value when translation not found', () => {
			const nlsString: NlsString = {
				value: 'Original value',
				nlsKey: 'test.key'
			};

			const translations: LanguageTranslations = {
				'other.key': 'Other translation'
			};

			const result = renderADMLString('TestPrefix', nlsString, translations);

			assert.ok(result.includes('>Original value</string>'));
		});
	});

	suite('renderProfileString', () => {

		test('should render profile string without translations', () => {
			const nlsString: NlsString = {
				value: 'Profile description',
				nlsKey: 'profile.description'
			};

			const result = renderProfileString('ProfilePrefix', nlsString);

			assert.strictEqual(result, 'Profile description');
		});

		test('should use translation when available', () => {
			const nlsString: NlsString = {
				value: 'Original profile value',
				nlsKey: 'profile.key'
			};

			const translations: LanguageTranslations = {
				'profile.key': 'Translated profile value'
			};

			const result = renderProfileString('ProfilePrefix', nlsString, translations);

			assert.strictEqual(result, 'Translated profile value');
		});

		test('should fallback to original value when translation not found', () => {
			const nlsString: NlsString = {
				value: 'Original profile value',
				nlsKey: 'profile.key'
			};

			const translations: LanguageTranslations = {
				'other.key': 'Other translation'
			};

			const result = renderProfileString('ProfilePrefix', nlsString, translations);

			assert.strictEqual(result, 'Original profile value');
		});
	});

	suite('renderADMX', () => {

		const mockCategory: Category = {
			name: { value: 'Test Category', nlsKey: 'test.category' }
		};

		const mockPolicy: Policy = {
			name: 'TestPolicy',
			type: PolicyType.Boolean,
			category: mockCategory,
			minimumVersion: '1.85',
			renderADMX: (regKey: string) => [
				`<policy name="TestPolicy" class="Both" displayName="$(string.TestPolicy)" key="Software\\Policies\\Microsoft\\${regKey}">`,
				`	<enabledValue><decimal value="1" /></enabledValue>`,
				`</policy>`
			],
			renderADMLStrings: () => ['<string id="TestPolicy">Test Policy</string>'],
			renderADMLPresentation: () => '<presentation id="TestPolicy"/>',
			renderProfile: () => ['<key>TestPolicy</key>', '<true/>'],
			renderProfileManifest: () => '<dict><key>pfm_name</key><string>TestPolicy</string></dict>'
		};

		test('should render ADMX with correct XML structure', () => {
			const result = renderADMX('VSCode', ['1.85'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<?xml version="1.0" encoding="utf-8"?>'));
			assert.ok(result.includes('<policyDefinitions'));
			assert.ok(result.includes('</policyDefinitions>'));
		});

		test('should include policy namespaces with regKey', () => {
			const result = renderADMX('TestApp', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<target prefix="TestApp" namespace="Microsoft.Policies.TestApp"'));
		});

		test('should replace dots in versions with underscores', () => {
			const result = renderADMX('VSCode', ['1.85.0', '1.90.1'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('Supported_1_85_0'));
			assert.ok(result.includes('Supported_1_90_1'));
			assert.ok(!result.includes('Supported_1.85.0'));
		});

		test('should include categories in correct structure', () => {
			const result = renderADMX('VSCode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<categories>'));
			assert.ok(result.includes('<category displayName="$(string.Application)" name="Application"'));
			assert.ok(result.includes(`<category displayName="$(string.Category_${mockCategory.name.nlsKey})"`));
			assert.ok(result.includes('</categories>'));
		});

		test('should include policies section', () => {
			const result = renderADMX('VSCode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<policies>'));
			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('</policies>'));
		});

		test('should handle multiple versions', () => {
			const result = renderADMX('VSCode', ['1.0', '1.5', '2.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('Supported_1_0'));
			assert.ok(result.includes('Supported_1_5'));
			assert.ok(result.includes('Supported_2_0'));
		});

		test('should handle multiple categories', () => {
			const category1: Category = { name: { value: 'Cat1', nlsKey: 'cat1' } };
			const category2: Category = { name: { value: 'Cat2', nlsKey: 'cat2' } };

			const result = renderADMX('VSCode', ['1.0'], [category1, category2], [mockPolicy]);

			assert.ok(result.includes('Category_cat1'));
			assert.ok(result.includes('Category_cat2'));
		});

		test('should handle multiple policies', () => {
			const policy2: Policy = {
				name: 'TestPolicy2',
				type: PolicyType.String,
				category: mockCategory,
				minimumVersion: '1.85',
				renderADMX: (regKey: string) => [
					`<policy name="TestPolicy2" class="Both" displayName="$(string.TestPolicy2)" key="Software\\Policies\\Microsoft\\${regKey}">`,
					`	<enabledValue><string /></enabledValue>`,
					`</policy>`
				],
				renderADMLStrings: () => ['<string id="TestPolicy2">Test Policy 2</string>'],
				renderADMLPresentation: () => '<presentation id="TestPolicy2"/>',
				renderProfile: () => ['<key>TestPolicy2</key>', '<string/>'],
				renderProfileManifest: () => '<dict><key>pfm_name</key><string>TestPolicy2</string></dict>'
			};
			const result = renderADMX('VSCode', ['1.0'], [mockCategory], [mockPolicy, policy2]);

			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('TestPolicy2'));
		});
	});

	suite('renderADML', () => {

		const mockCategory: Category = {
			name: { value: 'Test Category', nlsKey: 'test.category' }
		};

		const mockPolicy: Policy = {
			name: 'TestPolicy',
			type: PolicyType.String,
			category: mockCategory,
			minimumVersion: '1.85',
			renderADMX: () => [],
			renderADMLStrings: (translations?: LanguageTranslations) => [
				`<string id="TestPolicy">Test Policy ${translations ? translations['test.policy'] || 'Default' : 'Default'}</string>`
			],
			renderADMLPresentation: () => '<presentation id="TestPolicy"><textBox refId="TestPolicy"/></presentation>',
			renderProfile: () => [],
			renderProfileManifest: () => ''
		};

		test('should render ADML with correct XML structure', () => {
			const result = renderADML('VS Code', ['1.85'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<?xml version="1.0" encoding="utf-8"?>'));
			assert.ok(result.includes('<policyDefinitionResources'));
			assert.ok(result.includes('</policyDefinitionResources>'));
		});

		test('should include application name', () => {
			const result = renderADML('My Application', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<string id="Application">My Application</string>'));
		});

		test('should include supported versions with escaped greater-than', () => {
			const result = renderADML('VS Code', ['1.85', '1.90'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('VS Code &gt;= 1.85'));
			assert.ok(result.includes('VS Code &gt;= 1.90'));
		});

		test('should include category strings', () => {
			const result = renderADML('VS Code', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('Category_test_category'));
		});

		test('should include policy strings', () => {
			const result = renderADML('VS Code', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('Test Policy Default'));
		});

		test('should include policy presentations', () => {
			const result = renderADML('VS Code', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<presentationTable>'));
			assert.ok(result.includes('<presentation id="TestPolicy">'));
			assert.ok(result.includes('</presentationTable>'));
		});

		test('should pass translations to policy strings', () => {
			const translations: LanguageTranslations = {
				'test.policy': 'Translated'
			};

			const result = renderADML('VS Code', ['1.0'], [mockCategory], [mockPolicy], translations);

			assert.ok(result.includes('Test Policy Translated'));
		});

		test('should handle multiple categories', () => {
			const category1: Category = { name: { value: 'Cat1', nlsKey: 'cat1' } };
			const category2: Category = { name: { value: 'Cat2', nlsKey: 'cat2' } };

			const result = renderADML('VS Code', ['1.0'], [category1, category2], [mockPolicy]);

			assert.ok(result.includes('Category_cat1'));
			assert.ok(result.includes('Category_cat2'));
		});
	});

	suite('renderProfileManifest', () => {

		const mockCategory: Category = {
			name: { value: 'Test Category', nlsKey: 'test.category' }
		};

		const mockPolicy: Policy = {
			name: 'TestPolicy',
			type: PolicyType.Boolean,
			category: mockCategory,
			minimumVersion: '1.0',
			renderADMX: () => [],
			renderADMLStrings: () => [],
			renderADMLPresentation: () => '',
			renderProfile: () => [],
			renderProfileManifest: (translations?: LanguageTranslations) => `<dict>
<key>pfm_name</key>
<string>TestPolicy</string>
<key>pfm_description</key>
<string>${translations ? translations['test.desc'] || 'Default Desc' : 'Default Desc'}</string>
</dict>`
		};

		test('should render profile manifest with correct XML structure', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<?xml version="1.0" encoding="UTF-8"?>'));
			assert.ok(result.includes('<!DOCTYPE plist PUBLIC'));
			assert.ok(result.includes('<plist version="1.0">'));
			assert.ok(result.includes('</plist>'));
		});

		test('should include app name', () => {
			const result = renderProfileManifest('My App', 'com.example.myapp', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<string>My App Managed Settings</string>'));
			assert.ok(result.includes('<string>My App</string>'));
		});

		test('should include bundle identifier', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<string>com.microsoft.vscode</string>'));
		});

		test('should include required payload fields', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('PayloadDescription'));
			assert.ok(result.includes('PayloadDisplayName'));
			assert.ok(result.includes('PayloadIdentifier'));
			assert.ok(result.includes('PayloadType'));
			assert.ok(result.includes('PayloadUUID'));
			assert.ok(result.includes('PayloadVersion'));
			assert.ok(result.includes('PayloadOrganization'));
		});

		test('should include policy manifests in subkeys', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<key>pfm_subkeys</key>'));
			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('Default Desc'));
		});

		test('should pass translations to policy manifests', () => {
			const translations: LanguageTranslations = {
				'test.desc': 'Translated Description'
			};

			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy], translations);

			assert.ok(result.includes('Translated Description'));
		});

		test('should include VS Code specific URLs', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('https://code.visualstudio.com/'));
			assert.ok(result.includes('https://code.visualstudio.com/docs/setup/enterprise'));
		});

		test('should include last modified date', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<key>pfm_last_modified</key>'));
			assert.ok(result.includes('<date>'));
		});

		test('should mark manifest as unique', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<key>pfm_unique</key>'));
			assert.ok(result.includes('<true/>'));
		});

		test('should handle multiple policies', () => {
			const policy2: Policy = {
				...mockPolicy,
				name: 'TestPolicy2',
				renderProfileManifest: () => `<dict>
<key>pfm_name</key>
<string>TestPolicy2</string>
</dict>`
			};

			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy, policy2]);

			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('TestPolicy2'));
		});

		test('should set format version to 1', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<key>pfm_format_version</key>'));
			assert.ok(result.includes('<integer>1</integer>'));
		});

		test('should set interaction to combined', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<key>pfm_interaction</key>'));
			assert.ok(result.includes('<string>combined</string>'));
		});

		test('should set platform to macOS', () => {
			const result = renderProfileManifest('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<key>pfm_platforms</key>'));
			assert.ok(result.includes('<string>macOS</string>'));
		});
	});
});
