/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { test } from 'node:test';
import { EMPTY_WORKBENCH_COLD_START_STORY, WINDOW_RESIZE_STORY } from './benchmarkStory';

interface StoryPackManifest {
	readonly schemaVersion: number;
	readonly protocolVersion: number;
	readonly pack: { readonly id: string; readonly version: string };
	readonly runner: { readonly argv: readonly string[] };
	readonly stories: readonly {
		readonly name: string;
		readonly defaultTimeoutMs: number;
		readonly requiredPhases: readonly string[];
		readonly platforms?: readonly string[];
		readonly capabilities?: readonly string[];
		readonly traceInterval?: { readonly startMark: string; readonly endMark: string };
	}[];
}

test('declares the standalone story pack v1 contract', () => {
	const manifestPath = join(__dirname, '..', '..', 'story-pack', 'manifest.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as StoryPackManifest;

	assert.deepStrictEqual(manifest, {
		schemaVersion: 1,
		protocolVersion: 1,
		pack: { id: 'vscode-electron', version: '1.0.0' },
		runner: { argv: ['node', 'runner.js'] },
		stories: [
			{
				name: EMPTY_WORKBENCH_COLD_START_STORY,
				description: 'Launch a fresh isolated empty VS Code workbench and wait for the restored lifecycle and restored workbench contributions.',
				defaultTimeoutMs: 120000,
				requiredPhases: ['electronLaunch', 'firstWindow', 'didFinishLoad', 'monacoWorkbench', 'workbenchRestored', 'shutdown'],
				platforms: ['windows'],
				capabilities: ['appExecutable', 'isolatedProfile', 'cleanShutdown', 'node>=24', 'electronStartupTracing', 'v8Flags'],
				recommendedProbes: ['perfetto:electron-startup', 'trace_processor:electron_startup']
			},
			{
				name: WINDOW_RESIZE_STORY,
				description: 'Launch a restored isolated empty VS Code workbench and execute a fixed sequence of BrowserWindow resize operations.',
				defaultTimeoutMs: 120000,
				requiredPhases: ['electronLaunch', 'firstWindow', 'didFinishLoad', 'monacoWorkbench', 'workbenchRestored', 'resizeWarmup', 'resizeMeasure', 'shutdown'],
				platforms: ['windows'],
				capabilities: ['appExecutable', 'isolatedProfile', 'cleanShutdown', 'node>=24', 'browserWindowResize', 'electronStartupTracing'],
				recommendedProbes: ['perfetto:electron-startup', 'trace_processor:electron_startup'],
				traceInterval: {
					startMark: 'vscode.window-resize.measure.start',
					endMark: 'vscode.window-resize.measure.end'
				}
			}
		]
	});
});
