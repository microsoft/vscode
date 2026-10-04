/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../base/common/network.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { isIMenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IListService } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ActiveEditorContext, IsSessionsWindowContext, ResourceContextKey, WorkspaceFolderCountContext } from '../../../../../workbench/common/contextkeys.js';
import { SESSIONS_FILES_VIEW_ID, TEXT_FILE_EDITOR_ID } from '../../../../../workbench/contrib/files/common/files.js';
import { Extensions, IViewContainersRegistry, IViewsRegistry } from '../../../../../workbench/common/views.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { FileDownload } from '../../../../../workbench/contrib/files/browser/fileImportExport.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { TestFileEditorInput } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { Menus } from '../../../../browser/menus.js';
import { DesktopLayoutContext, IsPhoneLayoutContext, IsQuickChatSessionContext, SessionHasWorkspaceContext } from '../../../../common/contextkeys.js';
import { EmptyFileEditorInput } from '../../../editor/browser/emptyFileEditorInput.js';
import { DownloadRemoteFileAction, RegisterFilesViewContribution, SESSIONS_FILES_CONTAINER_ID } from '../../browser/files.contribution.js';
import { SESSIONS_FILES_EMPTY_VIEW_ID } from '../../browser/filesView.js';

suite('Sessions Files view availability', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows only the empty Files view for No workspace, including while previous folders are mounted', () => {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
		const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(SESSIONS_FILES_CONTAINER_ID)!;
		new RegisterFilesViewContribution();
		const views = viewsRegistry.getViews(container);
		store.add(toDisposable(() => viewsRegistry.deregisterViews(views, container)));
		const context = store.add(new MockContextKeyService());
		const desktop = DesktopLayoutContext.bindTo(context);
		const quickChat = IsQuickChatSessionContext.bindTo(context);
		const hasWorkspace = SessionHasWorkspaceContext.bindTo(context);
		const folders = WorkspaceFolderCountContext.bindTo(context);
		const phone = IsPhoneLayoutContext.bindTo(context);

		const cases = [
			{ desktop: true, quickChat: true, hasWorkspace: false, folders: 0, phone: false },
			{ desktop: true, quickChat: true, hasWorkspace: false, folders: 1, phone: false },
			{ desktop: true, quickChat: false, hasWorkspace: true, folders: 1, phone: false },
			{ desktop: true, quickChat: false, hasWorkspace: true, folders: 0, phone: false },
			{ desktop: false, quickChat: true, hasWorkspace: false, folders: 0, phone: false },
			{ desktop: true, quickChat: true, hasWorkspace: false, folders: 0, phone: true },
		];
		const visibleViews = cases.map(testCase => {
			desktop.set(testCase.desktop);
			quickChat.set(testCase.quickChat);
			hasWorkspace.set(testCase.hasWorkspace);
			folders.set(testCase.folders);
			phone.set(testCase.phone);
			return views.filter(view => !view.when || view.when.evaluate({
				getValue: key => context.getContextKeyValue(key),
			})).map(view => view.id);
		});

		assert.deepStrictEqual(visibleViews, [
			[SESSIONS_FILES_EMPTY_VIEW_ID],
			[SESSIONS_FILES_EMPTY_VIEW_ID],
			[SESSIONS_FILES_VIEW_ID],
			[SESSIONS_FILES_EMPTY_VIEW_ID],
			[],
			[],
		]);
	});
});

suite('Sessions Download Remote File action', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows Download in the editor title menu only for remote filesystem resources', () => {
		const context = store.add(new MockContextKeyService());
		const sessions = IsSessionsWindowContext.bindTo(context);
		const activeEditor = ActiveEditorContext.bindTo(context);
		const scheme = ResourceContextKey.Scheme.bindTo(context);
		const fileSystem = ResourceContextKey.IsFileSystemResource.bindTo(context);
		const desktop = DesktopLayoutContext.bindTo(context);
		const menuItems = [
			{ id: Menus.SessionsEditorHeaderPrimary, name: 'header' },
			{ id: Menus.SessionsEditorTitle, name: 'sessionsEditorTitle' },
			{ id: MenuId.EditorTitle, name: 'editorTitle' },
		].flatMap(menu => MenuRegistry.getMenuItems(menu.id)
			.filter(isIMenuItem)
			.filter(item => item.command.id === DownloadRemoteFileAction.ID)
			.map(item => ({ item, menu: menu.name })));
		const cases = [
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: AGENT_HOST_SCHEME, sessions: true, fileSystem: true, desktop: true },
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: Schemas.vscodeRemote, sessions: true, fileSystem: true, desktop: true },
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: AGENT_HOST_SCHEME, sessions: true, fileSystem: true, desktop: false },
			{ activeEditor: EmptyFileEditorInput.EDITOR_ID, scheme: AGENT_HOST_SCHEME, sessions: true, fileSystem: true, desktop: true },
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: Schemas.file, sessions: true, fileSystem: true, desktop: true },
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: Schemas.untitled, sessions: true, fileSystem: false, desktop: true },
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: AGENT_HOST_SCHEME, sessions: false, fileSystem: true, desktop: true },
			{ activeEditor: TEXT_FILE_EDITOR_ID, scheme: AGENT_HOST_SCHEME, sessions: true, fileSystem: false, desktop: true },
		];
		assert.deepStrictEqual(cases.map(testCase => {
			sessions.set(testCase.sessions);
			activeEditor.set(testCase.activeEditor);
			scheme.set(testCase.scheme);
			fileSystem.set(testCase.fileSystem);
			desktop.set(testCase.desktop);
			return menuItems.filter(({ item }) => item.when?.evaluate({
				getValue: key => context.getContextKeyValue(key),
			})).map(({ item, menu }) => ({ menu, group: item.group }));
		}), [
			[{ menu: 'sessionsEditorTitle', group: '2_download' }],
			[{ menu: 'sessionsEditorTitle', group: '2_download' }],
			[{ menu: 'editorTitle', group: 'navigation' }],
			[],
			[],
			[],
			[],
			[],
		]);
	});

	function createFileStat(resource: URI): IFileStatWithMetadata {
		return {
			resource,
			name: basename(resource),
			isFile: true,
			isDirectory: false,
			isSymbolicLink: false,
			children: undefined,
			mtime: 0,
			ctime: 0,
			etag: 'test',
			size: 0,
			readonly: false,
			locked: false,
			executable: false,
		};
	}

	function createServices(editors: EditorInput[], activeEditor: EditorInput) {
		const instantiationService = store.add(new TestInstantiationService());
		const group = new class extends mock<IEditorGroup>() {
			override id = 1;
			override activeEditor = activeEditor;
			override selectedEditors = editors;
			override getEditorByIndex(index: number) { return editors[index]; }
			override getIndexOfEditor(editor: EditorInput) { return editors.indexOf(editor); }
			override isSelected(editor: EditorInput) { return editors.includes(editor); }
		}();
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IEditorGroupsService, { activeGroup: group, getGroup: () => group });
		instantiationService.stub(IListService, {});
		instantiationService.stub(IInstantiationService, instantiationService);
		return instantiationService;
	}

	test('downloads the invoked editors rather than another active editor or the Explorer selection', async () => {
		const remote = store.add(new TestFileEditorInput(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path: '/index.html' }), 'test'));
		const remoteWorkspace = store.add(new TestFileEditorInput(URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/style.css' }), 'test'));
		const local = store.add(new TestFileEditorInput(URI.file('/local.html'), 'test'));
		const instantiationService = createServices([remote, remoteWorkspace, local], local);
		instantiationService.stub(IEditorService, { findEditors: () => [{ editor: remote, groupId: 1 }] });
		const downloaded: URI[] = [];
		instantiationService.stub(IFileService, {
			resolve: async resource => createFileStat(resource),
		});
		instantiationService.stub(INotificationService, {});
		instantiationService.stubInstance(FileDownload, {
			download: async sources => { downloaded.push(...sources.map(source => source.resource)); }
		});

		await new DownloadRemoteFileAction().run(instantiationService, { groupId: 1, editorIndex: 0 });
		await new DownloadRemoteFileAction().run(instantiationService, remote.resource);

		assert.deepStrictEqual(downloaded, [remote.resource, remoteWorkspace.resource, remote.resource, remoteWorkspace.resource]);
	});

	for (const failure of ['resolve', 'download']) {
		test(`notifies and propagates ${failure} failures`, async () => {
			const remote = store.add(new TestFileEditorInput(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path: '/index.html' }), 'test'));
			const instantiationService = createServices([remote], remote);
			const error = new Error('Download failed');
			const notifications: Parameters<INotificationService['error']>[0][] = [];
			instantiationService.stub(IFileService, {
				resolve: async resource => {
					if (failure === 'resolve') {
						throw error;
					}
					return createFileStat(resource);
				},
			});
			instantiationService.stub(INotificationService, { error: error => { notifications.push(error); } });
			instantiationService.stubInstance(FileDownload, { download: async () => { throw error; } });

			await assert.rejects(new DownloadRemoteFileAction().run(instantiationService, { groupId: 1, editorIndex: 0 }), error);
			assert.deepStrictEqual(notifications, [error]);
		});
	}
});
