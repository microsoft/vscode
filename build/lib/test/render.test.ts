/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderADMLString, renderProfileString, renderADMX, renderADML, renderProfileManifest, renderMacOSPolicy, renderGP, renderJsonPolicies } from '../policies/render.ts';
import { type NlsString, type LanguageTranslations, type Category, type Policy, PolicyType } from '../policies/types.ts';

suite('Render Functions', () => {

	suite('renderADMLString', () => {

		test('should render ADML string without translations', () => {
			const nlsString: NlsString = {
				value: 'Test description',
				nlsKey: 'test.description'
			};

			const result = renderADMLString('TestPrefix', 'testModule', nlsString);

			assert.strictEqual(result, '<string id="TestPrefix_test_description">Test description</string>');
		});

		test('should replace dots with underscores in nls key', () => {
			const nlsString: NlsString = {
				value: 'Test value',
				nlsKey: 'my.test.nls.key'
			};

			const result = renderADMLString('Prefix', 'testModule', nlsString);

			assert.ok(result.includes('id="Prefix_my_test_nls_key"'));
		});

		test('should use translation when available', () => {
			const nlsString: NlsString = {
				value: 'Original value',
				nlsKey: 'test.key'
			};

			const translations: LanguageTranslations = {
				'testModule': {
					'test.key': 'Translated value'
				}
			};

			const result = renderADMLString('TestPrefix', 'testModule', nlsString, translations);

			assert.ok(result.includes('>Translated value</string>'));
		});

		test('should fallback to original value when translation not found', () => {
			const nlsString: NlsString = {
				value: 'Original value',
				nlsKey: 'test.key'
			};

			const translations: LanguageTranslations = {
				'testModule': {
					'other.key': 'Other translation'
				}
			};

			const result = renderADMLString('TestPrefix', 'testModule', nlsString, translations);

			assert.ok(result.includes('>Original value</string>'));
		});
	});

	suite('renderProfileString', () => {

		test('should render profile string without translations', () => {
			const nlsString: NlsString = {
				value: 'Profile description',
				nlsKey: 'profile.description'
			};

			const result = renderProfileString('ProfilePrefix', 'testModule', nlsString);

			assert.strictEqual(result, 'Profile description');
		});

		test('should use translation when available', () => {
			const nlsString: NlsString = {
				value: 'Original profile value',
				nlsKey: 'profile.key'
			};

			const translations: LanguageTranslations = {
				'testModule': {
					'profile.key': 'Translated profile value'
				}
			};

			const result = renderProfileString('ProfilePrefix', 'testModule', nlsString, translations);

			assert.strictEqual(result, 'Translated profile value');
		});

		test('should fallback to original value when translation not found', () => {
			const nlsString: NlsString = {
				value: 'Original profile value',
				nlsKey: 'profile.key'
			};

			const translations: LanguageTranslations = {
				'testModule': {
					'other.key': 'Other translation'
				}
			};

			const result = renderProfileString('ProfilePrefix', 'testModule', nlsString, translations);

			assert.strictEqual(result, 'Original profile value');
		});
	});

	suite('renderADMX', () => {

		const mockCategory: Category = {
			moduleName: 'testModule',
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
			renderProfileManifest: () => '<dict><key>pfm_name</key><string>TestPolicy</string></dict>',
			renderJsonValue: () => null
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
			const category1: Category = { moduleName: 'testModule', name: { value: 'Cat1', nlsKey: 'cat1' } };
			const category2: Category = { moduleName: 'testModule', name: { value: 'Cat2', nlsKey: 'cat2' } };

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
				renderProfileManifest: () => '<dict><key>pfm_name</key><string>TestPolicy2</string></dict>',
				renderJsonValue: () => null
			};
			const result = renderADMX('VSCode', ['1.0'], [mockCategory], [mockPolicy, policy2]);

			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('TestPolicy2'));
		});
	});

	suite('renderADML', () => {

		const mockCategory: Category = {
			moduleName: 'testModule',
			name: { value: 'Test Category', nlsKey: 'test.category' }
		};

		const mockPolicy: Policy = {
			name: 'TestPolicy',
			type: PolicyType.String,
			category: mockCategory,
			minimumVersion: '1.85',
			renderADMX: () => [],
			renderADMLStrings: (translations?: LanguageTranslations) => [
				`<string id="TestPolicy">Test Policy ${translations?.['testModule']?.['test.policy'] || 'Default'}</string>`
			],
			renderADMLPresentation: () => '<presentation id="TestPolicy"><textBox refId="TestPolicy"/></presentation>',
			renderProfile: () => [],
			renderProfileManifest: () => '',
			renderJsonValue: () => null
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
				'testModule': {
					'test.policy': 'Translated'
				}
			};

			const result = renderADML('VS Code', ['1.0'], [mockCategory], [mockPolicy], translations);

			assert.ok(result.includes('Test Policy Translated'));
		});

		test('should handle multiple categories', () => {
			const category1: Category = { moduleName: 'testModule', name: { value: 'Cat1', nlsKey: 'cat1' } };
			const category2: Category = { moduleName: 'testModule', name: { value: 'Cat2', nlsKey: 'cat2' } };

			const result = renderADML('VS Code', ['1.0'], [category1, category2], [mockPolicy]);

			assert.ok(result.includes('Category_cat1'));
			assert.ok(result.includes('Category_cat2'));
		});
	});

	suite('renderProfileManifest', () => {

		const mockCategory: Category = {
			moduleName: 'testModule',
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
<string>${translations?.['testModule']?.['test.desc'] || 'Default Desc'}</string>
</dict>`,
			renderJsonValue: () => null
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
				'testModule': {
					'test.desc': 'Translated Description'
				}
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

	suite('renderMacOSPolicy', () => {

		const mockCategory: Category = {
			moduleName: 'testModule',
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
			renderProfile: () => ['<key>TestPolicy</key>', '<true/>'],
			renderProfileManifest: (translations?: LanguageTranslations) => `<dict>
<key>pfm_name</key>
<string>TestPolicy</string>
<key>pfm_description</key>
<string>${translations?.['testModule']?.['test.desc'] || 'Default Desc'}</string>
</dict>`,
			renderJsonValue: () => null
		};

		test('should render complete macOS policy profile', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderMacOSPolicy(product, [mockPolicy], []);

			const expected = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
	<dict>
		<key>PayloadContent</key>
		<array>
			<dict>
				<key>PayloadDisplayName</key>
				<string>VS Code</string>
				<key>PayloadIdentifier</key>
				<string>com.microsoft.vscode.uuid</string>
				<key>PayloadType</key>
				<string>com.microsoft.vscode</string>
				<key>PayloadUUID</key>
				<string>uuid</string>
				<key>PayloadVersion</key>
				<integer>1</integer>
				<key>TestPolicy</key>
				<true/>
			</dict>
		</array>
		<key>PayloadDescription</key>
		<string>This profile manages VS Code. For more information see https://code.visualstudio.com/docs/setup/enterprise</string>
		<key>PayloadDisplayName</key>
		<string>VS Code</string>
		<key>PayloadIdentifier</key>
		<string>com.microsoft.vscode</string>
		<key>PayloadOrganization</key>
		<string>Microsoft</string>
		<key>PayloadType</key>
		<string>Configuration</string>
		<key>PayloadUUID</key>
		<string>payload-uuid</string>
		<key>PayloadVersion</key>
		<integer>1</integer>
		<key>TargetDeviceType</key>
		<integer>5</integer>
	</dict>
</plist>`;

			assert.strictEqual(result.profile, expected);
		});

		test('should include en-us manifest by default', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderMacOSPolicy(product, [mockPolicy], []);

			assert.strictEqual(result.manifests.length, 1);
			assert.strictEqual(result.manifests[0].languageId, 'en-us');
			assert.ok(result.manifests[0].contents.includes('VS Code Managed Settings'));
		});

		test('should include translations', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const translations = [
				{ languageId: 'fr-fr', languageTranslations: { 'testModule': { 'test.desc': 'Description Française' } } },
				{ languageId: 'de-de', languageTranslations: { 'testModule': { 'test.desc': 'Deutsche Beschreibung' } } }
			];

			const result = renderMacOSPolicy(product, [mockPolicy], translations);

			assert.strictEqual(result.manifests.length, 3); // en-us + 2 translations
			assert.strictEqual(result.manifests[0].languageId, 'en-us');
			assert.strictEqual(result.manifests[1].languageId, 'fr-fr');
			assert.strictEqual(result.manifests[2].languageId, 'de-de');

			assert.ok(result.manifests[1].contents.includes('Description Française'));
			assert.ok(result.manifests[2].contents.includes('Deutsche Beschreibung'));
		});

		test('should handle multiple policies with correct indentation', () => {
			const policy2: Policy = {
				...mockPolicy,
				name: 'TestPolicy2',
				renderProfile: () => ['<key>TestPolicy2</key>', '<string>test value</string>']
			};

			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderMacOSPolicy(product, [mockPolicy, policy2], []);

			assert.ok(result.profile.includes('<key>TestPolicy</key>'));
			assert.ok(result.profile.includes('<true/>'));
			assert.ok(result.profile.includes('<key>TestPolicy2</key>'));
			assert.ok(result.profile.includes('<string>test value</string>'));
		});

		test('should use provided UUIDs in profile', () => {
			const product = {
				nameLong: 'My App',
				darwinBundleIdentifier: 'com.example.app',
				darwinProfilePayloadUUID: 'custom-payload-uuid',
				darwinProfileUUID: 'custom-uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderMacOSPolicy(product, [mockPolicy], []);

			assert.ok(result.profile.includes('<string>custom-payload-uuid</string>'));
			assert.ok(result.profile.includes('<string>custom-uuid</string>'));
			assert.ok(result.profile.includes('<string>com.example.app.custom-uuid</string>'));
		});

		test('should include enterprise documentation link', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderMacOSPolicy(product, [mockPolicy], []);

			assert.ok(result.profile.includes('https://code.visualstudio.com/docs/setup/enterprise'));
		});

		test('should set TargetDeviceType to 5', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderMacOSPolicy(product, [mockPolicy], []);

			assert.ok(result.profile.includes('<key>TargetDeviceType</key>'));
			assert.ok(result.profile.includes('<integer>5</integer>'));
		});
	});

	suite('renderGP', () => {

		const mockCategory: Category = {
			moduleName: 'testModule',
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
			renderADMLStrings: (translations?: LanguageTranslations) => [
				`<string id="TestPolicy">${translations?.['testModule']?.['test.policy'] || 'Test Policy'}</string>`
			],
			renderADMLPresentation: () => '<presentation id="TestPolicy"/>',
			renderProfile: () => [],
			renderProfileManifest: () => '',
			renderJsonValue: () => null
		};

		test('should render complete GP with ADMX and ADML', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.admx);
			assert.ok(result.adml);
			assert.ok(Array.isArray(result.adml));
		});

		test('should include regKey in ADMX', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'CustomRegKey'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.admx.includes('CustomRegKey'));
			assert.ok(result.admx.includes('Software\\Policies\\Microsoft\\CustomRegKey'));
		});

		test('should include en-us ADML by default', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.strictEqual(result.adml.length, 1);
			assert.strictEqual(result.adml[0].languageId, 'en-us');
			assert.ok(result.adml[0].contents.includes('VS Code'));
		});

		test('should include translations in ADML', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const translations = [
				{ languageId: 'fr-fr', languageTranslations: { 'testModule': { 'test.policy': 'Politique de test' } } },
				{ languageId: 'de-de', languageTranslations: { 'testModule': { 'test.policy': 'Testrichtlinie' } } }
			];

			const result = renderGP(product, [mockPolicy], translations);

			assert.strictEqual(result.adml.length, 3); // en-us + 2 translations
			assert.strictEqual(result.adml[0].languageId, 'en-us');
			assert.strictEqual(result.adml[1].languageId, 'fr-fr');
			assert.strictEqual(result.adml[2].languageId, 'de-de');

			assert.ok(result.adml[1].contents.includes('Politique de test'));
			assert.ok(result.adml[2].contents.includes('Testrichtlinie'));
		});

		test('should pass versions to ADMX', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.admx.includes('Supported_1_85'));
		});

		test('should pass versions to ADML', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.adml[0].contents.includes('VS Code &gt;= 1.85'));
		});

		test('should pass categories to ADMX', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.admx.includes('test.category'));
		});

		test('should pass categories to ADML', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.adml[0].contents.includes('Category_test_category'));
		});

		test('should handle multiple policies', () => {
			const policy2: Policy = {
				...mockPolicy,
				name: 'TestPolicy2',
				renderADMX: (regKey: string) => [
					`<policy name="TestPolicy2" class="Both" displayName="$(string.TestPolicy2)" key="Software\\Policies\\Microsoft\\${regKey}">`,
					`	<enabledValue><decimal value="1" /></enabledValue>`,
					`</policy>`
				],
				renderADMLStrings: () => ['<string id="TestPolicy2">Test Policy 2</string>']
			};

			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy, policy2], []);

			assert.ok(result.admx.includes('TestPolicy'));
			assert.ok(result.admx.includes('TestPolicy2'));
			assert.ok(result.adml[0].contents.includes('TestPolicy'));
			assert.ok(result.adml[0].contents.includes('TestPolicy2'));
		});

		test('should include app name in ADML', () => {
			const product = {
				nameLong: 'My Custom App',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok(result.adml[0].contents.includes('My Custom App'));
		});

		test('should return structured result with admx and adml properties', () => {
			const product = {
				nameLong: 'VS Code',
				darwinBundleIdentifier: 'com.microsoft.vscode',
				darwinProfilePayloadUUID: 'payload-uuid',
				darwinProfileUUID: 'uuid',
				win32RegValueName: 'VSCode'
			};
			const result = renderGP(product, [mockPolicy], []);

			assert.ok('admx' in result);
			assert.ok('adml' in result);
			assert.strictEqual(typeof result.admx, 'string');
			assert.ok(Array.isArray(result.adml));
		});
	});

	suite('renderJsonPolicies', () => {

		const mockCategory: Category = {
			moduleName: 'testModule',
			name: { value: 'Test Category', nlsKey: 'test.category' }
		};

		test('should render boolean policy JSON value', () => {
			const booleanPolicy: Policy = {
				name: 'BooleanPolicy',
				type: PolicyType.Boolean,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => false
			};

			const result = renderJsonPolicies([booleanPolicy]);

			assert.deepStrictEqual(result, { BooleanPolicy: false });
		});

		test('should render number policy JSON value', () => {
			const numberPolicy: Policy = {
				name: 'NumberPolicy',
				type: PolicyType.Number,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => 42
			};

			const result = renderJsonPolicies([numberPolicy]);

			assert.deepStrictEqual(result, { NumberPolicy: 42 });
		});

		test('should render string policy JSON value', () => {
			const stringPolicy: Policy = {
				name: 'StringPolicy',
				type: PolicyType.String,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => ''
			};

			const result = renderJsonPolicies([stringPolicy]);

			assert.deepStrictEqual(result, { StringPolicy: '' });
		});

		test('should render string enum policy JSON value', () => {
			const stringEnumPolicy: Policy = {
				name: 'StringEnumPolicy',
				type: PolicyType.StringEnum,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => 'auto'
			};

			const result = renderJsonPolicies([stringEnumPolicy]);

			assert.deepStrictEqual(result, { StringEnumPolicy: 'auto' });
		});

		test('should render object policy JSON value', () => {
			const objectPolicy: Policy = {
				name: 'ObjectPolicy',
				type: PolicyType.Object,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => ''
			};

			const result = renderJsonPolicies([objectPolicy]);

			assert.deepStrictEqual(result, { ObjectPolicy: '' });
		});

		test('should render multiple policies', () => {
			const booleanPolicy: Policy = {
				name: 'BooleanPolicy',
				type: PolicyType.Boolean,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => true
			};

			const numberPolicy: Policy = {
				name: 'NumberPolicy',
				type: PolicyType.Number,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => 100
			};

			const stringPolicy: Policy = {
				name: 'StringPolicy',
				type: PolicyType.String,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => 'test-value'
			};

			const result = renderJsonPolicies([booleanPolicy, numberPolicy, stringPolicy]);

			assert.deepStrictEqual(result, {
				BooleanPolicy: true,
				NumberPolicy: 100,
				StringPolicy: 'test-value'
			});
		});

		test('should handle empty policies array', () => {
			const result = renderJsonPolicies([]);

			assert.deepStrictEqual(result, {});
		});

		test('should handle null JSON value', () => {
			const nullPolicy: Policy = {
				name: 'NullPolicy',
				type: PolicyType.String,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => null
			};

			const result = renderJsonPolicies([nullPolicy]);

			assert.deepStrictEqual(result, { NullPolicy: null });
		});

		test('should handle object JSON value', () => {
			const objectPolicy: Policy = {
				name: 'ComplexObjectPolicy',
				type: PolicyType.Object,
				category: mockCategory,
				minimumVersion: '1.0',
				renderADMX: () => [],
				renderADMLStrings: () => [],
				renderADMLPresentation: () => '',
				renderProfile: () => [],
				renderProfileManifest: () => '',
				renderJsonValue: () => ({ nested: { value: 123 } })
			};

			const result = renderJsonPolicies([objectPolicy]);

			assert.deepStrictEqual(result, { ComplexObjectPolicy: { nested: { value: 123 } } });
		});
	});
});
