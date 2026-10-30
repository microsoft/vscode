/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { EditorOpenSource } from '../../../../../platform/editor/common/editor.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService, PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { createTestActiveSession } from '../../../../test/browser/sessionViewTestUtils.js';
import '../../../changes/browser/changesActions.js';
import { SessionChangesEditor } from '../../../changes/browser/sessionChangesEditor.js';
import { IChangesSessionObservables, IChangesViewService } from '../../../changes/common/changesViewService.js';
import { ISessionChangesService } from '../../../changes/common/sessionChangesService.js';
import { setChatWindowOpenServices } from '../../browser/chatWindowOpener.js';

suite('Chat window opener', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const group = (id: number) => upcastPartial<IEditorGroup>({ id });
	const describeGroup = (preferred: PreferredGroup | undefined) => typeof preferred === 'object' ? `group${(preferred as IEditorGroup).id}` : String(preferred);

	/** A chat window's services over its editor area, whose active group is 2, and the main window's (global) ones. */
	function createChatWindow() {
		const opened: string[] = [];
		const globalOpenerService = upcastPartial<IOpenerService>({
			open: async target => { opened.push(`main opener: ${target.toString()}`); return true; },
		});
		const fileService = upcastPartial<IFileService>({ hasProvider: resource => resource.scheme === 'file' });
		const windowEditorService = upcastPartial<IEditorService>({
			openEditor: (async (input: { resource: URI; options?: object }, preferred?: PreferredGroup) => {
				opened.push(`chat window editor area (${describeGroup(preferred)}): ${input.resource.toString()} ${JSON.stringify(input.options)}`);
				return undefined;
			}) as IEditorService['openEditor'],
		});
		const globalChangesService = upcastPartial<ISessionChangesService>({
			openChangesEditor: async (_resource, _options, preferred) => { opened.push(`changes (${describeGroup(preferred)})`); return typeof preferred === 'object' ? preferred as IEditorGroup : undefined; },
		});
		const editorArea = upcastPartial<IEditorPart>({ activeGroup: group(2) });
		const services = new ServiceCollection();
		setChatWindowOpenServices(services, editorArea, windowEditorService, () => opened.push('editor area shown'), globalOpenerService, fileService, globalChangesService);
		const instantiationService = disposables.add(new TestInstantiationService(services));
		return { opened, instantiationService };
	}

	test('a file of a link in a response of the chat opens in the active group of the window\'s editor area, which shows, by the window that hosts the chat and not by focus, also to the side, and anything else opens as anywhere', async () => {
		const { opened, instantiationService } = createChatWindow();
		const openerService = instantiationService.invokeFunction(accessor => accessor.get(IOpenerService));

		await openerService.open(URI.file('/repo/notes.ts').with({ fragment: 'L3' }), { fromUserGesture: true });
		await openerService.open(URI.file('/repo/a.ts'), { openToSide: true, editorOptions: { pinned: true } });
		await openerService.open('https://example.com/');
		await openerService.open(URI.parse('command:workbench.action.foo'));
		await openerService.open(URI.file('/repo/b.ts'), { openExternal: true });

		assert.deepStrictEqual(opened, [
			`chat window editor area (group2): file:///repo/notes.ts {"selection":{"startLineNumber":3,"startColumn":1},"source":${EditorOpenSource.USER}}`,
			'editor area shown',
			`chat window editor area (group2): file:///repo/a.ts {"source":${EditorOpenSource.API},"pinned":true}`,
			'editor area shown',
			'main opener: https://example.com/',
			'main opener: command:workbench.action.foo',
			'main opener: file:///repo/b.ts',
		]);
	});

	test('the Changes editor of the chat, such as from its changes pill, opens in the window\'s editor area, in its active group unless one is given, and the editor area shows', async () => {
		const { opened, instantiationService } = createChatWindow();
		const changesService = instantiationService.invokeFunction(accessor => accessor.get(ISessionChangesService));

		await changesService.openChangesEditor(URI.parse('session:/chat'));
		await changesService.openChangesEditor(URI.parse('session:/chat'), undefined, group(5));

		assert.deepStrictEqual(opened, ['changes (group2)', 'editor area shown', 'changes (group5)', 'editor area shown']);
	});

	test('Open File of a file of a Changes editor opens the file in the group of that editor in a chat window, whichever window has focus, and in the main window as ever', async () => {
		const session = createTestActiveSession('chat');
		const opened: string[] = [];
		const mainGroup = group(1);
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChangesViewService, upcastPartial<IChangesViewService>({
			getSessionChanges: () => upcastPartial<IChangesSessionObservables>({ changesObs: constObservable([]) }),
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ mainWindowActiveSession: constObservable(undefined), activeSession: constObservable(undefined) }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ mainPart: upcastPartial<IEditorPart>({ groups: [mainGroup] }) }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
			openEditor: (async (input: { resource: URI }, preferred?: PreferredGroup) => {
				opened.push(`${describeGroup(preferred)}: ${input.resource.path}`);
				return undefined;
			}) as IEditorService['openEditor'],
		}));
		const editorIn = (editorGroup: IEditorGroup) => {
			const editor = Object.create(SessionChangesEditor.prototype) as SessionChangesEditor;
			Object.defineProperty(editor, 'group', { value: editorGroup });
			return editor;
		};
		const openFile = (editor: SessionChangesEditor) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.changes.openFile')!.handler(accessor, URI.file('/repo/a.ts'), { session, editor }));

		await openFile(editorIn(group(7)));
		await openFile(editorIn(mainGroup));

		assert.deepStrictEqual(opened, ['group7: /repo/a.ts', 'undefined: /repo/a.ts']);
	});
});
