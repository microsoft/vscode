"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const render_js_1 = require("../policies/render.js");
const types_js_1 = require("../policies/types.js");
suite('Render Functions', () => {
    suite('renderADMLString', () => {
        test('should render ADML string without translations', () => {
            const nlsString = {
                value: 'Test description',
                nlsKey: 'test.description'
            };
            const result = (0, render_js_1.renderADMLString)('TestPrefix', 'testModule', nlsString);
            assert_1.default.strictEqual(result, '<string id="TestPrefix_test_description">Test description</string>');
        });
        test('should replace dots with underscores in nls key', () => {
            const nlsString = {
                value: 'Test value',
                nlsKey: 'my.test.nls.key'
            };
            const result = (0, render_js_1.renderADMLString)('Prefix', 'testModule', nlsString);
            assert_1.default.ok(result.includes('id="Prefix_my_test_nls_key"'));
        });
        test('should use translation when available', () => {
            const nlsString = {
                value: 'Original value',
                nlsKey: 'test.key'
            };
            const translations = {
                'testModule': {
                    'test.key': 'Translated value'
                }
            };
            const result = (0, render_js_1.renderADMLString)('TestPrefix', 'testModule', nlsString, translations);
            assert_1.default.ok(result.includes('>Translated value</string>'));
        });
        test('should fallback to original value when translation not found', () => {
            const nlsString = {
                value: 'Original value',
                nlsKey: 'test.key'
            };
            const translations = {
                'testModule': {
                    'other.key': 'Other translation'
                }
            };
            const result = (0, render_js_1.renderADMLString)('TestPrefix', 'testModule', nlsString, translations);
            assert_1.default.ok(result.includes('>Original value</string>'));
        });
    });
    suite('renderProfileString', () => {
        test('should render profile string without translations', () => {
            const nlsString = {
                value: 'Profile description',
                nlsKey: 'profile.description'
            };
            const result = (0, render_js_1.renderProfileString)('ProfilePrefix', 'testModule', nlsString);
            assert_1.default.strictEqual(result, 'Profile description');
        });
        test('should use translation when available', () => {
            const nlsString = {
                value: 'Original profile value',
                nlsKey: 'profile.key'
            };
            const translations = {
                'testModule': {
                    'profile.key': 'Translated profile value'
                }
            };
            const result = (0, render_js_1.renderProfileString)('ProfilePrefix', 'testModule', nlsString, translations);
            assert_1.default.strictEqual(result, 'Translated profile value');
        });
        test('should fallback to original value when translation not found', () => {
            const nlsString = {
                value: 'Original profile value',
                nlsKey: 'profile.key'
            };
            const translations = {
                'testModule': {
                    'other.key': 'Other translation'
                }
            };
            const result = (0, render_js_1.renderProfileString)('ProfilePrefix', 'testModule', nlsString, translations);
            assert_1.default.strictEqual(result, 'Original profile value');
        });
    });
    suite('renderADMX', () => {
        const mockCategory = {
            moduleName: 'testModule',
            name: { value: 'Test Category', nlsKey: 'test.category' }
        };
        const mockPolicy = {
            name: 'TestPolicy',
            type: types_js_1.PolicyType.Boolean,
            category: mockCategory,
            minimumVersion: '1.85',
            renderADMX: (regKey) => [
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
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.85'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<?xml version="1.0" encoding="utf-8"?>'));
            assert_1.default.ok(result.includes('<policyDefinitions'));
            assert_1.default.ok(result.includes('</policyDefinitions>'));
        });
        test('should include policy namespaces with regKey', () => {
            const result = (0, render_js_1.renderADMX)('TestApp', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<target prefix="TestApp" namespace="Microsoft.Policies.TestApp"'));
        });
        test('should replace dots in versions with underscores', () => {
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.85.0', '1.90.1'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('Supported_1_85_0'));
            assert_1.default.ok(result.includes('Supported_1_90_1'));
            assert_1.default.ok(!result.includes('Supported_1.85.0'));
        });
        test('should include categories in correct structure', () => {
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<categories>'));
            assert_1.default.ok(result.includes('<category displayName="$(string.Application)" name="Application"'));
            assert_1.default.ok(result.includes(`<category displayName="$(string.Category_${mockCategory.name.nlsKey})"`));
            assert_1.default.ok(result.includes('</categories>'));
        });
        test('should include policies section', () => {
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<policies>'));
            assert_1.default.ok(result.includes('TestPolicy'));
            assert_1.default.ok(result.includes('</policies>'));
        });
        test('should handle multiple versions', () => {
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.0', '1.5', '2.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('Supported_1_0'));
            assert_1.default.ok(result.includes('Supported_1_5'));
            assert_1.default.ok(result.includes('Supported_2_0'));
        });
        test('should handle multiple categories', () => {
            const category1 = { moduleName: 'testModule', name: { value: 'Cat1', nlsKey: 'cat1' } };
            const category2 = { moduleName: 'testModule', name: { value: 'Cat2', nlsKey: 'cat2' } };
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.0'], [category1, category2], [mockPolicy]);
            assert_1.default.ok(result.includes('Category_cat1'));
            assert_1.default.ok(result.includes('Category_cat2'));
        });
        test('should handle multiple policies', () => {
            const policy2 = {
                name: 'TestPolicy2',
                type: types_js_1.PolicyType.String,
                category: mockCategory,
                minimumVersion: '1.85',
                renderADMX: (regKey) => [
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
            const result = (0, render_js_1.renderADMX)('VSCode', ['1.0'], [mockCategory], [mockPolicy, policy2]);
            assert_1.default.ok(result.includes('TestPolicy'));
            assert_1.default.ok(result.includes('TestPolicy2'));
        });
    });
    suite('renderADML', () => {
        const mockCategory = {
            moduleName: 'testModule',
            name: { value: 'Test Category', nlsKey: 'test.category' }
        };
        const mockPolicy = {
            name: 'TestPolicy',
            type: types_js_1.PolicyType.String,
            category: mockCategory,
            minimumVersion: '1.85',
            renderADMX: () => [],
            renderADMLStrings: (translations) => [
                `<string id="TestPolicy">Test Policy ${translations?.['testModule']?.['test.policy'] || 'Default'}</string>`
            ],
            renderADMLPresentation: () => '<presentation id="TestPolicy"><textBox refId="TestPolicy"/></presentation>',
            renderProfile: () => [],
            renderProfileManifest: () => '',
            renderJsonValue: () => null
        };
        test('should render ADML with correct XML structure', () => {
            const result = (0, render_js_1.renderADML)('VS Code', ['1.85'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<?xml version="1.0" encoding="utf-8"?>'));
            assert_1.default.ok(result.includes('<policyDefinitionResources'));
            assert_1.default.ok(result.includes('</policyDefinitionResources>'));
        });
        test('should include application name', () => {
            const result = (0, render_js_1.renderADML)('My Application', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<string id="Application">My Application</string>'));
        });
        test('should include supported versions with escaped greater-than', () => {
            const result = (0, render_js_1.renderADML)('VS Code', ['1.85', '1.90'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('VS Code &gt;= 1.85'));
            assert_1.default.ok(result.includes('VS Code &gt;= 1.90'));
        });
        test('should include category strings', () => {
            const result = (0, render_js_1.renderADML)('VS Code', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('Category_test_category'));
        });
        test('should include policy strings', () => {
            const result = (0, render_js_1.renderADML)('VS Code', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('TestPolicy'));
            assert_1.default.ok(result.includes('Test Policy Default'));
        });
        test('should include policy presentations', () => {
            const result = (0, render_js_1.renderADML)('VS Code', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<presentationTable>'));
            assert_1.default.ok(result.includes('<presentation id="TestPolicy">'));
            assert_1.default.ok(result.includes('</presentationTable>'));
        });
        test('should pass translations to policy strings', () => {
            const translations = {
                'testModule': {
                    'test.policy': 'Translated'
                }
            };
            const result = (0, render_js_1.renderADML)('VS Code', ['1.0'], [mockCategory], [mockPolicy], translations);
            assert_1.default.ok(result.includes('Test Policy Translated'));
        });
        test('should handle multiple categories', () => {
            const category1 = { moduleName: 'testModule', name: { value: 'Cat1', nlsKey: 'cat1' } };
            const category2 = { moduleName: 'testModule', name: { value: 'Cat2', nlsKey: 'cat2' } };
            const result = (0, render_js_1.renderADML)('VS Code', ['1.0'], [category1, category2], [mockPolicy]);
            assert_1.default.ok(result.includes('Category_cat1'));
            assert_1.default.ok(result.includes('Category_cat2'));
        });
    });
    suite('renderProfileManifest', () => {
        const mockCategory = {
            moduleName: 'testModule',
            name: { value: 'Test Category', nlsKey: 'test.category' }
        };
        const mockPolicy = {
            name: 'TestPolicy',
            type: types_js_1.PolicyType.Boolean,
            category: mockCategory,
            minimumVersion: '1.0',
            renderADMX: () => [],
            renderADMLStrings: () => [],
            renderADMLPresentation: () => '',
            renderProfile: () => [],
            renderProfileManifest: (translations) => `<dict>
<key>pfm_name</key>
<string>TestPolicy</string>
<key>pfm_description</key>
<string>${translations?.['testModule']?.['test.desc'] || 'Default Desc'}</string>
</dict>`,
            renderJsonValue: () => null
        };
        test('should render profile manifest with correct XML structure', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<?xml version="1.0" encoding="UTF-8"?>'));
            assert_1.default.ok(result.includes('<!DOCTYPE plist PUBLIC'));
            assert_1.default.ok(result.includes('<plist version="1.0">'));
            assert_1.default.ok(result.includes('</plist>'));
        });
        test('should include app name', () => {
            const result = (0, render_js_1.renderProfileManifest)('My App', 'com.example.myapp', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<string>My App Managed Settings</string>'));
            assert_1.default.ok(result.includes('<string>My App</string>'));
        });
        test('should include bundle identifier', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<string>com.microsoft.vscode</string>'));
        });
        test('should include required payload fields', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('PayloadDescription'));
            assert_1.default.ok(result.includes('PayloadDisplayName'));
            assert_1.default.ok(result.includes('PayloadIdentifier'));
            assert_1.default.ok(result.includes('PayloadType'));
            assert_1.default.ok(result.includes('PayloadUUID'));
            assert_1.default.ok(result.includes('PayloadVersion'));
            assert_1.default.ok(result.includes('PayloadOrganization'));
        });
        test('should include policy manifests in subkeys', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<key>pfm_subkeys</key>'));
            assert_1.default.ok(result.includes('TestPolicy'));
            assert_1.default.ok(result.includes('Default Desc'));
        });
        test('should pass translations to policy manifests', () => {
            const translations = {
                'testModule': {
                    'test.desc': 'Translated Description'
                }
            };
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy], translations);
            assert_1.default.ok(result.includes('Translated Description'));
        });
        test('should include VS Code specific URLs', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('https://code.visualstudio.com/'));
            assert_1.default.ok(result.includes('https://code.visualstudio.com/docs/setup/enterprise'));
        });
        test('should include last modified date', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<key>pfm_last_modified</key>'));
            assert_1.default.ok(result.includes('<date>'));
        });
        test('should mark manifest as unique', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<key>pfm_unique</key>'));
            assert_1.default.ok(result.includes('<true/>'));
        });
        test('should handle multiple policies', () => {
            const policy2 = {
                ...mockPolicy,
                name: 'TestPolicy2',
                renderProfileManifest: () => `<dict>
<key>pfm_name</key>
<string>TestPolicy2</string>
</dict>`
            };
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy, policy2]);
            assert_1.default.ok(result.includes('TestPolicy'));
            assert_1.default.ok(result.includes('TestPolicy2'));
        });
        test('should set format version to 1', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<key>pfm_format_version</key>'));
            assert_1.default.ok(result.includes('<integer>1</integer>'));
        });
        test('should set interaction to combined', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<key>pfm_interaction</key>'));
            assert_1.default.ok(result.includes('<string>combined</string>'));
        });
        test('should set platform to macOS', () => {
            const result = (0, render_js_1.renderProfileManifest)('VS Code', 'com.microsoft.vscode', ['1.0'], [mockCategory], [mockPolicy]);
            assert_1.default.ok(result.includes('<key>pfm_platforms</key>'));
            assert_1.default.ok(result.includes('<string>macOS</string>'));
        });
    });
    suite('renderMacOSPolicy', () => {
        const mockCategory = {
            moduleName: 'testModule',
            name: { value: 'Test Category', nlsKey: 'test.category' }
        };
        const mockPolicy = {
            name: 'TestPolicy',
            type: types_js_1.PolicyType.Boolean,
            category: mockCategory,
            minimumVersion: '1.0',
            renderADMX: () => [],
            renderADMLStrings: () => [],
            renderADMLPresentation: () => '',
            renderProfile: () => ['<key>TestPolicy</key>', '<true/>'],
            renderProfileManifest: (translations) => `<dict>
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
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy], []);
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
            assert_1.default.strictEqual(result.profile, expected);
        });
        test('should include en-us manifest by default', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy], []);
            assert_1.default.strictEqual(result.manifests.length, 1);
            assert_1.default.strictEqual(result.manifests[0].languageId, 'en-us');
            assert_1.default.ok(result.manifests[0].contents.includes('VS Code Managed Settings'));
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
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy], translations);
            assert_1.default.strictEqual(result.manifests.length, 3); // en-us + 2 translations
            assert_1.default.strictEqual(result.manifests[0].languageId, 'en-us');
            assert_1.default.strictEqual(result.manifests[1].languageId, 'fr-fr');
            assert_1.default.strictEqual(result.manifests[2].languageId, 'de-de');
            assert_1.default.ok(result.manifests[1].contents.includes('Description Française'));
            assert_1.default.ok(result.manifests[2].contents.includes('Deutsche Beschreibung'));
        });
        test('should handle multiple policies with correct indentation', () => {
            const policy2 = {
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
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy, policy2], []);
            assert_1.default.ok(result.profile.includes('<key>TestPolicy</key>'));
            assert_1.default.ok(result.profile.includes('<true/>'));
            assert_1.default.ok(result.profile.includes('<key>TestPolicy2</key>'));
            assert_1.default.ok(result.profile.includes('<string>test value</string>'));
        });
        test('should use provided UUIDs in profile', () => {
            const product = {
                nameLong: 'My App',
                darwinBundleIdentifier: 'com.example.app',
                darwinProfilePayloadUUID: 'custom-payload-uuid',
                darwinProfileUUID: 'custom-uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy], []);
            assert_1.default.ok(result.profile.includes('<string>custom-payload-uuid</string>'));
            assert_1.default.ok(result.profile.includes('<string>custom-uuid</string>'));
            assert_1.default.ok(result.profile.includes('<string>com.example.app.custom-uuid</string>'));
        });
        test('should include enterprise documentation link', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy], []);
            assert_1.default.ok(result.profile.includes('https://code.visualstudio.com/docs/setup/enterprise'));
        });
        test('should set TargetDeviceType to 5', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderMacOSPolicy)(product, [mockPolicy], []);
            assert_1.default.ok(result.profile.includes('<key>TargetDeviceType</key>'));
            assert_1.default.ok(result.profile.includes('<integer>5</integer>'));
        });
    });
    suite('renderGP', () => {
        const mockCategory = {
            moduleName: 'testModule',
            name: { value: 'Test Category', nlsKey: 'test.category' }
        };
        const mockPolicy = {
            name: 'TestPolicy',
            type: types_js_1.PolicyType.Boolean,
            category: mockCategory,
            minimumVersion: '1.85',
            renderADMX: (regKey) => [
                `<policy name="TestPolicy" class="Both" displayName="$(string.TestPolicy)" key="Software\\Policies\\Microsoft\\${regKey}">`,
                `	<enabledValue><decimal value="1" /></enabledValue>`,
                `</policy>`
            ],
            renderADMLStrings: (translations) => [
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
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.admx);
            assert_1.default.ok(result.adml);
            assert_1.default.ok(Array.isArray(result.adml));
        });
        test('should include regKey in ADMX', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'CustomRegKey'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.admx.includes('CustomRegKey'));
            assert_1.default.ok(result.admx.includes('Software\\Policies\\Microsoft\\CustomRegKey'));
        });
        test('should include en-us ADML by default', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.strictEqual(result.adml.length, 1);
            assert_1.default.strictEqual(result.adml[0].languageId, 'en-us');
            assert_1.default.ok(result.adml[0].contents.includes('VS Code'));
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
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], translations);
            assert_1.default.strictEqual(result.adml.length, 3); // en-us + 2 translations
            assert_1.default.strictEqual(result.adml[0].languageId, 'en-us');
            assert_1.default.strictEqual(result.adml[1].languageId, 'fr-fr');
            assert_1.default.strictEqual(result.adml[2].languageId, 'de-de');
            assert_1.default.ok(result.adml[1].contents.includes('Politique de test'));
            assert_1.default.ok(result.adml[2].contents.includes('Testrichtlinie'));
        });
        test('should pass versions to ADMX', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.admx.includes('Supported_1_85'));
        });
        test('should pass versions to ADML', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.adml[0].contents.includes('VS Code &gt;= 1.85'));
        });
        test('should pass categories to ADMX', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.admx.includes('test.category'));
        });
        test('should pass categories to ADML', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.adml[0].contents.includes('Category_test_category'));
        });
        test('should handle multiple policies', () => {
            const policy2 = {
                ...mockPolicy,
                name: 'TestPolicy2',
                renderADMX: (regKey) => [
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
            const result = (0, render_js_1.renderGP)(product, [mockPolicy, policy2], []);
            assert_1.default.ok(result.admx.includes('TestPolicy'));
            assert_1.default.ok(result.admx.includes('TestPolicy2'));
            assert_1.default.ok(result.adml[0].contents.includes('TestPolicy'));
            assert_1.default.ok(result.adml[0].contents.includes('TestPolicy2'));
        });
        test('should include app name in ADML', () => {
            const product = {
                nameLong: 'My Custom App',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok(result.adml[0].contents.includes('My Custom App'));
        });
        test('should return structured result with admx and adml properties', () => {
            const product = {
                nameLong: 'VS Code',
                darwinBundleIdentifier: 'com.microsoft.vscode',
                darwinProfilePayloadUUID: 'payload-uuid',
                darwinProfileUUID: 'uuid',
                win32RegValueName: 'VSCode'
            };
            const result = (0, render_js_1.renderGP)(product, [mockPolicy], []);
            assert_1.default.ok('admx' in result);
            assert_1.default.ok('adml' in result);
            assert_1.default.strictEqual(typeof result.admx, 'string');
            assert_1.default.ok(Array.isArray(result.adml));
        });
    });
    suite('renderJsonPolicies', () => {
        const mockCategory = {
            moduleName: 'testModule',
            name: { value: 'Test Category', nlsKey: 'test.category' }
        };
        test('should render boolean policy JSON value', () => {
            const booleanPolicy = {
                name: 'BooleanPolicy',
                type: types_js_1.PolicyType.Boolean,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => false
            };
            const result = (0, render_js_1.renderJsonPolicies)([booleanPolicy]);
            assert_1.default.deepStrictEqual(result, { BooleanPolicy: false });
        });
        test('should render number policy JSON value', () => {
            const numberPolicy = {
                name: 'NumberPolicy',
                type: types_js_1.PolicyType.Number,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => 42
            };
            const result = (0, render_js_1.renderJsonPolicies)([numberPolicy]);
            assert_1.default.deepStrictEqual(result, { NumberPolicy: 42 });
        });
        test('should render string policy JSON value', () => {
            const stringPolicy = {
                name: 'StringPolicy',
                type: types_js_1.PolicyType.String,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => ''
            };
            const result = (0, render_js_1.renderJsonPolicies)([stringPolicy]);
            assert_1.default.deepStrictEqual(result, { StringPolicy: '' });
        });
        test('should render string enum policy JSON value', () => {
            const stringEnumPolicy = {
                name: 'StringEnumPolicy',
                type: types_js_1.PolicyType.StringEnum,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => 'auto'
            };
            const result = (0, render_js_1.renderJsonPolicies)([stringEnumPolicy]);
            assert_1.default.deepStrictEqual(result, { StringEnumPolicy: 'auto' });
        });
        test('should render object policy JSON value', () => {
            const objectPolicy = {
                name: 'ObjectPolicy',
                type: types_js_1.PolicyType.Object,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => ''
            };
            const result = (0, render_js_1.renderJsonPolicies)([objectPolicy]);
            assert_1.default.deepStrictEqual(result, { ObjectPolicy: '' });
        });
        test('should render multiple policies', () => {
            const booleanPolicy = {
                name: 'BooleanPolicy',
                type: types_js_1.PolicyType.Boolean,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => true
            };
            const numberPolicy = {
                name: 'NumberPolicy',
                type: types_js_1.PolicyType.Number,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => 100
            };
            const stringPolicy = {
                name: 'StringPolicy',
                type: types_js_1.PolicyType.String,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => 'test-value'
            };
            const result = (0, render_js_1.renderJsonPolicies)([booleanPolicy, numberPolicy, stringPolicy]);
            assert_1.default.deepStrictEqual(result, {
                BooleanPolicy: true,
                NumberPolicy: 100,
                StringPolicy: 'test-value'
            });
        });
        test('should handle empty policies array', () => {
            const result = (0, render_js_1.renderJsonPolicies)([]);
            assert_1.default.deepStrictEqual(result, {});
        });
        test('should handle null JSON value', () => {
            const nullPolicy = {
                name: 'NullPolicy',
                type: types_js_1.PolicyType.String,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => null
            };
            const result = (0, render_js_1.renderJsonPolicies)([nullPolicy]);
            assert_1.default.deepStrictEqual(result, { NullPolicy: null });
        });
        test('should handle object JSON value', () => {
            const objectPolicy = {
                name: 'ComplexObjectPolicy',
                type: types_js_1.PolicyType.Object,
                category: mockCategory,
                minimumVersion: '1.0',
                renderADMX: () => [],
                renderADMLStrings: () => [],
                renderADMLPresentation: () => '',
                renderProfile: () => [],
                renderProfileManifest: () => '',
                renderJsonValue: () => ({ nested: { value: 123 } })
            };
            const result = (0, render_js_1.renderJsonPolicies)([objectPolicy]);
            assert_1.default.deepStrictEqual(result, { ComplexObjectPolicy: { nested: { value: 123 } } });
        });
    });
});
//# sourceMappingURL=render.test.js.map