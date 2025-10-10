/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ObjectPolicy } from '../../../../node/writer/policies/objectPolicy.js';
import { IPolicy, PolicyCategory } from '../../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../../configuration/common/configurationRegistry.js';
import { Category, NlsString, LanguageTranslations, PolicyType } from '../../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('ObjectPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mockCategory: Category = {
		name: { value: 'Test Category', nlsKey: 'test.category' }
	};

	const mockPolicy: IPolicy = {
		name: 'TestObjectPolicy',
		category: PolicyCategory.Extensions,
		minimumVersion: '1.0',
		localization: {
			description: { key: 'test.objectpolicy.description', value: 'Test object policy description' }
		}
	};

	const mockPolicyDescription: NlsString = {
		value: 'Test object policy description',
		nlsKey: 'test.objectpolicy.description'
	};

	const mockConfig: IConfigurationPropertySchema = {
		type: 'object',
		default: {}
	};

	test('should create ObjectPolicy from factory method', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		assert.strictEqual(policy.name, 'TestObjectPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category, mockCategory);
		assert.strictEqual(policy.type, PolicyType.Object);
	});

	test('should render ADMX elements correctly', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
			'<policy name="TestObjectPolicy" class="Both" displayName="$(string.TestObjectPolicy)" explainText="$(string.TestObjectPolicy_test_objectpolicy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestObjectPolicy)">',
			'\t<parentCategory ref="test.category" />',
			'\t<supportedOn ref="Supported_1_0" />',
			'\t<elements>',
			'<multiText id="TestObjectPolicy" valueName="TestObjectPolicy" required="true" />',
			'\t</elements>',
			'</policy>'
		]);
	});

	test('should render ADML strings correctly', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admlStrings = policy.renderADMLStrings();

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestObjectPolicy">TestObjectPolicy</string>',
			'<string id="TestObjectPolicy_test_objectpolicy_description">Test object policy description</string>'
		]);
	});

	test('should render ADML strings with translations', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.objectpolicy.description': 'Translated object description'
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.deepStrictEqual(admlStrings, [
			'<string id="TestObjectPolicy">TestObjectPolicy</string>',
			'<string id="TestObjectPolicy_test_objectpolicy_description">Translated object description</string>'
		]);
	});

	test('should render ADML presentation correctly', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const presentation = policy.renderADMLPresentation();

		assert.strictEqual(presentation, '<presentation id="TestObjectPolicy"><multiTextBox refId="TestObjectPolicy" /></presentation>');
	});

	test('should render profile value correctly', () => {
		const policy = ObjectPolicy.from({
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
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestObjectPolicy</key>');
		assert.strictEqual(profile[1], '<string></string>');
	});

	test('should render profile manifest value correctly', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifestValue = policy.renderProfileManifestValue();

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test object policy description</string>\n<key>pfm_name</key>\n<string>TestObjectPolicy</string>\n<key>pfm_title</key>\n<string>TestObjectPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n');
	});

	test('should render profile manifest value with translations', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.objectpolicy.description': 'Translated manifest object'
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.strictEqual(manifestValue, '<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Translated manifest object</string>\n<key>pfm_name</key>\n<string>TestObjectPolicy</string>\n<key>pfm_title</key>\n<string>TestObjectPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n');
	});

	test('should render profile manifest correctly', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifest = policy.renderProfileManifest();

		assert.strictEqual(manifest, '<dict>\n<key>pfm_default</key>\n<string></string>\n<key>pfm_description</key>\n<string>Test object policy description</string>\n<key>pfm_name</key>\n<string>TestObjectPolicy</string>\n<key>pfm_title</key>\n<string>TestObjectPolicy</string>\n<key>pfm_type</key>\n<string>string</string>\n\n</dict>');
	});

	test('should render ADMX with proper policy structure', () => {
		const policy = ObjectPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admx = policy.renderADMX('TestKey');

		assert.deepStrictEqual(admx, [
			'<policy name="TestObjectPolicy" class="Both" displayName="$(string.TestObjectPolicy)" explainText="$(string.TestObjectPolicy_test_objectpolicy_description)" key="Software\\Policies\\Microsoft\\TestKey" presentation="$(presentation.TestObjectPolicy)">',
			'\t<parentCategory ref="test.category" />',
			'\t<supportedOn ref="Supported_1_0" />',
			'\t<elements>',
			'<multiText id="TestObjectPolicy" valueName="TestObjectPolicy" required="true" />',
			'\t</elements>',
			'</policy>'
		]);
	});
});
