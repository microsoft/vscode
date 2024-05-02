/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// eslint-disable-next-line local/code-import-patterns, local/code-amd-node-module
import { Terminal } from '@xterm/xterm';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ShellIntegrationAddon } from 'vs/platform/terminal/common/xterm/shellIntegrationAddon';
import { workbenchInstantiationService } from 'vs/workbench/test/browser/workbenchTestServices';
import { NullLogService } from 'vs/platform/log/common/log';
import { InitialHintAddon } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminal.initialHint.contribution';
import { getActiveDocument } from 'vs/base/browser/dom';
import { IInlineChatSession, IInlineChatSessionProvider, InlineChatProviderChangeEvent } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { Emitter } from 'vs/base/common/event';
import { strictEqual } from 'assert';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ITextModel } from 'vs/editor/common/model';
import { ISelection } from 'vs/editor/common/core/selection';
import { CancellationToken } from 'vs/base/common/cancellation';

// Test TerminalInitialHintAddon

suite('Terminal Initial Hint Addon', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let eventCount = 0;
	let xterm: Terminal;
	let initialHintAddon: InitialHintAddon;
	const _onDidChangeProviders: Emitter<InlineChatProviderChangeEvent> = new Emitter();
	const onDidChangeProviders = _onDidChangeProviders.event;
	setup(() => {
		const instantiationService = workbenchInstantiationService({}, store);
		xterm = store.add(new Terminal());
		const shellIntegrationAddon = store.add(new ShellIntegrationAddon('', true, undefined, new NullLogService));
		initialHintAddon = store.add(instantiationService.createInstance(InitialHintAddon, shellIntegrationAddon.capabilities, onDidChangeProviders));
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
		test('hint is shown when there is a chat provider', () => {
			eventCount = 0;
			const provider: IInlineChatSessionProvider = {
				extensionId: new ExtensionIdentifier('test'),
				label: 'blahblah',
				prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): Promise<IInlineChatSession> {
					throw new Error('Method not implemented.');
				},
				provideResponse() {
					throw new Error('Method not implemented.');
				}
			};
			_onDidChangeProviders.fire({ added: provider });
			xterm.focus();
			strictEqual(eventCount, 1);
		});
	});
	suite('Input', () => {
		test('hint is not shown when there has been input', () => {
			const provider: IInlineChatSessionProvider = {
				extensionId: new ExtensionIdentifier('test'),
				label: 'blahblah',
				prepareInlineChatSession(model: ITextModel, range: ISelection, token: CancellationToken): Promise<IInlineChatSession> {
					throw new Error('Method not implemented.');
				},
				provideResponse() {
					throw new Error('Method not implemented.');
				}
			};
			_onDidChangeProviders.fire({ added: provider });
			xterm.writeln('data');
			setTimeout(() => {
				xterm.focus();
				strictEqual(eventCount, 0);
			}, 50);
		});
	});
});


