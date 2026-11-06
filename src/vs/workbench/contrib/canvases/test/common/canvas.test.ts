/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Verbosity } from '../../../../common/editor.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { CanvasInput, canPresentCanvasInGroup, ICanvas, ICanvasContextService } from '../../common/canvas.js';

suite('CanvasInput', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const editorGroupsService = upcastPartial<IEditorGroupsService>({
		mainPart: upcastPartial<IEditorPart>({ windowId: 1 }),
		getGroup: id => upcastPartial<IEditorGroup>({ windowId: id === 1 ? 1 : 2 }),
	});
	const environmentService = (isSessionsWindow = false) => upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow });
	const contextService = (canPresentInGroup?: ICanvasContextService['canPresentInGroup']) => upcastPartial<ICanvasContextService>({ canPresentInGroup });

	test('keeps transient sources out of editor identity and does not restore', () => {
		const source = 'https://secret.example/canvas?token=sensitive';
		const canvas = (title: string): ICanvas => ({
			resource: URI.parse('agent-host-canvas:/preview'),
			instanceId: 'preview',
			title,
			source: URI.parse(source),
		});
		const input = store.add(new CanvasInput({
			providerId: 'local-agent-host',
			session: URI.parse('agent-host-session:/session'),
			chat: URI.parse('agent-host-chat:/session/main'),
			canvas: URI.parse('agent-host-canvas:/preview'),
		}, canvas('Preview'), editorGroupsService, environmentService(), contextService()));
		const labels: string[] = [];
		store.add(input.onDidChangeLabel(() => labels.push(input.getName())));

		input.setCanvas(canvas('Updated Preview'));

		assert.deepStrictEqual({
			name: input.getName(),
			labels,
			canReopen: input.canReopen(),
			containsSource: input.resource.toString().includes('secret.example'),
		}, {
			name: 'Updated Preview',
			labels: ['Updated Preview'],
			canReopen: false,
			containsSource: false,
		});
	});

	test('allows main-window movement but rejects auxiliary windows', () => {
		const input = store.add(new CanvasInput({
			providerId: 'local',
			session: URI.parse('session:/owner'),
			chat: URI.parse('chat:/owner'),
			canvas: URI.parse('canvas:/preview'),
		}, {
			resource: URI.parse('canvas:/preview'),
			instanceId: 'preview',
			title: 'Preview',
			source: URI.parse('https://example.test'),
		}, editorGroupsService, environmentService(), contextService()));

		assert.deepStrictEqual({ main: input.canMove(1, 1), auxiliary: typeof input.canMove(1, 2) }, { main: true, auxiliary: 'string' });
	});

	test('moves to a window outside the main window only where its context service presents canvases of its owner, as a canvas editor shows it only there', () => {
		const owner = { providerId: 'local', session: URI.parse('session:/owner'), chat: URI.parse('chat:/owner') };
		// A window of its own that shows the owning chat, such as a chat window: window 2.
		const presenting = contextService((candidate, group) => candidate.chat.toString() === owner.chat.toString() && group.windowId === 2);
		const input = store.add(new CanvasInput({ ...owner, canvas: URI.parse('canvas:/preview') }, undefined, editorGroupsService, environmentService(), presenting));
		const otherChat = store.add(new CanvasInput({ ...owner, chat: URI.parse('chat:/other'), canvas: URI.parse('canvas:/preview') }, undefined, editorGroupsService, environmentService(), presenting));
		const group = (windowId: number) => upcastPartial<IEditorGroup>({ windowId });

		assert.deepStrictEqual({
			main: input.canMove(1, 1),
			ownersWindow: input.canMove(1, 2),
			otherChat: typeof otherChat.canMove(1, 2),
			editorShowsInOwnersWindow: canPresentCanvasInGroup(input.reference, group(2), editorGroupsService, presenting),
			editorShowsInAnotherWindow: canPresentCanvasInGroup(input.reference, group(3), editorGroupsService, presenting),
			editorShowsOtherChat: canPresentCanvasInGroup(otherChat.reference, group(2), editorGroupsService, presenting),
		}, { main: true, ownersWindow: true, otherChat: 'string', editorShowsInOwnersWindow: true, editorShowsInAnotherWindow: false, editorShowsOtherChat: false });
	});

	test('shows reopen instructions only in the long title', () => {
		const labels = [false, true].map(isSessionsWindow => {
			const input = store.add(new CanvasInput({
				providerId: 'local',
				session: URI.parse('session:/owner'),
				chat: URI.parse('chat:/owner'),
				canvas: URI.parse('canvas:/preview'),
			}, undefined, editorGroupsService, environmentService(isSessionsWindow), contextService()));
			return {
				description: input.getDescription(),
				shortTitle: input.getTitle(Verbosity.SHORT),
				mediumTitle: input.getTitle(Verbosity.MEDIUM),
				longTitle: input.getTitle(Verbosity.LONG),
			};
		});

		assert.deepStrictEqual(labels, [
			{
				description: undefined,
				shortTitle: 'Canvas',
				mediumTitle: 'Canvas',
				longTitle: 'Canvas - Closing this tab hides the canvas. Reopen it from its canvas pill or ask the agent to open it again.',
			},
			{
				description: undefined,
				shortTitle: 'Canvas',
				mediumTitle: 'Canvas',
				longTitle: 'Canvas - Closing this tab hides the canvas. Reopen it from the Canvas submenu in Add Tab, use its canvas pill, or ask the agent to open it again.',
			},
		]);
	});
});
