/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { ACTIVE_GROUP, IEditorService, PreferredGroup } from '../../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { IChatWidget, IQuickChatService } from '../../../browser/chat.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { ChatWidgetService } from '../../../browser/widget/chatWidgetService.js';
import { IChatEditorOptions } from '../../../browser/widgetHosts/editor/chatEditor.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';

suite('ChatWidgetService - new Agent Host editor session', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(widget: IChatWidget | undefined) {
		const folderAssignments: Array<{ sessionResource: URI; workspaceFolder: URI }> = [];
		const clearedResources: URI[] = [];
		const openCalls: Array<{ sessionResource: URI; target: PreferredGroup | undefined; options: IChatEditorOptions | undefined }> = [];
		const folderService = new class extends mock<IAgentHostNewSessionFolderService>() {
			override setFolder(sessionResource: URI, workspaceFolder: URI): void {
				folderAssignments.push({ sessionResource, workspaceFolder });
			}
			override clear(sessionResource: URI): void {
				clearedResources.push(sessionResource);
			}
		};
		const service = disposables.add(new ChatWidgetService(
			upcastPartial<IEditorGroupsService>({}),
			upcastPartial<IViewsService>({}),
			upcastPartial<IQuickChatService>({}),
			upcastPartial<ILayoutService>({}),
			upcastPartial<IEditorService>({}),
			upcastPartial<IChatService>({}),
			new NullLogService(),
			folderService,
		));
		service.openSession = (async (sessionResource: URI, target?: PreferredGroup, options?: IChatEditorOptions) => {
			openCalls.push({ sessionResource, target, options });
			return widget;
		}) as ChatWidgetService['openSession'];
		return { service, folderAssignments, clearedResources, openCalls };
	}

	test('creates fresh typed resources, binds the folder, and returns the exact focused editor widget', async () => {
		const widget = upcastPartial<IChatWidget>({});
		const { service, folderAssignments, clearedResources, openCalls } = createService(widget);
		const workspaceFolder = URI.file('/workspace');

		const first = await service.openNewAgentHostEditorSession({ sessionType: 'agent-host-test', displayName: 'Issue Wizard', workspaceFolder });
		const second = await service.openNewAgentHostEditorSession({ sessionType: 'agent-host-test', displayName: 'Issue Wizard', workspaceFolder });

		assert.deepStrictEqual({
			created: !!first && !!second,
			fresh: first?.sessionResource.toString() !== second?.sessionResource.toString(),
			schemes: [first?.sessionResource.scheme, second?.sessionResource.scheme],
			exactWidgets: [first?.widget === widget, second?.widget === widget],
			folderAssignments: folderAssignments.map(assignment => ({
				sessionResource: assignment.sessionResource.toString(),
				workspaceFolder: assignment.workspaceFolder.toString(),
			})),
			openCalls: openCalls.map(call => ({
				sessionResource: call.sessionResource.toString(),
				target: call.target,
				pinned: call.options?.pinned,
				selectionReason: call.options?.sessionTypeSelectionReason,
				title: call.options?.title,
			})),
			clearedResources,
		}, {
			created: true,
			fresh: true,
			schemes: ['agent-host-test', 'agent-host-test'],
			exactWidgets: [true, true],
			folderAssignments: [
				{ sessionResource: first?.sessionResource.toString(), workspaceFolder: workspaceFolder.toString() },
				{ sessionResource: second?.sessionResource.toString(), workspaceFolder: workspaceFolder.toString() },
			],
			openCalls: [first, second].map(result => ({
				sessionResource: result?.sessionResource.toString(),
				target: ACTIVE_GROUP,
				pinned: true,
				selectionReason: 'explicitOverride',
				title: { fallback: 'Issue Wizard' },
			})),
			clearedResources: [],
		});
	});

	test('clears the provisional folder binding when the editor widget cannot be opened', async () => {
		const { service, folderAssignments, clearedResources } = createService(undefined);
		const result = await service.openNewAgentHostEditorSession({ sessionType: 'agent-host-test', displayName: 'Issue Wizard', workspaceFolder: URI.file('/workspace') });

		assert.deepStrictEqual({
			result,
			folderAssignments: folderAssignments.length,
			clearedAssignedResource: clearedResources[0]?.toString() === folderAssignments[0]?.sessionResource.toString(),
		}, {
			result: undefined,
			folderAssignments: 1,
			clearedAssignedResource: true,
		});
	});
});
