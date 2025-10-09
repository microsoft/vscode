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

		assert.ok(admx.some(line => line.includes('<policy name="TestObjectPolicy"')));
		assert.ok(admx.some(line => line.includes('<multiText id="TestObjectPolicy"')));
		assert.ok(admx.some(line => line.includes('valueName="TestObjectPolicy"')));
		assert.ok(admx.some(line => line.includes('required="true"')));
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

		assert.strictEqual(admlStrings.length, 2);
		assert.ok(admlStrings.some(s => s.includes('id="TestObjectPolicy"')));
		assert.ok(admlStrings.some(s => s.includes('Test object policy description')));
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

		assert.ok(admlStrings.some(s => s.includes('Translated object description')));
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

		assert.ok(presentation.includes('<presentation id="TestObjectPolicy">'));
		assert.ok(presentation.includes('<multiTextBox refId="TestObjectPolicy"'));
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

		assert.ok(manifestValue.includes('<key>pfm_default</key>'));
		assert.ok(manifestValue.includes('<string></string>'));
		assert.ok(manifestValue.includes('<key>pfm_type</key>'));
		assert.ok(manifestValue.includes('<string>string</string>'));
		assert.ok(manifestValue.includes('Test object policy description'));
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

		assert.ok(manifestValue.includes('Translated manifest object'));
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

		assert.ok(manifest.startsWith('<dict>'));
		assert.ok(manifest.endsWith('</dict>'));
		assert.ok(manifest.includes('pfm_type'));
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
		const admxText = admx.join('\n');

		assert.ok(admxText.includes('class="Both"'));
		assert.ok(admxText.includes('displayName="$(string.TestObjectPolicy)"'));
		assert.ok(admxText.includes('Software\\Policies\\Microsoft\\TestKey'));
		assert.ok(admxText.includes('<elements>'));
		assert.ok(admxText.includes('</elements>'));
	});
});
