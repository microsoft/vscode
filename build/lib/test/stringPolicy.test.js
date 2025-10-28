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
const stringPolicy_js_1 = require("../policies/stringPolicy.js");
const types_js_1 = require("../policies/types.js");
suite('StringPolicy', () => {
    const mockCategory = {
        key: 'test.category',
        name: { value: 'Category1', key: 'test.category' },
    };
    const mockPolicy = {
        key: 'test.string.policy',
        name: 'TestStringPolicy',
        category: 'Category1',
        minimumVersion: '1.0',
        type: 'string',
        default: '',
        localization: {
            description: { key: 'test.policy.description', value: 'Test string policy description' }
        }
    };
    test('should create StringPolicy from factory method', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        assert_1.default.strictEqual(policy.name, 'TestStringPolicy');
        assert_1.default.strictEqual(policy.minimumVersion, '1.0');
        assert_1.default.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
        assert_1.default.strictEqual(policy.category.name.value, mockCategory.name.value);
        assert_1.default.strictEqual(policy.type, types_js_1.PolicyType.String);
    });
    test('should render ADMX elements correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admx = policy.renderADMX('TestKey');
        assert_1.default.deepStrictEqual(admx, [
            '<policy name="TestStringPolicy" class="Both" displayName="$(string.TestStringPolicy)" explainText="$(string.TestStringPolicy_test_policy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestStringPolicy)">',
            '\t<parentCategory ref="test.category" />',
            '\t<supportedOn ref="Supported_1_0" />',
            '\t<elements>',
            '<text id="TestStringPolicy" valueName="TestStringPolicy" required="true" />',
            '\t</elements>',
            '</policy>'
        ]);
    });
    test('should render ADML strings correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admlStrings = policy.renderADMLStrings();
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestStringPolicy">TestStringPolicy</string>',
            '<string id="TestStringPolicy_test_policy_description">Test string policy description</string>'
        ]);
    });
    test('should render ADML strings with translations', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated description'
            }
        };
        const admlStrings = policy.renderADMLStrings(translations);
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestStringPolicy">TestStringPolicy</string>',
            '<string id="TestStringPolicy_test_policy_description">Translated description</string>'
        ]);
    });
    test('should render ADML presentation correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const presentation = policy.renderADMLPresentation();
        assert_1.default.strictEqual(presentation, '<presentation id="TestStringPolicy"><textBox refId="TestStringPolicy"><label>TestStringPolicy:</label></textBox></presentation>');
    });
    test('should render JSON value correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const jsonValue = policy.renderJsonValue();
        assert_1.default.strictEqual(jsonValue, '');
    });
    test('should render profile value correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profileValue = policy.renderProfileValue();
        assert_1.default.strictEqual(profileValue, '<string></string>');
    });
    test('should render profile correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profile = policy.renderProfile();
        assert_1.default.strictEqual(profile.length, 2);
        assert_1.default.strictEqual(profile[0], '<key>TestStringPolicy</key>');
        assert_1.default.strictEqual(profile[1], '<string></string>');
    });
    test('should render profile manifest value correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifestValue = policy.renderProfileManifestValue();
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test string policy description</string>\n<key>pfm_name</key>\n<string>TestStringPolicy</string>\n<key>pfm_title</key>\n<string>TestStringPolicy</string>\n<key>pfm_type</key>\n<string>string</string>');
    });
    test('should render profile manifest value with translations', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated manifest description'
            }
        };
        const manifestValue = policy.renderProfileManifestValue(translations);
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestStringPolicy</string>\n<key>pfm_title</key>\n<string>TestStringPolicy</string>\n<key>pfm_type</key>\n<string>string</string>');
    });
    test('should render profile manifest correctly', () => {
        const policy = stringPolicy_js_1.StringPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifest = policy.renderProfileManifest();
        assert_1.default.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test string policy description</string>\n<key>pfm_name</key>\n<string>TestStringPolicy</string>\n<key>pfm_title</key>\n<string>TestStringPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n</dict>');
    });
});
//# sourceMappingURL=stringPolicy.test.js.map