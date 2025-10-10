/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StringPolicy } from '../../../../node/writer/policies/stringPolicy.js';
import { IPolicy, PolicyCategory } from '../../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../../configuration/common/configurationRegistry.js';
import { Category, NlsString, LanguageTranslations, PolicyType } from '../../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('StringPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mockCategory: Category = {
		name: { value: 'Test Category', nlsKey: 'test.category' }
	};

	const mockPolicy: IPolicy = {
		name: 'TestStringPolicy',
		category: PolicyCategory.Extensions,
		minimumVersion: '1.0',
		localization: {
			description: { key: 'test.stringpolicy.description', value: 'Test string policy description' }
		}
	};

	const mockPolicyDescription: NlsString = {
		value: 'Test string policy description',
		nlsKey: 'test.stringpolicy.description'
	};

	const mockConfig: IConfigurationPropertySchema = {
		type: 'string',
		default: ''
	};

	test('should create StringPolicy from factory method', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		assert.strictEqual(policy.name, 'TestStringPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category, mockCategory);
		assert.strictEqual(policy.type, PolicyType.String);
	});

	test('should render ADMX elements correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
			'<policy name="TestStringPolicy" class="Both" displayName="$(string.TestStringPolicy)" explainText="$(string.TestStringPolicy_test_stringpolicy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestStringPolicy)">',
			'\t<parentCategory ref="test.category" />',
			'\t<supportedOn ref="Supported_1_0" />',
			'\t<elements>',
			'<text id="TestStringPolicy" valueName="TestStringPolicy" required="true" />',
			'\t</elements>',
			'</policy>'
		]);
	});

	test('should render ADML strings correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admlStrings = policy.renderADMLStrings();

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestStringPolicy">TestStringPolicy</string>',
			'<string id="TestStringPolicy_test_stringpolicy_description">Test string policy description</string>'
		]);
	});

	test('should render ADML strings with translations', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.stringpolicy.description': 'Translated string description'
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestStringPolicy">TestStringPolicy</string>',
			'<string id="TestStringPolicy_test_stringpolicy_description">Translated string description</string>'
		]);
	});

	test('should render ADML presentation correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const presentation = policy.renderADMLPresentation();

		assert.strictEqual(presentation, '<presentation id="TestStringPolicy"><textBox refId="TestStringPolicy"><label>TestStringPolicy:</label></textBox></presentation>');
	});

	test('should render profile value correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<string></string>');
	});

	test('should render profile correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestStringPolicy</key>');
		assert.strictEqual(profile[1], '<string></string>');
	});

	test('should render profile manifest value correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifestValue = policy.renderProfileManifestValue();

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test string policy description</string>\n<key>pfm_name</key>\n<string>TestStringPolicy</string>\n<key>pfm_title</key>\n<string>TestStringPolicy</string>\n<key>pfm_type</key>\n<string>string</string>');
	});

	test('should render profile manifest value with translations', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.stringpolicy.description': 'Translated manifest string'
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Translated manifest string</string>\n<key>pfm_name</key>\n<string>TestStringPolicy</string>\n<key>pfm_title</key>\n<string>TestStringPolicy</string>\n<key>pfm_type</key>\n<string>string</string>');
	});

	test('should render profile manifest correctly', () => {
		const policy = StringPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifest = policy.renderProfileManifest();

		assert.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test string policy description</string>\n<key>pfm_name</key>\n<string>TestStringPolicy</string>\n<key>pfm_title</key>\n<string>TestStringPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n</dict>');
	});
});
