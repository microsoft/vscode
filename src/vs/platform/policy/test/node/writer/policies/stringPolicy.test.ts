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

		assert.ok(admx.some(line => line.includes('<policy name="TestStringPolicy"')));
		assert.ok(admx.some(line => line.includes('<text id="TestStringPolicy"')));
		assert.ok(admx.some(line => line.includes('valueName="TestStringPolicy"')));
		assert.ok(admx.some(line => line.includes('required="true"')));
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

		assert.strictEqual(admlStrings.length, 2);
		assert.ok(admlStrings.some(s => s.includes('id="TestStringPolicy"')));
		assert.ok(admlStrings.some(s => s.includes('Test string policy description')));
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

		assert.ok(admlStrings.some(s => s.includes('Translated string description')));
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

		assert.ok(presentation.includes('<presentation id="TestStringPolicy">'));
		assert.ok(presentation.includes('<textBox refId="TestStringPolicy">'));
		assert.ok(presentation.includes('<label>TestStringPolicy:</label>'));
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

		assert.ok(manifestValue.includes('<key>pfm_default</key>'));
		assert.ok(manifestValue.includes('<string></string>'));
		assert.ok(manifestValue.includes('<key>pfm_type</key>'));
		assert.ok(manifestValue.includes('<string>string</string>'));
		assert.ok(manifestValue.includes('Test string policy description'));
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

		assert.ok(manifestValue.includes('Translated manifest string'));
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

		assert.ok(manifest.startsWith('<dict>'));
		assert.ok(manifest.endsWith('</dict>'));
		assert.ok(manifest.includes('pfm_type'));
	});
});
