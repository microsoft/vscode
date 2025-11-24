/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StringEnumPolicy } from '../policies/stringEnumPolicy.ts';
import { PolicyType, type LanguageTranslations } from '../policies/types.ts';
import type { CategoryDto, PolicyDto } from '../policies/policyDto.ts';

suite('StringEnumPolicy', () => {
	const mockCategory: CategoryDto = {
		key: 'test.category',
		name: { value: 'Category1', key: 'test.category' },
	};

	const mockPolicy: PolicyDto = {
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
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);
		assert.strictEqual(policy.name, 'TestStringEnumPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
		assert.strictEqual(policy.category.name.value, mockCategory.name.value);
		assert.strictEqual(policy.type, PolicyType.StringEnum);
	});

	test('should render ADMX elements correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
			'<policy name="TestStringEnumPolicy" class="Both" displayName="$(string.TestStringEnumPolicy)" explainText="$(string.TestStringEnumPolicy_test_policy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestStringEnumPolicy)">',
			'\t<parentCategory ref="test.category" />',
			'\t<supportedOn ref="Supported_1_0" />',
			'\t<elements>',
			'<enum id="TestStringEnumPolicy" valueName="TestStringEnumPolicy">',
			'\t<item displayName="$(string.TestStringEnumPolicy_test.option.one)"><value><string>auto</string></value></item>',
			'\t<item displayName="$(string.TestStringEnumPolicy_test.option.two)"><value><string>manual</string></value></item>',
			'\t<item displayName="$(string.TestStringEnumPolicy_test.option.three)"><value><string>disabled</string></value></item>',
			'</enum>',
			'\t</elements>',
			'</policy>'
		]);
	});

	test('should render ADML strings correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const admlStrings = policy.renderADMLStrings();

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestStringEnumPolicy">TestStringEnumPolicy</string>',
			'<string id="TestStringEnumPolicy_test_policy_description">Test policy description</string>',
			'<string id="TestStringEnumPolicy_test_option_one">Option One</string>',
			'<string id="TestStringEnumPolicy_test_option_two">Option Two</string>',
			'<string id="TestStringEnumPolicy_test_option_three">Option Three</string>'
		]);
	});

	test('should render ADML strings with translations', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const translations: LanguageTranslations = {
			'': {
				'test.policy.description': 'Translated description',
				'test.option.one': 'Translated Option One',
				'test.option.two': 'Translated Option Two'
			}
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestStringEnumPolicy">TestStringEnumPolicy</string>',
			'<string id="TestStringEnumPolicy_test_policy_description">Translated description</string>',
			'<string id="TestStringEnumPolicy_test_option_one">Translated Option One</string>',
			'<string id="TestStringEnumPolicy_test_option_two">Translated Option Two</string>',
			'<string id="TestStringEnumPolicy_test_option_three">Option Three</string>'
		]);
	});

	test('should render ADML presentation correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const presentation = policy.renderADMLPresentation();

		assert.strictEqual(presentation, '<presentation id="TestStringEnumPolicy"><dropdownList refId="TestStringEnumPolicy" /></presentation>');
	});

	test('should render JSON value correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const jsonValue = policy.renderJsonValue();

		assert.strictEqual(jsonValue, 'auto');
	});

	test('should render profile value correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<string>auto</string>');
	});

	test('should render profile correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestStringEnumPolicy</key>');
		assert.strictEqual(profile[1], '<string>auto</string>');
	});

	test('should render profile manifest value correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const manifestValue = policy.renderProfileManifestValue();

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string>auto</string>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_title</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n<key>pfm_range_list</key>\n<array>\n\t<string>auto</string>\n\t<string>manual</string>\n\t<string>disabled</string>\n</array>');
	});

	test('should render profile manifest value with translations', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const translations: LanguageTranslations = {
			'': {
				'test.policy.description': 'Translated manifest description'
			}
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string>auto</string>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_title</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n<key>pfm_range_list</key>\n<array>\n\t<string>auto</string>\n\t<string>manual</string>\n\t<string>disabled</string>\n</array>');
	});

	test('should render profile manifest correctly', () => {
		const policy = StringEnumPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const manifest = policy.renderProfileManifest();

		assert.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<string>auto</string>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_title</key>\n<string>TestStringEnumPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n<key>pfm_range_list</key>\n<array>\n\t<string>auto</string>\n\t<string>manual</string>\n\t<string>disabled</string>\n</array>\n</dict>');
	});
});
