/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ToolTerminalCreator } from '../../browser/toolTerminalCreator.js';

suite('ToolTerminalCreator', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let toolTerminalCreator: ToolTerminalCreator;
	let capturedTerminalConfig: any;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, store);

		// Create proper event emitters to avoid disposal issues
		const mockEmitter = store.add(new Emitter<any>());
		const mockCapabilityEmitter = store.add(new Emitter<any>());

		// Mock the terminal instance that would be returned
		const mockTerminalInstance = {
			onDidDispose: () => store.add({ dispose: () => { } }),
			capabilities: {
				get: () => undefined,
				onDidAddCapabilityType: mockCapabilityEmitter.event
			},
			xtermReadyPromise: Promise.resolve({}),
			isRemote: false
		} as any;

		// Mock terminal service to capture the config passed to createTerminal
		const mockTerminalService = {
			createTerminal: (config: any) => {
				capturedTerminalConfig = config;
				return mockTerminalInstance;
			},
			createOnInstanceCapabilityEvent: () => ({
				event: mockEmitter.event,
				dispose: () => { }
			})
		} as any;

		instantiationService.stub(ITerminalService, mockTerminalService);

		toolTerminalCreator = instantiationService.createInstance(ToolTerminalCreator);
	});

	test('should set VSCODE_COPILOT_TERMINAL environment variable', async () => {
		// Act: Create a terminal using the tool terminal creator
		try {
			await toolTerminalCreator.createTerminal('/bin/bash', CancellationToken.None);
		} catch (e) {
			// We expect this to potentially timeout/fail due to shell integration,
			// but the terminal creation should still happen
		}

		// Assert: Verify the environment variable is set correctly
		ok(capturedTerminalConfig, 'Terminal config should be captured');
		ok(capturedTerminalConfig.config, 'Terminal config should have config property');
		ok(capturedTerminalConfig.config.env, 'Terminal config should have env property');

		strictEqual(
			capturedTerminalConfig.config.env.VSCODE_COPILOT_TERMINAL,
			'1',
			'VSCODE_COPILOT_TERMINAL should be set to "1"'
		);
	});

	test('should set GIT_PAGER environment variable', async () => {
		// Act: Create a terminal using the tool terminal creator
		await toolTerminalCreator.createTerminal('/bin/bash', CancellationToken.None);

		// Assert: Verify the GIT_PAGER environment variable is set correctly
		ok(capturedTerminalConfig, 'Terminal config should be captured');
		ok(capturedTerminalConfig.config, 'Terminal config should have config property');
		ok(capturedTerminalConfig.config.env, 'Terminal config should have env property');

		strictEqual(
			capturedTerminalConfig.config.env.GIT_PAGER,
			'cat',
			'GIT_PAGER should be set to "cat" to avoid interactive git commands'
		);
	});

	test('should configure terminal with copilot sparkle icon', async () => {
		// Act: Create a terminal using the tool terminal creator
		await toolTerminalCreator.createTerminal('/bin/bash', CancellationToken.None);

		// Assert: Verify the icon is set correctly
		ok(capturedTerminalConfig, 'Terminal config should be captured');
		ok(capturedTerminalConfig.config, 'Terminal config should have config property');
		ok(capturedTerminalConfig.config.icon, 'Terminal config should have icon property');

		strictEqual(
			capturedTerminalConfig.config.icon.id,
			'chat-sparkle',
			'Terminal should use the chat sparkle icon'
		);
	});

	test('should hide terminal from user', async () => {
		// Act: Create a terminal using the tool terminal creator
		await toolTerminalCreator.createTerminal('/bin/bash', CancellationToken.None);

		// Assert: Verify the terminal is hidden from user
		ok(capturedTerminalConfig, 'Terminal config should be captured');
		ok(capturedTerminalConfig.config, 'Terminal config should have config property');

		strictEqual(
			capturedTerminalConfig.config.hideFromUser,
			true,
			'Terminal should be hidden from user interface'
		);
	});

	test('should use the provided shell executable', async () => {
		const testShell = '/usr/bin/zsh';

		// Act: Create a terminal with a specific shell
		await toolTerminalCreator.createTerminal(testShell, CancellationToken.None);

		// Assert: Verify the correct shell is used
		ok(capturedTerminalConfig, 'Terminal config should be captured');
		ok(capturedTerminalConfig.config, 'Terminal config should have config property');

		strictEqual(
			capturedTerminalConfig.config.executable,
			testShell,
			'Terminal should use the provided shell executable'
		);
	});

	test('should set both environment variables in the same env object', async () => {
		// Act: Create a terminal
		await toolTerminalCreator.createTerminal('/bin/bash', CancellationToken.None);

		// Assert: Both environment variables should be in the same env object
		const env = capturedTerminalConfig.config.env;
		ok(env, 'Environment object should exist');

		const envKeys = Object.keys(env);
		ok(envKeys.includes('VSCODE_COPILOT_TERMINAL'), 'Environment should contain VSCODE_COPILOT_TERMINAL');
		ok(envKeys.includes('GIT_PAGER'), 'Environment should contain GIT_PAGER');
		strictEqual(envKeys.length, 2, 'Environment should contain exactly 2 variables');
	});

	test('should not interfere with other terminal configurations', async () => {
		// Act: Create a terminal
		await toolTerminalCreator.createTerminal('/usr/local/bin/fish', CancellationToken.None);

		// Assert: Verify the Copilot terminal doesn't affect other terminal properties
		ok(capturedTerminalConfig.config, 'Config should exist');

		// These should be the expected Copilot terminal settings
		strictEqual(capturedTerminalConfig.config.hideFromUser, true);
		strictEqual(capturedTerminalConfig.config.executable, '/usr/local/bin/fish');
		strictEqual(capturedTerminalConfig.config.icon.id, 'chat-sparkle');

		// Environment variables should not affect the terminal's basic functionality
		ok(typeof capturedTerminalConfig.config.env === 'object');
		ok(!Array.isArray(capturedTerminalConfig.config.env));
	});

	test('environment variable values should be strings', async () => {
		// Act: Create a terminal
		await toolTerminalCreator.createTerminal('/bin/bash', CancellationToken.None);

		// Assert: All environment variable values should be strings
		const env = capturedTerminalConfig.config.env;
		strictEqual(typeof env.VSCODE_COPILOT_TERMINAL, 'string', 'VSCODE_COPILOT_TERMINAL should be a string');
		strictEqual(typeof env.GIT_PAGER, 'string', 'GIT_PAGER should be a string');

		// Verify specific string values
		strictEqual(env.VSCODE_COPILOT_TERMINAL.length, 1, 'VSCODE_COPILOT_TERMINAL should be a single character');
		strictEqual(env.GIT_PAGER.length, 3, 'GIT_PAGER should be "cat" (3 characters)');
	});
});
