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

	test('documents the Agent Host canvas authoring and verification contract', () => {
		const skill = fs.readFileSync(
			path.join(copilotRoot, 'assets', 'prompts', 'skills', 'create-canvas', 'SKILL.md'),
			'utf-8',
		);
		const required = [
			'name: create-canvas',
			'user-invocable: true',
			'.github/extensions/<name>/extension.mjs',
			'@github/copilot-sdk/extension',
			'createCanvas',
			'CanvasError',
			'joinSession',
			'VSCODE_CANVAS_DATA_DIR',
			'127.0.0.1',
			'list_canvas_capabilities',
			'open_canvas',
			'invoke_canvas_action',
			'extensions_reload',
			'previously open canvases are rehydrated',
		];

		expect(required.filter(anchor => !skill.includes(anchor))).toEqual([]);
		expect(skill).not.toContain('disable-model-invocation: true');
		expect(skill).not.toContain('extensions_manage({');
		expect(skill).not.toContain('run `/extensions`');
	});
});
