/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { Emitter, Event } from '../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionDescriptionRegistry } from '../../../services/extensions/common/extensionDescriptionRegistry.js';
import { MainThreadDebugServiceShape } from '../../common/extHost.protocol.js';
import { IExtHostCommands } from '../../common/extHostCommands.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { ExtHostDebugServiceBase, ExtHostDebugSession } from '../../common/extHostDebugService.js';
import { IExtHostEditorTabs } from '../../common/extHostEditorTabs.js';
import { IExtHostExtensionService } from '../../common/extHostExtensionService.js';
import { IExtHostTesting } from '../../common/extHostTesting.js';
import { DebugAdapterInlineImplementation } from '../../common/extHostTypes.js';
import { IExtHostVariableResolverProvider } from '../../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('Extension host inline debug adapters', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const message: DebugProtocol.ProtocolMessage = { type: 'event', seq: 1 };

	function createAdapter(implementation: vscode.DebugAdapter) {
		const proxy = new class extends mock<MainThreadDebugServiceShape>() {
			override $registerDebugTypes(): void { }
		};
		const service = store.add(new class extends ExtHostDebugServiceBase {
			createInlineAdapter() {
				return this.createDebugAdapter(
					new DebugAdapterInlineImplementation(implementation),
					new ExtHostDebugSession(proxy, 'test', 'test', 'test', undefined, { type: 'test', request: 'launch', name: 'test' }, undefined)
				);
			}
		}(
			SingleProxyRPCProtocol(proxy),
			new class extends mock<IExtHostWorkspace>() { },
			upcastPartial<IExtHostExtensionService>({
				async getExtensionRegistry(): Promise<ExtensionDescriptionRegistry> {
					return new class extends mock<ExtensionDescriptionRegistry>() {
						override readonly onDidChange = Event.None;
						override getAllExtensionDescriptions() { return []; }
					};
				}
			}),
			new class extends mock<IExtHostConfiguration>() { },
			new class extends mock<IExtHostEditorTabs>() { },
			new class extends mock<IExtHostVariableResolverProvider>() { },
			new class extends mock<IExtHostCommands>() { },
			new class extends mock<IExtHostTesting>() { }
		));
		const adapter = service.createInlineAdapter();
		assert.ok(adapter);
		return store.add(adapter);
	}

	test('stopping releases a subscription to a longer-lived publisher', async () => {
		const emitter = store.add(new Emitter<vscode.DebugProtocolMessage>());
		let disposed = 0;
		const adapter = createAdapter({
			onDidSendMessage: emitter.event,
			handleMessage() { },
			dispose() { disposed++; }
		});
		await adapter.startSession();
		await adapter.stopSession();
		assert.deepStrictEqual({ hasListeners: emitter.hasListeners(), disposed }, { hasListeners: false, disposed: 1 });
	});

	test('disposing releases the subscription', () => {
		const emitter = store.add(new Emitter<vscode.DebugProtocolMessage>());
		const adapter = createAdapter({
			onDidSendMessage: emitter.event,
			handleMessage() { },
			dispose() { }
		});
		adapter.dispose();
		assert.strictEqual(emitter.hasListeners(), false);
	});

	test('stopping preserves communication for surviving adapters', async () => {
		const emitter = store.add(new Emitter<vscode.DebugProtocolMessage>());
		const received: string[] = [];
		const sent: vscode.DebugProtocolMessage[] = [];
		const create = (name: string) => {
			const adapter = createAdapter({
				onDidSendMessage: emitter.event,
				handleMessage: message => sent.push(message),
				dispose() { emitter.fire(message); }
			});
			adapter.onMessage(() => received.push(name));
			return adapter;
		};
		const first = create('first');
		const second = create('second');
		first.sendMessage(message);
		emitter.fire(message);
		await first.stopSession();
		second.sendMessage(message);
		emitter.fire(message);
		await second.stopSession();
		assert.deepStrictEqual({ received, sent, hasListeners: emitter.hasListeners() }, {
			received: ['first', 'second', 'second', 'second'],
			sent: [message, message],
			hasListeners: false
		});
	});

	test('stopping releases the subscription when implementation disposal throws', () => {
		const emitter = store.add(new Emitter<vscode.DebugProtocolMessage>());
		const error = new Error('implementation disposal failed');
		const adapter = createAdapter({
			onDidSendMessage: emitter.event,
			handleMessage() { },
			dispose() { throw error; }
		});
		assert.throws(() => adapter.stopSession(), error);
		assert.strictEqual(emitter.hasListeners(), false);
	});
});
