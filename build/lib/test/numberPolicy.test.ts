/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NumberPolicy } from '../policies/numberPolicy.ts';
import { type LanguageTranslations, PolicyType } from '../policies/types.ts';
import type { CategoryDto, PolicyDto } from '../policies/policyDto.ts';

suite('NumberPolicy', () => {
	const mockCategory: CategoryDto = {
		key: 'test.category',
		name: { value: 'Category1', key: 'test.category' },
	};

	const mockPolicy: PolicyDto = {
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
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);
		assert.strictEqual(policy.name, 'TestNumberPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
		assert.strictEqual(policy.category.name.value, mockCategory.name.value);
		assert.strictEqual(policy.type, PolicyType.Number);
	});

	test('should render ADMX elements correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
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
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const admlStrings = policy.renderADMLStrings();

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestNumberPolicy">TestNumberPolicy</string>',
			'<string id="TestNumberPolicy_test_policy_description">Test number policy description</string>'
		]);
	});

	test('should render ADML strings with translations', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const translations: LanguageTranslations = {
			'': {
				'test.policy.description': 'Translated description'
			}
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestNumberPolicy">TestNumberPolicy</string>',
			'<string id="TestNumberPolicy_test_policy_description">Translated description</string>'
		]);
	});

	test('should render ADML presentation correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const presentation = policy.renderADMLPresentation();

		assert.strictEqual(presentation, '<presentation id="TestNumberPolicy"><decimalTextBox refId="TestNumberPolicy" defaultValue="42">TestNumberPolicy</decimalTextBox></presentation>');
	});

	test('should render JSON value correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const jsonValue = policy.renderJsonValue();

		assert.strictEqual(jsonValue, 42);
	});

	test('should render profile value correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<integer>42</integer>');
	});

	test('should render profile correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestNumberPolicy</key>');
		assert.strictEqual(profile[1], '<integer>42</integer>');
	});

	test('should render profile manifest value correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const manifestValue = policy.renderProfileManifestValue();

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<integer>42</integer>\n<key>pfm_description</key>\n<string>Test number policy description</string>\n<key>pfm_name</key>\n<string>TestNumberPolicy</string>\n<key>pfm_title</key>\n<string>TestNumberPolicy</string>\n<key>pfm_type</key>\n<string>integer</string>');
	});

	test('should render profile manifest value with translations', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const translations: LanguageTranslations = {
			'': {
				'test.policy.description': 'Translated manifest description'
			}
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<integer>42</integer>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestNumberPolicy</string>\n<key>pfm_title</key>\n<string>TestNumberPolicy</string>\n<key>pfm_type</key>\n<string>integer</string>');
	});

	test('should render profile manifest correctly', () => {
		const policy = NumberPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const manifest = policy.renderProfileManifest();

		assert.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<integer>42</integer>\n<key>pfm_description</key>\n<string>Test number policy description</string>\n<key>pfm_name</key>\n<string>TestNumberPolicy</string>\n<key>pfm_title</key>\n<string>TestNumberPolicy</string>\n<key>pfm_type</key>\n<string>integer</string>\n</dict>');
	});
});
