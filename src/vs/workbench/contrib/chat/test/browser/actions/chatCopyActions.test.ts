/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionIdentity } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { Context } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IListService } from '../../../../../../platform/list/browser/listService.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CopyChatSessionLinkAction } from '../../../browser/actions/chatCopyActions.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ChatEditorInput } from '../../../browser/widgetHosts/editor/chatEditorInput.js';

suite('Chat editor Copy Link', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(resources: readonly URI[], identities: readonly (IAgentHostSessionIdentity | undefined)[], provisional?: Promise<URI | undefined>, selectedIndices = resources.map((_, index) => index)) {
		const editors: EditorInput[] = resources.map(resource => Object.assign(Object.create(ChatEditorInput.prototype), { _sessionResource: resource }));
		const selectedEditors = selectedIndices.map(index => editors[index]);
		const group = upcastPartial<IEditorGroup>({
			id: 1,
			activeEditor: editors[0],
			selectedEditors,
			getEditorByIndex: index => editors[index],
			getIndexOfEditor: editor => editors.indexOf(editor),
			isSelected: editor => selectedEditors.includes(editor),
		});
		const written: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.set(IEditorService, upcastPartial<IEditorService>({}));
		instantiationService.set(IEditorGroupsService, upcastPartial<IEditorGroupsService>({
			activeGroup: group,
			getGroup: () => group,
		}));
		instantiationService.set(IListService, upcastPartial<IListService>({}));
		instantiationService.set(IClipboardService, upcastPartial<IClipboardService>({
			writeText: async text => { written.push(text); },
		}));
		instantiationService.set(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			resolveSessionResourceIdentity: resource => identities[resources.indexOf(resource)],
		}));
		instantiationService.set(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			waitForPending: async () => provisional ? await provisional : undefined,
		}));
		return { instantiationService, written };
	}

	test('copies the context editor rather than the active editor', async () => {
		const services = createServices([
			URI.parse('agent-host-copilotcli:/active'),
			URI.parse('agent-host-copilotcli:/session'),
		], [
			{ connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/active') },
			{ connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/session') },
		], undefined, [0]);
		await new CopyChatSessionLinkAction().run(services.instantiationService, undefined, { groupId: 1, editorIndex: 1 });
		assert.deepStrictEqual(services.written, ['agent-host-session://copilotcli/session?connectionAuthority=local']);
	});

	test('preserves remote host, exact backend identity and peer chat', async () => {
		const services = createServices([URI.parse('remote-server-copilot:/session#peer chat')], [{
			connectionAuthority: 'server', backendSession: URI.parse('ahp-session://provider/session?tenant=one'),
		}]);
		await new CopyChatSessionLinkAction().run(services.instantiationService, { groupId: 1, editorIndex: 0 });
		assert.deepStrictEqual(services.written, ['agent-host-session://ahp-session/session?connectionAuthority=server&session=ahp-session%3A%2F%2Fprovider%2Fsession%3Ftenant%253Done&chat=peer%20chat']);
	});

	test('waits for the provisional backend instead of copying the untitled UI identity', async () => {
		const pending = new DeferredPromise<URI | undefined>();
		const services = createServices([URI.parse('agent-host-copilotcli:/untitled-editor')], [{
			connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/untitled-editor'),
		}], pending.p);
		const copying = new CopyChatSessionLinkAction().run(services.instantiationService, { groupId: 1, editorIndex: 0 });
		await pending.complete(URI.parse('copilotcli:/actual-session'));
		await copying;
		assert.deepStrictEqual(services.written, ['agent-host-session://copilotcli/actual-session?connectionAuthority=local']);
	});

	test('copies selected chats once each with one URL per line', async () => {
		const services = createServices([
			URI.parse('agent-host-copilotcli:/one'),
			URI.parse('agent-host-copilotcli:/two'),
			URI.parse('agent-host-copilotcli:/three'),
		], [
			{ connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/one') },
			{ connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/two') },
			{ connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/one') },
		]);
		await new CopyChatSessionLinkAction().run(services.instantiationService, { groupId: 1, editorIndex: 1 });
		assert.deepStrictEqual(services.written, ['agent-host-session://copilotcli/two?connectionAuthority=local\nagent-host-session://copilotcli/one?connectionAuthority=local']);
	});

	test('reports uncreated sessions without changing the clipboard', async () => {
		const services = createServices([URI.parse('agent-host-copilotcli:/untitled-editor')], [{
			connectionAuthority: 'local', backendSession: URI.parse('copilotcli:/untitled-editor'),
		}]);
		await assert.rejects(new CopyChatSessionLinkAction().run(services.instantiationService), /Send a message/);
		assert.deepStrictEqual(services.written, []);
	});

	test('reports unsupported identities without changing the clipboard', async () => {
		const services = createServices([URI.parse('agent-host-copilotcli:/session')], [undefined]);
		await assert.rejects(new CopyChatSessionLinkAction().run(services.instantiationService), /does not have an Agent Host session link/);
		assert.deepStrictEqual(services.written, []);
	});

	test('only shows in Agent Host chat editor menus with AI enabled', () => {
		const menu = new CopyChatSessionLinkAction().desc.menu;
		assert.ok(menu && !Array.isArray(menu));
		const cases = [
			{ enabled: true, editor: ChatEditorInput.EditorID, scheme: 'agent-host-copilotcli' },
			{ enabled: true, editor: ChatEditorInput.EditorID, scheme: 'remote-server-copilot' },
			{ enabled: false, editor: ChatEditorInput.EditorID, scheme: 'agent-host-copilotcli' },
			{ enabled: true, editor: ChatEditorInput.EditorID, scheme: 'vscode-local-chat-session' },
			{ enabled: true, editor: 'workbench.editors.textEditor', scheme: 'file' },
		];
		assert.deepStrictEqual(cases.map(value => {
			const context = new Context(0, null);
			context.setValue('chatIsEnabled', value.enabled);
			context.setValue('activeEditor', value.editor);
			context.setValue('resourceScheme', value.scheme);
			return menu.when?.evaluate(context);
		}), [true, true, false, false, false]);
	});
});
