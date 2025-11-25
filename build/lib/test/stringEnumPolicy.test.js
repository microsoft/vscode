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
const stringEnumPolicy_js_1 = require("../policies/stringEnumPolicy.js");
const types_js_1 = require("../policies/types.js");
suite('StringEnumPolicy', () => {
    const mockCategory = {
        key: 'test.category',
        name: { value: 'Category1', key: 'test.category' },
    };
    const mockPolicy = {
        key: 'test.stringenum.policy',
        name: 'TestStringEnumPolicy',
        category: 'Category1',
        minimumVersion: '1.0',
        type: 'string',
        localization: {
            description: { key: 'test.policy.description', value: 'Test policy description' },
            enumDescriptions: [
                { key: 'test.option.one', value: 'Option One' },
                { key: 'test.option.two', value: 'Option Two' },
                { key: 'test.option.three', value: 'Option Three' }
            ]
        },
        enum: ['auto', 'manual', 'disabled']
    };
    test('should create StringEnumPolicy from factory method', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        assert_1.default.strictEqual(policy.name, 'TestStringEnumPolicy');
        assert_1.default.strictEqual(policy.minimumVersion, '1.0');
        assert_1.default.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
        assert_1.default.strictEqual(policy.category.name.value, mockCategory.name.value);
        assert_1.default.strictEqual(policy.type, types_js_1.PolicyType.StringEnum);
    });
    test('should render ADMX elements correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admx = policy.renderADMX('TestKey');
        assert_1.default.deepStrictEqual(admx, [
            '<policy name="TestStringEnumPolicy" class="Both" displayName="$(string.TestStringEnumPolicy)" explainText="$(string.TestStringEnumPolicy_test_policy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestStringEnumPolicy)">',
            '\t<parentCategory ref="test.category" />',
            '\t<supportedOn ref="Supported_1_0" />',
            '\t<elements>',
            '<enum id="TestStringEnumPolicy" valueName="TestStringEnumPolicy">',
            '\t<item displayName="$(string.TestStringEnumPolicy_test_option_one)"><value><string>auto</string></value></item>',
            '\t<item displayName="$(string.TestStringEnumPolicy_test_option_two)"><value><string>manual</string></value></item>',
            '\t<item displayName="$(string.TestStringEnumPolicy_test_option_three)"><value><string>disabled</string></value></item>',
            '</enum>',
            '\t</elements>',
            '</policy>'
        ]);
    });
    test('should render ADML strings correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const admlStrings = policy.renderADMLStrings();
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestStringEnumPolicy">TestStringEnumPolicy</string>',
            '<string id="TestStringEnumPolicy_test_policy_description">Test policy description</string>',
            '<string id="TestStringEnumPolicy_test_option_one">Option One</string>',
            '<string id="TestStringEnumPolicy_test_option_two">Option Two</string>',
            '<string id="TestStringEnumPolicy_test_option_three">Option Three</string>'
        ]);
    });
    test('should render ADML strings with translations', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated description',
                'test.option.one': 'Translated Option One',
                'test.option.two': 'Translated Option Two'
            }
        };
        const admlStrings = policy.renderADMLStrings(translations);
        assert_1.default.deepStrictEqual(admlStrings, [
            '<string id="TestStringEnumPolicy">TestStringEnumPolicy</string>',
            '<string id="TestStringEnumPolicy_test_policy_description">Translated description</string>',
            '<string id="TestStringEnumPolicy_test_option_one">Translated Option One</string>',
            '<string id="TestStringEnumPolicy_test_option_two">Translated Option Two</string>',
            '<string id="TestStringEnumPolicy_test_option_three">Option Three</string>'
        ]);
    });
    test('should render ADML presentation correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const presentation = policy.renderADMLPresentation();
        assert_1.default.strictEqual(presentation, '<presentation id="TestStringEnumPolicy"><dropdownList refId="TestStringEnumPolicy" /></presentation>');
    });
    test('should render JSON value correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const jsonValue = policy.renderJsonValue();
        assert_1.default.strictEqual(jsonValue, 'auto');
    });
    test('should render profile value correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profileValue = policy.renderProfileValue();
        assert_1.default.strictEqual(profileValue, '<string>auto</string>');
    });
    test('should render profile correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const profile = policy.renderProfile();
        assert_1.default.strictEqual(profile.length, 2);
        assert_1.default.strictEqual(profile[0], '<key>TestStringEnumPolicy</key>');
        assert_1.default.strictEqual(profile[1], '<string>auto</string>');
    });
    test('should render profile manifest value correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifestValue = policy.renderProfileManifestValue();
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<string>auto</string>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_title</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n<key>pfm_range_list</key>\n<array>\n\t<string>auto</string>\n\t<string>manual</string>\n\t<string>disabled</string>\n</array>');
    });
    test('should render profile manifest value with translations', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const translations = {
            '': {
                'test.policy.description': 'Translated manifest description'
            }
        };
        const manifestValue = policy.renderProfileManifestValue(translations);
        assert_1.default.strictEqual(manifestValue, '<key>pfm_default</key>\n<string>auto</string>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_title</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n<key>pfm_range_list</key>\n<array>\n\t<string>auto</string>\n\t<string>manual</string>\n\t<string>disabled</string>\n</array>');
    });
    test('should render profile manifest correctly', () => {
        const policy = stringEnumPolicy_js_1.StringEnumPolicy.from(mockCategory, mockPolicy);
        assert_1.default.ok(policy);
        const manifest = policy.renderProfileManifest();
        assert_1.default.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<string>auto</string>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_title</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n<key>pfm_range_list</key>\n<array>\n\t<string>auto</string>\n\t<string>manual</string>\n\t<string>disabled</string>\n</array>\n</dict>');
    });
});
//# sourceMappingURL=stringEnumPolicy.test.js.map