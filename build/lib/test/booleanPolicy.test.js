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
const booleanPolicy_js_1 = require("../policies/booleanPolicy.js");
const types_js_1 = require("../policies/types.js");
suite('BooleanPolicy', () => {
    const mockCategory = {
        key: 'test.category',
        name: { value: 'Category1', key: 'test.category' },
    };
    const mockPolicy = {
        key: 'test.boolean.policy',
        name: 'TestBooleanPolicy',
        category: 'Category1',
        minimumVersion: '1.0',
        type: 'boolean',
        localization: {
            description: { key: 'test.policy.description', value: 'Test policy description' }
        }
    };
    test('should create BooleanPolicy from factory method', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        assert_1.default.strictEqual(policy.name, 'TestBooleanPolicy');
        assert_1.default.strictEqual(policy.minimumVersion, '1.0');
        assert_1.default.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
        assert_1.default.strictEqual(policy.category.name.value, mockCategory.name.value);
        assert_1.default.strictEqual(policy.type, types_js_1.PolicyType.Boolean);
    });
    test('should render ADMX elements correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admx = policy.renderADMX('TestKey');
        assert_1.default.deepStrictEqual(admx, [
            '<policy name="TestBooleanPolicy" class="Both" displayName="$(string.TestBooleanPolicy)" explainText="$(string.TestBooleanPolicy_test_policy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestBooleanPolicy)">',
            '\t<parentCategory ref="test.category" />',
            '\t<supportedOn ref="Supported_1_0" />',
            '\t<elements>',
            '<boolean id="TestBooleanPolicy" valueName="TestBooleanPolicy">',
            '\t<trueValue><decimal value="1" /></trueValue><falseValue><decimal value="0" /></falseValue>',
            '</boolean>',
            '\t</elements>',
            '</policy>'
        ]);
    });
    test('should render ADML strings correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admlStrings = policy.renderADMLStrings();
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestBooleanPolicy">TestBooleanPolicy</string>',
            '<string id="TestBooleanPolicy_test_policy_description">Test policy description</string>'
        ]);
    });
    test('should render ADML strings with translations', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated description'
            }
        };
        const admlStrings = policy.renderADMLStrings(translations);
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestBooleanPolicy">TestBooleanPolicy</string>',
            '<string id="TestBooleanPolicy_test_policy_description">Translated description</string>'
        ]);
    });
    test('should render ADML presentation correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const presentation = policy.renderADMLPresentation();
        assert_1.default.strictEqual(presentation, '<presentation id="TestBooleanPolicy"><checkBox refId="TestBooleanPolicy">TestBooleanPolicy</checkBox></presentation>');
    });
    test('should render JSON value correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const jsonValue = policy.renderJsonValue();
        assert_1.default.strictEqual(jsonValue, false);
    });
    test('should render profile value correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profileValue = policy.renderProfileValue();
        assert_1.default.strictEqual(profileValue, '<false/>');
    });
    test('should render profile correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profile = policy.renderProfile();
        assert_1.default.strictEqual(profile.length, 2);
        assert_1.default.strictEqual(profile[0], '<key>TestBooleanPolicy</key>');
        assert_1.default.strictEqual(profile[1], '<false/>');
    });
    test('should render profile manifest value correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifestValue = policy.renderProfileManifestValue();
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<false/>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_title</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_type</key>\n<string>boolean</string>');
    });
    test('should render profile manifest value with translations', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated manifest description'
            }
        };
        const manifestValue = policy.renderProfileManifestValue(translations);
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<false/>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_title</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_type</key>\n<string>boolean</string>');
    });
    test('should render profile manifest correctly', () => {
        const policy = booleanPolicy_js_1.BooleanPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifest = policy.renderProfileManifest();
        assert_1.default.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<false/>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_title</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_type</key>\n<string>boolean</string>\n</dict>');
    });
});
//# sourceMappingURL=booleanPolicy.test.js.map