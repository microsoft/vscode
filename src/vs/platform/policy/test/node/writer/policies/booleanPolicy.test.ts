/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { BooleanPolicy } from '../../../../node/writer/policies/booleanPolicy.js';
import { IPolicy, PolicyCategory } from '../../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../../configuration/common/configurationRegistry.js';
import { Category, NlsString, LanguageTranslations, PolicyType } from '../../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('BooleanPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mockCategory: Category = {
		name: { value: 'Test Category', nlsKey: 'test.category' }
	};

	const mockPolicy: IPolicy = {
		name: 'TestBooleanPolicy',
		category: PolicyCategory.Extensions,
		minimumVersion: '1.0',
		localization: {
			description: { key: 'test.policy.description', value: 'Test policy description' }
		}
	};

	const mockPolicyDescription: NlsString = {
		value: 'Test policy description',
		nlsKey: 'test.policy.description'
	};

	const mockConfig: IConfigurationPropertySchema = {
		type: 'boolean',
		default: false
	};

	test('should create BooleanPolicy from factory method', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		assert.strictEqual(policy.name, 'TestBooleanPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category, mockCategory);
		assert.strictEqual(policy.type, PolicyType.Boolean);
	});

	test('should render ADMX elements correctly', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
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
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admlStrings = policy.renderADMLStrings();

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestBooleanPolicy">TestBooleanPolicy</string>',
			'<string id="TestBooleanPolicy_test_policy_description">Test policy description</string>'
		]);
	});

	test('should render ADML strings with translations', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.policy.description': 'Translated description'
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestBooleanPolicy">TestBooleanPolicy</string>',
			'<string id="TestBooleanPolicy_test_policy_description">Translated description</string>'
		]);
	});

	test('should render ADML presentation correctly', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const presentation = policy.renderADMLPresentation();

		assert.strictEqual(presentation, '<presentation id="TestBooleanPolicy"><checkBox refId="TestBooleanPolicy">TestBooleanPolicy</checkBox></presentation>');
	});

	test('should render profile value correctly', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<false/>');
	});

	test('should render profile correctly', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestBooleanPolicy</key>');
		assert.strictEqual(profile[1], '<false/>');
	});

	test('should render profile manifest value correctly', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifestValue = policy.renderProfileManifestValue();

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<false/>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_title</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_type</key>\n<string>boolean</string>');
	});

	test('should render profile manifest value with translations', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.policy.description': 'Translated manifest description'
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<false/>\n<key>pfm_description</key>\n<string>Translated manifest description</string>\n<key>pfm_name</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_title</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_type</key>\n<string>boolean</string>');
	});

	test('should render profile manifest correctly', () => {
		const policy = BooleanPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifest = policy.renderProfileManifest();

		assert.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<false/>\n<key>pfm_description</key>\n<string>Test policy description</string>\n<key>pfm_name</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_title</key>\n<string>TestBooleanPolicy</string>\n<key>pfm_type</key>\n<string>boolean</string>\n</dict>');
	});
});
