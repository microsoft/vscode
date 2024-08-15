/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Terminal } from '@xterm/xterm';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ShellIntegrationAddon } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { NullLogService } from 'vs/platform/log/common/log';
import { InitialHintAddon } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminal.initialHint.contribution';
import { getActiveDocument } from 'vs/base/browser/dom';
import { Emitter } from 'vs/base/common/event';
import { strictEqual } from 'assert';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ChatAgentLocation, IChatAgent } from 'vs/workbench/contrib/chat/common/chatAgents';
import { importAMDNodeModule } from 'vs/amdX';

// Test TerminalInitialHintAddon

suite('Terminal Initial Hint Addon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let eventCount = 0;
	let xterm: Terminal;
	let initialHintAddon: InitialHintAddon;
	const _onDidChangeAgents: Emitter<IChatAgent | undefined> = new Emitter();
	const onDidChangeAgents = _onDidChangeAgents.event;
	const agent: IChatAgent = {
		id: 'termminal',
		name: 'terminal',
		extensionId: new ExtensionIdentifier('test'),
		extensionPublisherId: 'test',
		extensionDisplayName: 'test',
		metadata: {},
		slashCommands: [{ name: 'test', description: 'test' }],
		disambiguation: [],
		locations: [ChatAgentLocation.fromRaw('terminal')],
		invoke: async () => { return {}; }
	};
	const editorAgent: IChatAgent = {
		id: 'editor',
		name: 'editor',
		extensionId: new ExtensionIdentifier('test-editor'),
		extensionPublisherId: 'test-editor',
		extensionDisplayName: 'test-editor',
		metadata: {},
		slashCommands: [{ name: 'test', description: 'test' }],
		locations: [ChatAgentLocation.fromRaw('editor')],
		disambiguation: [],
		invoke: async () => { return {}; }
	};
	setup(async () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const TerminalCtor = (await importAMDNodeModule<typeof import('@xterm/xterm')>('@xterm/xterm', 'lib/xterm.js')).Terminal;
		xterm = store.add(new TerminalCtor());
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, new NullLogService));
		initialHintAddon = store.add(instantiationService.createInstance(InitialHintAddon, shellIntegrationAddon.capabilities, onDidChangeAgents));
		store.add(initialHintAddon.onDidRequestCreateHint(() => eventCount++));
		const testContainer = document.createElement('div');
		getActiveDocument().body.append(testContainer);
		xterm.open(testContainer);

		xterm.loadAddon(shellIntegrationAddon);
		xterm.loadAddon(initialHintAddon);
	});

	suite('Chat providers', () => {
		test('hint is not shown when there are no chat providers', () => {
			eventCount = 0;
			xterm.focus();
			strictEqual(eventCount, 0);
		});
		test('hint is not shown when there is just an editor agent', () => {
			eventCount = 0;
			_onDidChangeAgents.fire(editorAgent);
			xterm.focus();
			strictEqual(eventCount, 0);
		});
		test('hint is shown when there is a terminal chat agent', () => {
			eventCount = 0;
			_onDidChangeAgents.fire(editorAgent);
			xterm.focus();
			strictEqual(eventCount, 0);
			_onDidChangeAgents.fire(agent);
			strictEqual(eventCount, 1);
		});
		test('hint is not shown again when another terminal chat agent is added if it has already shown', () => {
			eventCount = 0;
			_onDidChangeAgents.fire(agent);
			xterm.focus();
			strictEqual(eventCount, 1);
			_onDidChangeAgents.fire(agent);
			strictEqual(eventCount, 1);
		});
	});
	suite('Input', () => {
		test('hint is not shown when there has been input', () => {
			_onDidChangeAgents.fire(agent);
			xterm.writeln('data');
			setTimeout(() => {
				xterm.focus();
				strictEqual(eventCount, 0);
			}, 50);
		});
	});
});
