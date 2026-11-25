/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { NullCommandService } from '../../../../../platform/commands/test/common/nullCommandService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ActiveEditorContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { SessionsDiffViewModeContext } from '../../../../services/editor/common/diffEditorOptionsService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { MultiDiffEditorFileListAvailableContext, MultiDiffEditorFileListEnabledContext } from '../../../multiDiffEditor/common/multiDiffEditor.js';
import { Menus } from '../../../sessions/browser/menus.js';
import { SessionChangesEditorDrawsHeaderContext } from '../../../sessions/common/contextkeys.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import '../../browser/changesEditorActions.js';

suite('Changes editor actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createContext(keys: Record<string, string | boolean>): ContextKeyService {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		for (const [key, value] of Object.entries(keys)) {
			contextKeyService.createKey(key, value);
		}
		return contextKeyService;
	}

	function getLabels(menuService: MenuService, menuId: MenuId, contextKeyService: ContextKeyService): [string, string[]][] {
		return menuService.getMenuActions(menuId, contextKeyService).map(([group, actions]) => [group, actions.map(action => action.label)]);
	}

	const editorWindowHeader = {
		[IsSessionsWindowContext.key]: false,
		[ActiveEditorContext.key]: SessionChangesEditorInput.EDITOR_ID,
		[SessionChangesEditorDrawsHeaderContext.key]: true,
		[ChatContextKeys.enabled.key]: true,
		[MultiDiffEditorFileListAvailableContext.key]: true,
		[MultiDiffEditorFileListEnabledContext.key]: true,
		[SessionsDiffViewModeContext.key]: 'inline',
		'resourceScheme': 'changes-multi-diff-source',
	};

	test('the header row that the Changes editor of an editor window draws offers Toggle Files with its list views and positions, and the diff actions of the Agents window in its More Actions menu', () => {
		const menuService = disposables.add(new MenuService(NullCommandService, new MockKeybindingService(), disposables.add(new TestStorageService())));
		const render = (keys: Record<string, string | boolean>) => {
			const contextKeyService = createContext(keys);
			const header = getLabels(menuService, Menus.SessionsEditorHeaderSecondary, contextKeyService);
			const submenu = (label: string) => {
				const item = menuService.getMenuActions(Menus.SessionsEditorHeaderSecondary, contextKeyService).flatMap(([, actions]) => actions).find(action => action.label === label);
				return item instanceof SubmenuItemAction ? getLabels(menuService, item.item.submenu, contextKeyService) : undefined;
			};
			return { header, filesView: submenu('Files View & Position'), diffView: submenu('Diff View') };
		};

		assert.deepStrictEqual({
			editorWindow: render(editorWindowHeader),
			aiDisabled: render({ ...editorWindowHeader, [ChatContextKeys.enabled.key]: false }),
			withoutFileList: render({ ...editorWindowHeader, [MultiDiffEditorFileListAvailableContext.key]: false }).header,
		}, {
			editorWindow: {
				header: [
					['navigation', ['Files View & Position']],
					['secondary/1_diff', ['Collapse All Diffs', 'Word Wrap', 'Diff View']],
				],
				filesView: [
					['navigation', ['Toggle Files']],
					['1_view', ['View as List', 'View as Tree']],
					['2_organize', ['Left', 'Right']],
				],
				diffView: [['1_view', ['Inline', 'Side by Side', 'Automatic (Currently Inline)']]],
			},
			aiDisabled: { header: [], filesView: undefined, diffView: undefined },
			withoutFileList: [['secondary/1_diff', ['Collapse All Diffs', 'Word Wrap', 'Diff View']]],
		});
	});

	test('the files of the Changes editor of an editor window offer to expand the full file and to open it, and nothing while chat is disabled', () => {
		const menuService = disposables.add(new MenuService(NullCommandService, new MockKeybindingService(), disposables.add(new TestStorageService())));

		assert.deepStrictEqual({
			editorWindow: getLabels(menuService, MenuId.MultiDiffEditorFileToolbar, createContext(editorWindowHeader)),
			aiDisabled: getLabels(menuService, MenuId.MultiDiffEditorFileToolbar, createContext({ ...editorWindowHeader, [ChatContextKeys.enabled.key]: false })),
			agentsWindowAiDisabled: getLabels(menuService, MenuId.MultiDiffEditorFileToolbar, createContext({ ...editorWindowHeader, [IsSessionsWindowContext.key]: true, [SessionChangesEditorDrawsHeaderContext.key]: false, [ChatContextKeys.enabled.key]: false })),
		}, {
			editorWindow: [['navigation', ['Expand Full File', 'Open File']]],
			aiDisabled: [],
			agentsWindowAiDisabled: [['navigation', ['Expand Full File', 'Open File']]],
		});
	});

});
