/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StringEnumPolicy } from '../../../../node/writer/policies/stringEnumPolicy.js';
import { IPolicy, PolicyCategory } from '../../../../../../base/common/policy.js';
import { IConfigurationPropertySchema } from '../../../../../configuration/common/configurationRegistry.js';
import { Category, NlsString, LanguageTranslations, PolicyType } from '../../../../node/writer/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

suite('StringEnumPolicy', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mockCategory: Category = {
		name: { value: 'Test Category', nlsKey: 'test.category' }
	};

	const mockPolicy: IPolicy = {
		name: 'TestStringEnumPolicy',
		category: PolicyCategory.Extensions,
		minimumVersion: '1.0',
		localization: {
			description: { key: 'test.stringenumpolicy.description', value: 'Test string enum policy description' }
		}
	};

	const mockPolicyDescription: NlsString = {
		value: 'Test string enum policy description',
		nlsKey: 'test.stringenumpolicy.description'
	};

	const mockEnumDescriptions: NlsString[] = [
		{ value: 'Option One', nlsKey: 'test.option.one' },
		{ value: 'Option Two', nlsKey: 'test.option.two' },
		{ value: 'Option Three', nlsKey: 'test.option.three' }
	];

	test('should create StringEnumPolicy with enum values', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['option1', 'option2', 'option3'],
			enumDescriptions: ['Option 1', 'Option 2', 'Option 3']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: mockEnumDescriptions,
			config: mockConfig
		});

		assert.strictEqual(policy.name, 'TestStringEnumPolicy');
		assert.strictEqual(policy.minimumVersion, '1.0');
		assert.strictEqual(policy.category, mockCategory);
		assert.strictEqual(policy.type, PolicyType.StringEnum);
	});

	test('should throw error if enum property is missing', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enumDescriptions: ['Option 1', 'Option 2']
			// missing enum
		};

		assert.throws(() => {
			StringEnumPolicy.from({
				key: 'test.key',
				policy: mockPolicy,
				category: mockCategory,
				policyDescription: mockPolicyDescription,
				policyEnumDescriptions: mockEnumDescriptions,
				config: mockConfig
			});
		}, /missing required 'enum' property/);
	});

	test('should throw error if enumDescriptions property is missing', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['option1', 'option2']
			// missing enumDescriptions
		};

		assert.throws(() => {
			StringEnumPolicy.from({
				key: 'test.key',
				policy: mockPolicy,
				category: mockCategory,
				policyDescription: mockPolicyDescription,
				policyEnumDescriptions: mockEnumDescriptions,
				config: mockConfig
			});
		}, /missing required 'enumDescriptions' property/);
	});

	test('should render ADMX elements with enum items', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['auto', 'manual', 'disabled'],
			enumDescriptions: ['Automatic', 'Manual', 'Disabled']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: mockEnumDescriptions,
			config: mockConfig
		});

		const admx = policy.renderADMX('TestKey');

		assert.ok(admx.some(line => line.includes('<policy name="TestStringEnumPolicy"')));
		assert.ok(admx.some(line => line.includes('<enum id="TestStringEnumPolicy"')));
		assert.ok(admx.some(line => line.includes('<item displayName=')));
		assert.ok(admx.some(line => line.includes('<string>auto</string>')));
		assert.ok(admx.some(line => line.includes('<string>manual</string>')));
		assert.ok(admx.some(line => line.includes('<string>disabled</string>')));
	});

	test('should render ADML strings with enum descriptions', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['low', 'medium', 'high'],
			enumDescriptions: ['Low priority', 'Medium priority', 'High priority']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: mockEnumDescriptions,
			config: mockConfig
		});

		const admlStrings = policy.renderADMLStrings();

		// Should include policy name, description, and all enum descriptions
		assert.ok(admlStrings.length > 3);
		assert.ok(admlStrings.some(s => s.includes('id="TestStringEnumPolicy"')));
		assert.ok(admlStrings.some(s => s.includes('Option One')));
		assert.ok(admlStrings.some(s => s.includes('Option Two')));
		assert.ok(admlStrings.some(s => s.includes('Option Three')));
	});

	test('should render ADML strings with translations', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['option1', 'option2'],
			enumDescriptions: ['Option 1', 'Option 2']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: [mockEnumDescriptions[0], mockEnumDescriptions[1]],
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.stringenumpolicy.description': 'Translated enum description',
			'test.option.one': 'Translated Option One',
			'test.option.two': 'Translated Option Two'
		};

		const admlStrings = policy.renderADMLStrings(translations);

		assert.ok(admlStrings.some(s => s.includes('Translated enum description')));
		assert.ok(admlStrings.some(s => s.includes('Translated Option One')));
		assert.ok(admlStrings.some(s => s.includes('Translated Option Two')));
	});

	test('should render ADML presentation correctly', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['yes', 'no'],
			enumDescriptions: ['Yes', 'No']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: [mockEnumDescriptions[0], mockEnumDescriptions[1]],
			config: mockConfig
		});

		const presentation = policy.renderADMLPresentation();

		assert.ok(presentation.includes('<presentation id="TestStringEnumPolicy">'));
		assert.ok(presentation.includes('<dropdownList refId="TestStringEnumPolicy"'));
	});

	test('should render profile value with first enum option as default', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['first', 'second', 'third'],
			enumDescriptions: ['First', 'Second', 'Third']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: mockEnumDescriptions,
			config: mockConfig
		});

		const profileValue = policy.renderProfileValue();

		assert.strictEqual(profileValue, '<string>first</string>');
	});

	test('should render profile correctly', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['alpha', 'beta'],
			enumDescriptions: ['Alpha', 'Beta']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: [mockEnumDescriptions[0], mockEnumDescriptions[1]],
			config: mockConfig
		});

		const profile = policy.renderProfile();

		assert.strictEqual(profile.length, 2);
		assert.strictEqual(profile[0], '<key>TestStringEnumPolicy</key>');
		assert.strictEqual(profile[1], '<string>alpha</string>');
	});

	test('should render profile manifest value with range list', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['compact', 'normal', 'expanded'],
			enumDescriptions: ['Compact', 'Normal', 'Expanded']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: mockEnumDescriptions,
			config: mockConfig
		});

		const manifestValue = policy.renderProfileManifestValue();

		assert.ok(manifestValue.includes('<key>pfm_default</key>'));
		assert.ok(manifestValue.includes('<string>compact</string>'));
		assert.ok(manifestValue.includes('<key>pfm_type</key>'));
		assert.ok(manifestValue.includes('<string>string</string>'));
		assert.ok(manifestValue.includes('<key>pfm_range_list</key>'));
		assert.ok(manifestValue.includes('<array>'));
		assert.ok(manifestValue.includes('<string>compact</string>'));
		assert.ok(manifestValue.includes('<string>normal</string>'));
		assert.ok(manifestValue.includes('<string>expanded</string>'));
	});

	test('should render profile manifest value with translations', () => {
		const mockConfig: IConfigurationPropertySchema = {
			type: 'string',
			enum: ['on', 'off'],
			enumDescriptions: ['On', 'Off']
		};

		const policy = StringEnumPolicy.from({
			key: 'test.key',
			policy: mockPolicy,
			category: mockCategory,
			policyDescription: mockPolicyDescription,
			policyEnumDescriptions: [mockEnumDescriptions[0], mockEnumDescriptions[1]],
			config: mockConfig
		});

		const translations: LanguageTranslations = {
			'test.stringenumpolicy.description': 'Translated manifest enum'
		};

		const manifestValue = policy.renderProfileManifestValue(translations);

		assert.ok(manifestValue.includes('Translated manifest enum'));
	});
});
