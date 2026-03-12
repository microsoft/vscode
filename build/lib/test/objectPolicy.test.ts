/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ObjectPolicy } from '../policies/objectPolicy.ts';
import { type LanguageTranslations, PolicyType } from '../policies/types.ts';
import type { CategoryDto, PolicyDto } from '../policies/policyDto.ts';

suite('ObjectPolicy', () => {
	const mockCategory: CategoryDto = {
		key: 'test.category',
		name: { value: 'Category1', key: 'test.category' },
	};

	const mockPolicy: PolicyDto = {
		key: 'test.object.policy',
		name: 'TestObjectPolicy',
		category: 'Category1',
		minimumVersion: '1.0',
		type: 'object',
		localization: {
			description: { key: 'test.policy.description', value: 'Test policy description' }
		}
	};

	test('should create ObjectPolicy from factory method', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);
		assert.strictEqual(policy.name, 'TestObjectPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category.name.nlsKey, mockCategory.name.key);
		assert.strictEqual(policy.category.name.value, mockCategory.name.value);
		assert.strictEqual(policy.type, PolicyType.Object);
	});

	test('should render ADMX elements correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
			'<policy name="TestObjectPolicy" class="Both" displayName="$(string.TestObjectPolicy)" explainText="$(string.TestObjectPolicy_test_policy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestObjectPolicy)">',
			'\t<parentCategory ref="test.category" />',
			'\t<supportedOn ref="Supported_1_0" />',
			'\t<elements>',
			'<multiText id="TestObjectPolicy" valueName="TestObjectPolicy" required="true" />',
			'\t</elements>',
			'</policy>'
		]);
	});

	test('should render ADML strings correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const admlStrings = policy.renderADMLStrings();

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestObjectPolicy">TestObjectPolicy</string>',
			'<string id="TestObjectPolicy_test_policy_description">Test policy description</string>'
		]);
	});

	test('should render ADML strings with translations', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const translations: LanguageTranslations = {
			'': {
				'test.policy.description': 'Translated description'
			}
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestObjectPolicy">TestObjectPolicy</string>',
			'<string id="TestObjectPolicy_test_policy_description">Translated description</string>'
		]);
	});

	test('should render ADML presentation correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const presentation = policy.renderADMLPresentation();

		assert.strictEqual(presentation, '<presentation id="TestObjectPolicy"><multiTextBox refId="TestObjectPolicy" /></presentation>');
	});

	test('should render JSON value correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const jsonValue = policy.renderJsonValue();

		assert.strictEqual(jsonValue, '');
	});

	test('should render profile value correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<string></string>');
	});

	test('should render profile correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestObjectPolicy</key>');
		assert.strictEqual(profile[1], '<string></string>');
	});

	test('should render profile manifest value correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const manifestValue = policy.renderProfileManifestValue();

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestObjectPolicy</string>\n<key>pfm_title</key>\n<string>TestObjectPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n');
	});

	test('should render profile manifest value with translations', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const translations: LanguageTranslations = {
			'': {
				'test.policy.description': 'Translated manifest description'
			}
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestObjectPolicy</string>\n<key>pfm_title</key>\n<string>TestObjectPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n');
	});

	test('should render profile manifest correctly', () => {
		const policy = ObjectPolicy.from(mockCategory, mockPolicy);

		assert.ok(policy);

		const manifest = policy.renderProfileManifest();

		assert.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestObjectPolicy</string>\n<key>pfm_title</key>\n<string>TestObjectPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n\n</dict>');
	});
});
