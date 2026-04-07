/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { Config, ConfigKey } from '../../../platform/configuration/common/configurationService';
import { packageJson } from '../../../platform/env/common/packagejson';

describe('Configurations', () => {
	it('package.json configuration contains stable, experimental, preview, and advanced sections', () => {
		const configurationContributions = packageJson.contributes.configuration;

		// Should have 4 sections
		expect(configurationContributions, 'package.json should have exactly 4 sections').toHaveLength(4);

		// Should have a stable section
		const stableSection = configurationContributions.find(section => section.id === 'stable');
		const preview = configurationContributions.find(section => section.id === 'preview');
		const experimental = configurationContributions.find(section => section.id === 'experimental');
		const advanced = configurationContributions.find(section => section.id === 'advanced');

		expect(stableSection, 'stable configuration section is missing').toBeDefined();
		expect(preview, 'preview configuration section is missing').toBeDefined();
		expect(experimental, 'experimental configuration section is missing').toBeDefined();
		expect(advanced, 'advanced configuration section is missing').toBeDefined();
	});

	it('package.json configuration tags are correct for each section', () => {
		const configurationContributions = packageJson.contributes.configuration;

		const stableSection = configurationContributions.find(section => section.id === 'stable')!;
		for (const settingId of Object.keys(stableSection?.properties)) {
			const setting = stableSection.properties[settingId];
			expect(setting.tags ?? [], settingId).not.toContain('preview');
			expect(setting.tags ?? [], settingId).not.toContain('experimental');
			expect(setting.tags ?? [], settingId).not.toContain('advanced');
		}

		const previewSection = configurationContributions.find(section => section.id === 'preview')!;
		for (const settingId of Object.keys(previewSection?.properties)) {
			const setting = previewSection.properties[settingId];
			expect(setting.tags ?? [], settingId).toContain('preview');
			expect(setting.tags ?? [], settingId).not.toContain('experimental');
			expect(setting.tags ?? [], settingId).not.toContain('advanced');
		}

		const experimentalSection = configurationContributions.find(section => section.id === 'experimental')!;
		for (const settingId of Object.keys(experimentalSection?.properties)) {
			const setting = experimentalSection.properties[settingId];
			expect(setting.tags ?? [], settingId).toContain('experimental');
			expect(setting.tags ?? [], settingId).not.toContain('preview');
			expect(setting.tags ?? [], settingId).not.toContain('advanced');
		}

		const advancedSection = configurationContributions.find(section => section.id === 'advanced')!;
		for (const settingId of Object.keys(advancedSection?.properties)) {
			const setting = advancedSection.properties[settingId];
			expect(setting.tags ?? [], settingId).toContain('advanced');
			expect(setting.tags ?? [], settingId).not.toContain('preview');
		}
	});


	it('settings in code should match package.json', () => {

		const configurationsInPackageJson = packageJson.contributes.configuration.flatMap(section => Object.keys(section.properties));
		const advancedConfigurationsInPackageJson = packageJson.contributes.configuration.filter(section => section.id === 'advanced').flatMap(section => Object.keys(section.properties));
		const otherConfigurationsInPackageJson = packageJson.contributes.configuration.filter(section => section.id !== 'advanced').flatMap(section => Object.keys(section.properties));

		// Get keys from code
		const internalKeys = Object.values(ConfigKey.TeamInternal).map(setting => setting.fullyQualifiedId);
		const sharedKeys = Object.values(ConfigKey.Shared).map(setting => setting.fullyQualifiedId);
		const advancedPublicKeys = Object.values(ConfigKey.Advanced).map(setting => setting.fullyQualifiedId);
		const otherPublicKeys = (Object.values(ConfigKey).filter(key => key !== ConfigKey.TeamInternal && key !== ConfigKey.Shared && key !== ConfigKey.Advanced && key !== ConfigKey.Deprecated) as Config<any>[]).map(setting => setting.fullyQualifiedId);
		const registered = [...otherPublicKeys, ...advancedPublicKeys];
		const unregistered = [...internalKeys, ...sharedKeys];

		// Validate unregistered settings are not in package.json
		unregistered.forEach(key => {
			expect(configurationsInPackageJson, 'unregistered settings should not be defined in the package.json').not.toContain(key);
		});

		// Validate Internal settings have the correct prefix
		internalKeys.forEach(key => {
			expect(key, 'Internal settings must start with github.copilot.chat.advanced.').toMatch(/^github\.copilot\.chat\.advanced\./);
		});

		// Validate public settings in code are in package.json
		otherPublicKeys.forEach(key => {
			expect(otherConfigurationsInPackageJson, 'Setting in code is not defined in the package.json').toContain(key);
		});

		// Validate advanced settings in code are in the advanced section of package.json
		advancedPublicKeys.forEach(key => {
			expect(key, 'Advanced settings must not start wih github.copilot.chat.advanced.').not.toMatch(/^github\.copilot\.chat\.advanced\./);
			if (key === ConfigKey.Advanced.DebugGitHubAuthFailWith.fullyQualifiedId) {
				// This setting should be internal, but can't be made TeamInternal because we lose the team and internal flags as part of its testing.
				return;
			}
			expect(advancedConfigurationsInPackageJson, `Advanced setting ${key} should be defined in the advanced section of package.json`).toContain(key);
		});

		// Validate settings in package.json are in code
		configurationsInPackageJson.forEach(key => {
			expect(registered, 'Setting in package.json is not defined in code').toContain(key);
		});
	});

	it('all localization strings in package.json are present in package.nls.json', async () => {
		// Get all keys from package.nls.json
		const packageJsonPath = path.join(__dirname, '../../../../package.json');
		const packageNlsPath = path.join(__dirname, '../../../../package.nls.json');
		const [packageJsonFileContents, packageNlsFileContents] = await Promise.all(
			[
				fs.promises.readFile(packageJsonPath, 'utf-8'),
				fs.promises.readFile(packageNlsPath, 'utf-8'),
			]
		);

		const packageNls = JSON.parse(packageNlsFileContents);
		const nlsKeys = Object.keys(packageNls);

		// Find all %key% references in package.json
		const nlsReferences = Array.from(packageJsonFileContents.matchAll(/"%([^"]+)%"/g)).map(match => match[1]);

		// Validate all references exist in package.nls.json
		const missingKeys = nlsReferences.filter(key => !nlsKeys.includes(key));
		if (missingKeys.length > 0) {
			throw new Error(`Missing localization keys in package.nls.json but present in package.json: ${missingKeys.map(key => `'%${key}%'`).join(', ')}`);
		}
	});
});
