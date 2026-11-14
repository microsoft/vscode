/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuProvider } from '../../../../../../../base/browser/contextmenu.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { ToolBar } from '../../../../../../../base/browser/ui/toolbar/toolbar.js';
import { Action } from '../../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ISCMService } from '../../../../../scm/common/scm.js';
import type { IChatWidget } from '../../../../browser/chat.js';
import { IAgentHostCustomizationService } from '../../../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { AgentHostFolderPickerActionItem } from '../../../../browser/agentSessions/agentHost/agentHostFolderPickerActionItem.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import '../../../../browser/widget/media/chat.css';

suite('AgentHostFolderPickerActionItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let root: HTMLElement;
	setup(() => {
		root = document.createElement('div');
		document.body.appendChild(root);
	});
	teardown(() => root.remove());

	test('in a narrow row, the chip keeps its name, ellipsized, and needs its width, so that its neighbors overflow rather than being clipped', () => {
		const folder = URI.file('/work/a-repository-with-a-name-far-too-long-to-fit-in-the-chat-input-row');
		const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: folder, folders: [upcastPartial<IWorkspaceFolder>({ uri: folder, name: 'a-repository-with-a-name-far-too-long-to-fit-in-the-chat-input-row' })] }),
			getWorkbenchState: () => WorkbenchState.FOLDER,
			onDidChangeWorkspaceFolders: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => [] as IFolderLocation[],
			getLocation: () => undefined,
			resolveLocation: async () => undefined,
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: Event.None, getFolder: () => folder, isNoWorkspace: () => false, getDefaultFolder: () => undefined }));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({ onDidChange: Event.None, getResolvedConfig: () => undefined, getPreparedSessionConfig: () => undefined }));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: Event.None }) }));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IAgentHostCustomizationService, upcastPartial<IAgentHostCustomizationService>({ onDidChangeCustomizations: Event.None, getClientWorkingDirectoryUris: () => [] }));
		instantiationService.stub(ISCMService, upcastPartial<ISCMService>({ getRepository: () => undefined }));
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: session }), onDidChangeViewModel: Event.None });

		// As the chat input's secondary row lays it out
		root.className = 'interactive-session';
		const row = document.createElement('div');
		row.className = 'chat-secondary-toolbar';
		root.appendChild(row);
		const lane = document.createElement('div');
		lane.className = 'chat-secondary-input-toolbar';
		row.appendChild(lane);
		const folderAction = store.add(new Action('workbench.action.chat.openAgentHostFolderPicker', 'Folder'));
		const neighbors = [store.add(new Action('copilot', 'Copilot')), store.add(new Action('permissions', 'Manual permissions'))];
		const compact = observableValue('compact', true);
		let chip: AgentHostFolderPickerActionItem | undefined;
		let availableWidth = 600;
		const contextMenuProvider: IContextMenuProvider = { showContextMenu: () => { } };
		const toolbar = store.add(new ToolBar(lane, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'all',
				minItems: 1,
				actionMinWidth: 48,
				// As the chat input budgets it, and compact neighbors at their control width
				getActionMinWidth: action => (action.id === folderAction.id ? chip?.getMinimumWidth() : undefined) ?? 22,
				getAvailableWidth: () => availableWidth,
			},
			actionViewItemProvider: action => action.id === folderAction.id
				? chip = instantiationService.createInstance(AgentHostFolderPickerActionItem, upcastPartial<MenuItemAction>(folderAction), widget, { compact })
				: undefined,
		}));
		toolbar.setActions([folderAction, ...neighbors]);
		toolbar.relayout();
		const label = lane.querySelector<HTMLElement>('.agent-host-folder-chip .chat-input-picker-label');
		const chipWidth = chip?.getMinimumWidth() ?? 0;
		// Room for the chip with its name, but not for its neighbors as well
		availableWidth = 200;
		toolbar.relayout();

		assert.deepStrictEqual({
			label: label?.textContent,
			ellipsized: !!label && label.scrollWidth > label.clientWidth && mainWindow.getComputedStyle(label).textOverflow === 'ellipsis',
			bounded: !!label && label.getBoundingClientRect().width <= 160,
			needsMoreThanCompact: chipWidth > 22,
			overflowed: toolbar.hasOverflow(),
		}, {
			label: 'a-repository-with-a-name-far-too-long-to-fit-in-the-chat-input-row',
			ellipsized: true,
			bounded: true,
			needsMoreThanCompact: true,
			overflowed: true,
		});
	});
	test('last in a narrow row, it needs the width of the name it shows now: a shorter name, or No Workspace, brings it back from the overflow', () => {
		const primary = URI.file('/work/vscode');
		const longName = URI.file('/work/a-worktree-with-a-name-far-too-long-to-fit-in-the-chat-input-row');
		const shortName = URI.file('/work/fix');
		const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });
		let selected = shortName;
		let noWorkspace = false;
		const onDidChangeFolder = store.add(new Emitter<URI>());
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: primary, name: 'vscode' })] }),
			getWorkbenchState: () => WorkbenchState.FOLDER,
			onDidChangeWorkspaceFolders: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => [] as IFolderLocation[],
			getLocation: () => undefined,
			resolveLocation: async () => undefined,
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({ onDidChangeFolder: onDidChangeFolder.event, getFolder: () => noWorkspace ? undefined : selected, isNoWorkspace: () => noWorkspace, getDefaultFolder: () => undefined }));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({ onDidChange: Event.None, getResolvedConfig: () => undefined, getPreparedSessionConfig: () => undefined }));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: Event.None }) }));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IAgentHostCustomizationService, upcastPartial<IAgentHostCustomizationService>({ onDidChangeCustomizations: Event.None, getClientWorkingDirectoryUris: () => [] }));
		instantiationService.stub(ISCMService, upcastPartial<ISCMService>({ getRepository: () => undefined }));
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<NonNullable<IChatWidget['viewModel']>>({ sessionResource: session }), onDidChangeViewModel: Event.None });

		root.className = 'interactive-session';
		const row = document.createElement('div');
		row.className = 'chat-secondary-toolbar';
		root.appendChild(row);
		const lane = document.createElement('div');
		lane.className = 'chat-secondary-input-toolbar';
		row.appendChild(lane);
		const folderAction = store.add(new Action('workbench.action.chat.openAgentHostFolderPicker', 'Folder'));
		const neighbors = [store.add(new Action('copilot', 'Copilot')), store.add(new Action('permissions', 'Manual permissions'))];
		let chip: AgentHostFolderPickerActionItem | undefined;
		const contextMenuProvider: IContextMenuProvider = { showContextMenu: () => { } };
		const toolbar = store.add(new ToolBar(lane, contextMenuProvider, {
			responsiveBehavior: {
				enabled: true,
				kind: 'all',
				minItems: 1,
				actionMinWidth: 48,
				getActionMinWidth: action => (action.id === folderAction.id ? chip?.getMinimumWidth() : undefined) ?? 22,
				// Room for its neighbors and a chip with a short name, not a long one
				getAvailableWidth: () => 160,
			},
			actionViewItemProvider: action => action.id === folderAction.id
				? chip = instantiationService.createInstance(AgentHostFolderPickerActionItem, upcastPartial<MenuItemAction>(folderAction), widget, { compact: observableValue('compact', true) })
				: undefined,
		}));
		// Last, as in the chat input
		toolbar.setActions([...neighbors, folderAction]);
		const select = (folder: URI | 'none') => {
			noWorkspace = folder === 'none';
			selected = folder === 'none' ? selected : folder;
			onDidChangeFolder.fire(session);
			toolbar.relayout();
			return { minWidth: chip?.getMinimumWidth() ?? 0, overflowed: toolbar.hasOverflow() };
		};

		const short = select(shortName);
		const long = select(longName);
		// Changed while in the overflow
		const shortAgain = select(shortName);
		const none = select('none');

		assert.deepStrictEqual({
			short: short.overflowed,
			long: long.overflowed,
			shortAgain: shortAgain.overflowed,
			none: none.overflowed,
			shorterNeedsLess: shortAgain.minWidth < long.minWidth,
			sameAsBefore: shortAgain.minWidth === short.minWidth,
		}, { short: false, long: true, shortAgain: false, none: false, shorterNeedsLess: true, sameAsBefore: true });
	});
});
