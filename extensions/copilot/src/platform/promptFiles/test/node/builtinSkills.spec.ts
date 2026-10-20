/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'node:fs';
import path from 'node:path';
import { expect, suite, test } from 'vitest';

interface IChatSkillContribution {
	readonly path: string;
	readonly when?: string;
	readonly sessionTypes?: readonly string[];
}

interface ICopilotPackage {
	readonly contributes?: {
		readonly chatSkills?: readonly IChatSkillContribution[];
	};
}

suite('built-in skills', () => {
	const copilotRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');

	test('contributes create-canvas only to Copilot CLI sessions when Canvases are enabled', () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(copilotRoot, 'package.json'), 'utf-8')) as ICopilotPackage;
		const contributions = manifest.contributes?.chatSkills?.filter(skill => skill.path.endsWith('/create-canvas/SKILL.md'));

		expect(contributions).toEqual([{
			path: './assets/prompts/skills/create-canvas/SKILL.md',
			when: 'config.chat.canvases.enabled',
			sessionTypes: ['copilotcli'],
		}]);
	});

	test('documents scope selection and a host-neutral canvas authoring and verification contract', () => {
		const skill = fs.readFileSync(
			path.join(copilotRoot, 'assets', 'prompts', 'skills', 'create-canvas', 'SKILL.md'),
			'utf-8',
		);
		const required = [
			'name: create-canvas',
			'user-invocable: true',
			'## Choose the scope',
			'Before writing any files, use `ask_user` to offer all three scopes unless the user already specified a scope.',
			'<copilot-home>/extensions/<name>/extension.mjs',
			'<workspace-root>/.github/extensions/<name>/extension.mjs',
			'<plugin-root>/extensions/<name>/extension.mjs',
			'.plugin/plugin.json',
			'"extensions": "extensions/"',
			'Create `<extension-dir>/extension.mjs`.',
			'node --check "<extension-dir>/extension.mjs"',
			'Creating plugin files alone does not make the canvas discoverable.',
			'@github/copilot-sdk/extension',
			'createCanvas',
			'CanvasError',
			'joinSession',
			'COPILOT_HOME',
			'extension-data/<canvas-id>/',
			'atomically',
			'127.0.0.1',
			'list_canvas_capabilities',
			'open_canvas',
			'invoke_canvas_action',
			'extensions_reload',
			'previously open canvases are rehydrated',
		];

		expect(required.filter(anchor => !skill.includes(anchor))).toEqual([]);
		expect(skill).not.toMatch(/vs ?code|visual studio code/i);
		expect(skill).not.toContain('disable-model-invocation: true');
		expect(skill).not.toContain('extensions_manage({');
		expect(skill).not.toContain('run `/extensions`');
		expect(skill).not.toContain('The extension scope is fixed');
	});

	test('contributes the customization migration skill to Agent Host sessions', () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(copilotRoot, 'package.json'), 'utf-8')) as ICopilotPackage;
		const contributions = manifest.contributes?.chatSkills?.filter(skill => skill.path.endsWith('/migrate-customizations/SKILL.md'));
		const skill = fs.readFileSync(
			path.join(copilotRoot, 'assets', 'prompts', 'skills', 'migrate-customizations', 'SKILL.md'),
			'utf-8',
		);
		expect({
			contributions,
			requiredContent: [
				'name: migrate-customizations',
				'user-invocable: true',
				'disable-model-invocation: true',
				'Agent Customizations > Migrations',
				'Do not ask the user to manually reconstruct or paste the missing context',
				'./references/migration-techniques.md',
				'VS Code created and verified a private recovery bundle',
				'When using `ask_user`, keep the question short and write it as a single sentence',
				'pull request',
				'report_customization_migration',
			].filter(anchor => skill.includes(anchor)),
		}).toEqual({
			contributions: [{
				path: './assets/prompts/skills/migrate-customizations/SKILL.md',
				sessionTypes: ['copilotcli', 'claude', 'codex'],
			}],
			requiredContent: [
				'name: migrate-customizations',
				'user-invocable: true',
				'disable-model-invocation: true',
				'Agent Customizations > Migrations',
				'Do not ask the user to manually reconstruct or paste the missing context',
				'./references/migration-techniques.md',
				'VS Code created and verified a private recovery bundle',
				'When using `ask_user`, keep the question short and write it as a single sentence',
				'pull request',
				'report_customization_migration',
			],
		});
	});
});
