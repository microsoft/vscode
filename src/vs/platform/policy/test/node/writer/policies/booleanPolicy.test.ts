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

		assert.ok(admx.some(line => line.includes('<policy name="TestBooleanPolicy"')));
		assert.ok(admx.some(line => line.includes('<boolean id="TestBooleanPolicy"')));
		assert.ok(admx.some(line => line.includes('<trueValue><decimal value="1" /></trueValue>')));
		assert.ok(admx.some(line => line.includes('<falseValue><decimal value="0" /></falseValue>')));
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

		assert.strictEqual(admlStrings.length, 2);
		assert.ok(admlStrings.some(s => s.includes('id="TestBooleanPolicy"')));
		assert.ok(admlStrings.some(s => s.includes('Test policy description')));
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

		assert.ok(admlStrings.some(s => s.includes('Translated description')));
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

		assert.ok(presentation.includes('<presentation id="TestBooleanPolicy">'));
		assert.ok(presentation.includes('<checkBox refId="TestBooleanPolicy">'));
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

		assert.ok(manifestValue.includes('<key>pfm_default</key>'));
		assert.ok(manifestValue.includes('<false/>'));
		assert.ok(manifestValue.includes('<key>pfm_type</key>'));
		assert.ok(manifestValue.includes('<string>boolean</string>'));
		assert.ok(manifestValue.includes('Test policy description'));
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

		assert.ok(manifestValue.includes('Translated manifest description'));
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

		assert.ok(manifest.startsWith('<dict>'));
		assert.ok(manifest.endsWith('</dict>'));
		assert.ok(manifest.includes('pfm_type'));
	});
});
