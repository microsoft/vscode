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
const numberPolicy_js_1 = require("../policies/numberPolicy.js");
const types_js_1 = require("../policies/types.js");
suite('NumberPolicy', () => {
    const mockCategory = {
        key: 'test.category',
        name: { value: 'Category1', key: 'test.category' },
    };
    const mockPolicy = {
        key: 'test.number.policy',
        name: 'TestNumberPolicy',
        category: 'Category1',
        minimumVersion: '1.0',
        type: 'number',
        default: 42,
        localization: {
            description: { key: 'test.policy.description', value: 'Test number policy description' }
        }
    };
    test('should create NumberPolicy from factory method', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        assert_1.default.strictEqual(policy.name, 'TestNumberPolicy');
        assert_1.default.strictEqual(policy.minimumVersion, '1.0');
        assert_1.default.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
        assert_1.default.strictEqual(policy.category.name.value, mockCategory.name.value);
        assert_1.default.strictEqual(policy.type, types_js_1.PolicyType.Number);
    });
    test('should render ADMX elements correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admx = policy.renderADMX('TestKey');
        assert_1.default.deepStrictEqual(admx, [
            '<policy name="TestNumberPolicy" class="Both" displayName="$(string.TestNumberPolicy)" explainText="$(string.TestNumberPolicy_test_policy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestNumberPolicy)">',
            '\t<parentCategory ref="test.category" />',
            '\t<supportedOn ref="Supported_1_0" />',
            '\t<elements>',
            '<decimal id="TestNumberPolicy" valueName="TestNumberPolicy" />',
            '\t</elements>',
            '</policy>'
        ]);
    });
    test('should render ADML strings correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admlStrings = policy.renderADMLStrings();
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestNumberPolicy">TestNumberPolicy</string>',
            '<string id="TestNumberPolicy_test_policy_description">Test number policy description</string>'
        ]);
    });
    test('should render ADML strings with translations', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated description'
            }
        };
        const admlStrings = policy.renderADMLStrings(translations);
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestNumberPolicy">TestNumberPolicy</string>',
            '<string id="TestNumberPolicy_test_policy_description">Translated description</string>'
        ]);
    });
    test('should render ADML presentation correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const presentation = policy.renderADMLPresentation();
        assert_1.default.strictEqual(presentation, '<presentation id="TestNumberPolicy"><decimalTextBox refId="TestNumberPolicy" defaultValue="42">TestNumberPolicy</decimalTextBox></presentation>');
    });
    test('should render JSON value correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const jsonValue = policy.renderJsonValue();
        assert_1.default.strictEqual(jsonValue, 42);
    });
    test('should render profile value correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profileValue = policy.renderProfileValue();
        assert_1.default.strictEqual(profileValue, '<integer>42</integer>');
    });
    test('should render profile correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profile = policy.renderProfile();
        assert_1.default.strictEqual(profile.length, 2);
        assert_1.default.strictEqual(profile[0], '<key>TestNumberPolicy</key>');
        assert_1.default.strictEqual(profile[1], '<integer>42</integer>');
    });
    test('should render profile manifest value correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifestValue = policy.renderProfileManifestValue();
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<integer>42</integer>\n<key>pfm_description</key>\n<string>Test number policy description</string>\n<key>pfm_name</key>\n<string>TestNumberPolicy</string>\n<key>pfm_title</key>\n<string>TestNumberPolicy</string>\n<key>pfm_type</key>\n<string>integer</string>');
    });
    test('should render profile manifest value with translations', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated manifest description'
            }
        };
        const manifestValue = policy.renderProfileManifestValue(translations);
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<integer>42</integer>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestNumberPolicy</string>\n<key>pfm_title</key>\n<string>TestNumberPolicy</string>\n<key>pfm_type</key>\n<string>integer</string>');
    });
    test('should render profile manifest correctly', () => {
        const policy = numberPolicy_js_1.NumberPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifest = policy.renderProfileManifest();
        assert_1.default.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<integer>42</integer>\n<key>pfm_description</key>\n<string>Test number policy description</string>\n<key>pfm_name</key>\n<string>TestNumberPolicy</string>\n<key>pfm_title</key>\n<string>TestNumberPolicy</string>\n<key>pfm_type</key>\n<string>integer</string>\n</dict>');
    });
});
//# sourceMappingURL=numberPolicy.test.js.map