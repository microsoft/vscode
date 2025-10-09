/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { NumberPolicy } from '../../../../node/writer/policies/numberPolicy.js';
import { IPolicy, PolicyCategory } from '../../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../../configuration/common/configurationRegistry.js';
import { Category, NlsString, LanguageTranslations, PolicyType } from '../../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('NumberPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mockCategory: Category = {
		name: { value: 'Test Category', nlsKey: 'test.category' }
	};

	const mockPolicy: IPolicy = {
		name: 'TestNumberPolicy',
		category: PolicyCategory.Extensions,
		minimumVersion: '1.0',
		localization: {
			description: { key: 'test.numberpolicy.description', value: 'Test number policy description' }
		}
	};

	const mockPolicyDescription: NlsString = {
		value: 'Test number policy description',
		nlsKey: 'test.numberpolicy.description'
	};

	test('should create NumberPolicy with default value', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 42
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		assert.strictEqual(policy.name, 'TestNumberPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category, mockCategory);
		assert.strictEqual(policy.type, PolicyType.Number);
	});

	test('should throw error if default value is missing', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number'
			// missing default
		};

		assert.throws(() => {
			NumberPolicy.from({
				key: 'test.key',
				policy: mockPolicy,
				category: mockCategory,
				policyDescription: mockPolicyDescription,
				config: mockConfig
			});
		}, /missing required 'default' property/);
	});

	test('should render ADMX elements correctly', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 100
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const admx = policy.renderADMX('TestKey');

		assert.ok(admx.some(line => line.includes('<policy name="TestNumberPolicy"')));
		assert.ok(admx.some(line => line.includes('<decimal id="TestNumberPolicy"')));
		assert.ok(admx.some(line => line.includes('valueName="TestNumberPolicy"')));
	});

	test('should render ADML presentation with default value', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 256
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const presentation = policy.renderADMLPresentation();

		assert.ok(presentation.includes('<presentation id="TestNumberPolicy">'));
		assert.ok(presentation.includes('<decimalTextBox refId="TestNumberPolicy"'));
		assert.ok(presentation.includes('defaultValue="256"'));
	});

	test('should render profile value with number', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 512
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<integer>512</integer>');
	});

	test('should render profile correctly', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 1024
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestNumberPolicy</key>');
		assert.strictEqual(profile[1], '<integer>1024</integer>');
	});

	test('should render profile manifest value correctly', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 2048
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const manifestValue = policy.renderProfileManifestValue();

		assert.ok(manifestValue.includes('<key>pfm_default</key>'));
		assert.ok(manifestValue.includes('<integer>2048</integer>'));
		assert.ok(manifestValue.includes('<key>pfm_type</key>'));
		assert.ok(manifestValue.includes('<string>integer</string>'));
		assert.ok(manifestValue.includes('Test number policy description'));
	});

	test('should render profile manifest value with translations', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 999
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.numberpolicy.description': 'Translated number description'
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.ok(manifestValue.includes('Translated number description'));
	});

	test('should handle zero as default value', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: 0
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profileValue = policy.renderProfileValue();
		assert.strictEqual(profileValue, '<integer>0</integer>');
	});

	test('should handle negative numbers as default value', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'number',
			default: -100
		};

		const policy = NumberPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			config: mockConfig
		});

		const profileValue = policy.renderProfileValue();
		assert.strictEqual(profileValue, '<integer>-100</integer>');
	});
});
