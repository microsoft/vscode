/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { renderADMLString, renderProfileString, renderADMX, renderADML, renderProfileManifest, renderMacOSPolicy, renderGP } from '../../../node/writer/render.js';
import { NlsString, LanguageTranslations, Category, Policy, PolicyType } from '../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogger } from '../../../../log/common/log.js';

suite('Render Functions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();
	const mockLogger: ILogger = { warn: () => { } } as unknown as ILogger;

	suite('renderADMLString', () => {

		test('should render ADML string without translations', () => {
			const nlsString: NlsString = {
				value: 'Test description',
				nlsKey: 'test.description'
			};

			const result = renderADMLString(mockLogger, 'TestPrefix', nlsString);

			assert.strictEqual(result, '<string id="TestPrefix_test_description">Test description</string>');
		});

		test('should replace dots with underscores in nls key', () => {
			const nlsString: NlsString = {
				value: 'Test value',
				nlsKey: 'my.test.nls.key'
			};

			const result = renderADMLString(mockLogger, 'Prefix', nlsString);

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

			const result = renderADMLString(mockLogger, 'TestPrefix', nlsString, translations);

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

			const result = renderADMLString(mockLogger, 'TestPrefix', nlsString, translations);

			assert.ok(result.includes('>Original value</string>'));
		});
	});

	suite('renderProfileString', () => {

		test('should render profile string without translations', () => {
			const nlsString: NlsString = {
				value: 'Profile description',
				nlsKey: 'profile.description'
			};

			const result = renderProfileString(mockLogger, 'ProfilePrefix', nlsString);

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

			const result = renderProfileString(mockLogger, 'ProfilePrefix', nlsString, translations);

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

			const result = renderProfileString(mockLogger, 'ProfilePrefix', nlsString, translations);

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
			const result = renderADML(mockLogger, 'VS Code', ['1.85'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<?xml version="1.0" encoding="utf-8"?>'));
			assert.ok(result.includes('<policyDefinitionResources'));
			assert.ok(result.includes('</policyDefinitionResources>'));
		});

		test('should include application name', () => {
			const result = renderADML(mockLogger, 'My Application', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<string id="Application">My Application</string>'));
		});

		test('should include supported versions with escaped greater-than', () => {
			const result = renderADML(mockLogger, 'VS Code', ['1.85', '1.90'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('VS Code &gt;= 1.85'));
			assert.ok(result.includes('VS Code &gt;= 1.90'));
		});

		test('should include category strings', () => {
			const result = renderADML(mockLogger, 'VS Code', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('Category_test_category'));
		});

		test('should include policy strings', () => {
			const result = renderADML(mockLogger, 'VS Code', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('TestPolicy'));
			assert.ok(result.includes('Test Policy Default'));
		});

		test('should include policy presentations', () => {
			const result = renderADML(mockLogger, 'VS Code', ['1.0'], [mockCategory], [mockPolicy]);

			assert.ok(result.includes('<presentationTable>'));
			assert.ok(result.includes('<presentation id="TestPolicy">'));
			assert.ok(result.includes('</presentationTable>'));
		});

		test('should pass translations to policy strings', () => {
			const translations: LanguageTranslations = {
				'test.policy': 'Translated'
			};

			const result = renderADML(mockLogger, 'VS Code', ['1.0'], [mockCategory], [mockPolicy], translations);

			assert.ok(result.includes('Test Policy Translated'));
		});

		test('should handle multiple categories', () => {
			const category1: Category = { name: { value: 'Cat1', nlsKey: 'cat1' } };
			const category2: Category = { name: { value: 'Cat2', nlsKey: 'cat2' } };

			const result = renderADML(mockLogger, 'VS Code', ['1.0'], [category1, category2], [mockPolicy]);

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

	suite('renderMacOSPolicy', () => {

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
			renderProfile: () => ['<key>TestPolicy</key>', '<true/>'],
			renderProfileManifest: (translations?: LanguageTranslations) => `<dict>
<key>pfm_name</key>
<string>TestPolicy</string>
<key>pfm_description</key>
<string>${translations ? translations['test.desc'] || 'Default Desc' : 'Default Desc'}</string>
</dict>`
		};

		test('should render complete macOS policy profile', () => {
			const result = renderMacOSPolicy('VS Code', 'com.microsoft.vscode', 'payload-uuid', 'uuid', ['1.0'], [mockCategory], [mockPolicy], []);

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
			const result = renderMacOSPolicy('VS Code', 'com.microsoft.vscode', 'payload-uuid', 'uuid', ['1.0'], [mockCategory], [mockPolicy], []);

			assert.strictEqual(result.manifests.length, 1);
			assert.strictEqual(result.manifests[0].languageId, 'en-us');
			assert.ok(result.manifests[0].contents.includes('VS Code Managed Settings'));
		});

		test('should include translations', () => {
			const translations = [
				{ languageId: 'fr-fr', languageTranslations: { 'test.desc': 'Description Française' } },
				{ languageId: 'de-de', languageTranslations: { 'test.desc': 'Deutsche Beschreibung' } }
			];

			const result = renderMacOSPolicy('VS Code', 'com.microsoft.vscode', 'payload-uuid', 'uuid', ['1.0'], [mockCategory], [mockPolicy], translations);

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

			const result = renderMacOSPolicy('VS Code', 'com.microsoft.vscode', 'payload-uuid', 'uuid', ['1.0'], [mockCategory], [mockPolicy, policy2], []);

			assert.ok(result.profile.includes('<key>TestPolicy</key>'));
			assert.ok(result.profile.includes('<true/>'));
			assert.ok(result.profile.includes('<key>TestPolicy2</key>'));
			assert.ok(result.profile.includes('<string>test value</string>'));
		});

		test('should use provided UUIDs in profile', () => {
			const result = renderMacOSPolicy('My App', 'com.example.app', 'custom-payload-uuid', 'custom-uuid', ['1.0'], [mockCategory], [mockPolicy], []);

			assert.ok(result.profile.includes('<string>custom-payload-uuid</string>'));
			assert.ok(result.profile.includes('<string>custom-uuid</string>'));
			assert.ok(result.profile.includes('<string>com.example.app.custom-uuid</string>'));
		});

		test('should include enterprise documentation link', () => {
			const result = renderMacOSPolicy('VS Code', 'com.microsoft.vscode', 'payload-uuid', 'uuid', ['1.0'], [mockCategory], [mockPolicy], []);

			assert.ok(result.profile.includes('https://code.visualstudio.com/docs/setup/enterprise'));
		});

		test('should set TargetDeviceType to 5', () => {
			const result = renderMacOSPolicy('VS Code', 'com.microsoft.vscode', 'payload-uuid', 'uuid', ['1.0'], [mockCategory], [mockPolicy], []);

			assert.ok(result.profile.includes('<key>TargetDeviceType</key>'));
			assert.ok(result.profile.includes('<integer>5</integer>'));
		});
	});

	suite('renderGP', () => {

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
			renderADMLStrings: (translations?: LanguageTranslations) => [
				`<string id="TestPolicy">${translations ? translations['test.policy'] || 'Test Policy' : 'Test Policy'}</string>`
			],
			renderADMLPresentation: () => '<presentation id="TestPolicy"/>',
			renderProfile: () => [],
			renderProfileManifest: () => ''
		};

		test('should render complete GP with ADMX and ADML', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], []);

			assert.ok(result.admx);
			assert.ok(result.adml);
			assert.ok(Array.isArray(result.adml));
		});

		test('should include regKey in ADMX', () => {
			const result = renderGP(mockLogger, 'VS Code', 'CustomRegKey', ['1.85'], [mockCategory], [mockPolicy], []);

			assert.ok(result.admx.includes('CustomRegKey'));
			assert.ok(result.admx.includes('Software\\Policies\\Microsoft\\CustomRegKey'));
		});

		test('should include en-us ADML by default', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], []);

			assert.strictEqual(result.adml.length, 1);
			assert.strictEqual(result.adml[0].languageId, 'en-us');
			assert.ok(result.adml[0].contents.includes('VS Code'));
		});

		test('should include translations in ADML', () => {
			const translations = [
				{ languageId: 'fr-fr', languageTranslations: { 'test.policy': 'Politique de test' } },
				{ languageId: 'de-de', languageTranslations: { 'test.policy': 'Testrichtlinie' } }
			];

			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], translations);

			assert.strictEqual(result.adml.length, 3); // en-us + 2 translations
			assert.strictEqual(result.adml[0].languageId, 'en-us');
			assert.strictEqual(result.adml[1].languageId, 'fr-fr');
			assert.strictEqual(result.adml[2].languageId, 'de-de');

			assert.ok(result.adml[1].contents.includes('Politique de test'));
			assert.ok(result.adml[2].contents.includes('Testrichtlinie'));
		});

		test('should pass versions to ADMX', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85', '1.90'], [mockCategory], [mockPolicy], []);

			assert.ok(result.admx.includes('Supported_1_85'));
			assert.ok(result.admx.includes('Supported_1_90'));
		});

		test('should pass versions to ADML', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85', '1.90'], [mockCategory], [mockPolicy], []);

			assert.ok(result.adml[0].contents.includes('VS Code &gt;= 1.85'));
			assert.ok(result.adml[0].contents.includes('VS Code &gt;= 1.90'));
		});

		test('should pass categories to ADMX', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], []);

			assert.ok(result.admx.includes('test.category'));
		});

		test('should pass categories to ADML', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], []);

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

			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy, policy2], []);

			assert.ok(result.admx.includes('TestPolicy'));
			assert.ok(result.admx.includes('TestPolicy2'));
			assert.ok(result.adml[0].contents.includes('TestPolicy'));
			assert.ok(result.adml[0].contents.includes('TestPolicy2'));
		});

		test('should include app name in ADML', () => {
			const result = renderGP(mockLogger, 'My Custom App', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], []);

			assert.ok(result.adml[0].contents.includes('My Custom App'));
		});

		test('should return structured result with admx and adml properties', () => {
			const result = renderGP(mockLogger, 'VS Code', 'VSCode', ['1.85'], [mockCategory], [mockPolicy], []);

			assert.ok('admx' in result);
			assert.ok('adml' in result);
			assert.strictEqual(typeof result.admx, 'string');
			assert.ok(Array.isArray(result.adml));
		});
	});
});
