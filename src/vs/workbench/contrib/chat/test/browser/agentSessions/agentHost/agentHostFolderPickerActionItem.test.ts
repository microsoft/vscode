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
	/** A chat input's secondary row of `availableWidth`, with two neighbors and the folder chip last, as in the chat input. */
	function createRow(availableWidth: number) {
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
		// As wide as the toolbar is told it is, so that what it lays out is what it measures
		lane.style.width = `${availableWidth}px`;
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
				getAvailableWidth: () => availableWidth,
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
			// The min width the toolbar applied for the name before, as the chip measures the new one
			let slot = chip?.element;
			while (slot && !slot.classList.contains('action-item')) {
				slot = slot.parentElement ?? undefined;
			}
			const floor = Number.parseFloat(slot?.style.minWidth ?? '') || 0;
			toolbar.relayout();
			return { minWidth: chip?.getMinimumWidth() ?? 0, overflowed: toolbar.hasOverflow(), floor };
		};
		return { select, chip: () => chip, lane, longName, shortName };
	}

	test('last in a narrow row, it needs the width of the name it shows now: a shorter name, or No Workspace, brings it back from the overflow', () => {
		// Room for its neighbors and a chip with a short name, not a long one
		const { select, longName, shortName } = createRow(160);
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
	test('in a wide row, its width follows its name also while it stays in the row: a shorter name needs what a fresh chip with it does', () => {
		// Room for the chip with a long name too, which the toolbar then gives a width the shorter name does not need
		const { select, longName, shortName } = createRow(1000);
		const fresh = select(shortName);
		const long = select(longName);
		const short = select(shortName);
		const none = select('none');

		assert.deepStrictEqual({
			overflowed: [fresh.overflowed, long.overflowed, short.overflowed, none.overflowed],
			longNeedsMore: long.minWidth > fresh.minWidth,
			// Measured while still held at the long name's width
			measuredWithinLongFloor: short.floor === long.minWidth,
			shortAsFresh: short.minWidth === fresh.minWidth,
			noWorkspaceLessThanLong: none.minWidth < long.minWidth,
		}, { overflowed: [false, false, false, false], longNeedsMore: true, measuredWithinLongFloor: true, shortAsFresh: true, noWorkspaceLessThanLong: true });
	});
	test('at a narrow width it really is, a long name, fresh or after a short one, needs what it does in a wide row, without overlapping its neighbors', () => {
		const wideRow = createRow(1000);
		const wide = { short: wideRow.select(wideRow.shortName).minWidth, long: wideRow.select(wideRow.longName).minWidth };
		root.textContent = '';
		const { select, lane, longName, shortName } = createRow(160);
		/** Whether the items it shows lie within it, one after another. */
		const laidOut = () => {
			const laneBounds = lane.getBoundingClientRect();
			const bounds = [...lane.getElementsByClassName('action-item')].map(item => item.getBoundingClientRect()).filter(rect => rect.width > 0);
			return bounds.every((rect, index) => rect.left >= laneBounds.left - 0.5 && rect.right <= laneBounds.right + 0.5 && (index === 0 || rect.left >= bounds[index - 1].right - 0.5));
		};
		// Narrowed by the row as it first renders, before the toolbar moves it to the overflow
		const freshLong = { ...select(longName), laidOut: laidOut() };
		const short = { ...select(shortName), laidOut: laidOut() };
		const long = { ...select(longName), laidOut: laidOut() };
		const shortAgain = { ...select(shortName), laidOut: laidOut() };

		assert.deepStrictEqual({
			minWidths: [freshLong.minWidth, short.minWidth, long.minWidth, shortAgain.minWidth],
			overflowed: [freshLong.overflowed, short.overflowed, long.overflowed, shortAgain.overflowed],
			laidOut: [freshLong.laidOut, short.laidOut, long.laidOut, shortAgain.laidOut],
		}, {
			minWidths: [wide.long, wide.short, wide.long, wide.short],
			overflowed: [true, false, true, false],
			laidOut: [true, true, true, true],
		});
	});
});
