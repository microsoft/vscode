/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { hasKey } from '../../../../../base/common/types.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageSelection, ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { AUX_WINDOW_GROUP, IEditorService, PreferredGroup, SIDE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { OpenMultiDiffEditorLayoutDebugAction, PositionFileListLeftAction, PositionFileListRightAction, ToggleFileListAction, ViewFileListAsListAction, ViewFileListAsTreeAction } from '../../browser/actions.js';
import { MultiDiffEditorFilesViewAndPositionMenu } from '../../common/multiDiffEditor.js';

suite('MultiDiffEditor Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('groups the view modes and positions in the Files View & Position submenu, which only the Agents window offers', () => {
		const actions = [new ViewFileListAsListAction(), new ViewFileListAsTreeAction(), new PositionFileListLeftAction(), new PositionFileListRightAction()];
		const entries = actions.map(action => {
			const menu = [action.desc.menu ?? []].flat().find(menu => menu.id === MultiDiffEditorFilesViewAndPositionMenu);
			assert.ok(menu);
			const toggled = action.desc.toggled;
			return { id: action.desc.id, group: menu.group, order: menu.order, toggled: toggled && (hasKey(toggled, { condition: true }) ? toggled.condition : toggled).serialize(), whenKeys: menu.when?.keys().sort(), preconditionKeys: action.desc.precondition?.keys().sort() };
		});
		// The editor window offers the view modes and positions in the Toggle Files dropdown instead.
		const inEditorTitle = MenuRegistry.getMenuItems(MenuId.EditorTitle)
			.filter(isISubmenuItem)
			.some(item => item.submenu === MultiDiffEditorFilesViewAndPositionMenu);
		// The view mode and position stay available in the Agents window, which contributes the submenu to the editor title menu of its chat windows.
		// Hidden where the editor has no file list, so a host's own entries are not shown next to disabled ones.
		const whenKeys = ['activeEditor', 'multiDiffEditorFileListAvailable'];
		const preconditionKeys = ['activeEditor', 'multiDiffEditorFileListAvailable'];
		assert.deepStrictEqual({ inEditorTitle, entries }, {
			inEditorTitle: false,
			entries: [
				{ id: 'multiDiffEditor.viewFileListAsList', group: '1_view', order: 1, toggled: 'multiDiffEditorFileListViewMode == \'list\'', whenKeys, preconditionKeys },
				{ id: 'multiDiffEditor.viewFileListAsTree', group: '1_view', order: 2, toggled: 'multiDiffEditorFileListViewMode == \'tree\'', whenKeys, preconditionKeys },
				{ id: 'multiDiffEditor.positionFileListLeft', group: '2_position', order: 1, toggled: 'multiDiffEditorFileListPosition == \'left\'', whenKeys, preconditionKeys },
				{ id: 'multiDiffEditor.positionFileListRight', group: '2_position', order: 2, toggled: 'multiDiffEditorFileListPosition == \'right\'', whenKeys, preconditionKeys },
			],
		});
	});

	test('offers Toggle Files as a split button whose dropdown switches the view mode and puts the list on either side of the diffs', () => {
		const splitButton = MenuRegistry.getMenuItems(MenuId.EditorTitle)
			.filter(isISubmenuItem)
			.find(item => item.submenu.id === 'MultiDiffEditorFileListToggle');
		assert.ok(splitButton);
		const entries = [new ToggleFileListAction(), new ViewFileListAsListAction(), new ViewFileListAsTreeAction(), new PositionFileListLeftAction(), new PositionFileListRightAction()].map(action => {
			const menu = [action.desc.menu ?? []].flat().find(menu => menu.id === splitButton.submenu);
			return { id: action.desc.id, title: typeof action.desc.title === 'string' ? action.desc.title : action.desc.title.value, group: menu?.group, order: menu?.order, hasToggled: !!action.desc.toggled };
		});
		assert.deepStrictEqual({
			title: splitButton.title,
			group: splitButton.group,
			order: splitButton.order,
			icon: splitButton.icon,
			isSplitButton: splitButton.isSplitButton,
			isAlwaysShown: splitButton.isAlwaysShown,
			// Not in the Agents window, which offers Toggle Details instead.
			whenKeys: splitButton.when?.keys().sort(),
			entries,
		}, {
			title: 'Files View & Position',
			group: 'navigation',
			order: 100001,
			icon: { id: 'list-flat' },
			isSplitButton: { excludePrimaryActionFromDropdown: true },
			isAlwaysShown: true,
			whenKeys: ['activeEditor', 'isSessionsWindow', 'multiDiffEditorFileListAvailable'],
			entries: [
				{ id: 'multiDiffEditor.toggleFileList', title: 'Toggle Files', group: 'navigation', order: 1, hasToggled: true },
				{ id: 'multiDiffEditor.viewFileListAsList', title: 'View as List', group: '1_view', order: 1, hasToggled: true },
				{ id: 'multiDiffEditor.viewFileListAsTree', title: 'View as Tree', group: '1_view', order: 2, hasToggled: true },
				{ id: 'multiDiffEditor.positionFileListLeft', title: 'Left', group: '2_position', order: 1, hasToggled: true },
				{ id: 'multiDiffEditor.positionFileListRight', title: 'Right', group: '2_position', order: 2, hasToggled: true },
			],
		});
	});

	async function getLayoutDebugTargetGroup(isSessionsWindow: boolean): Promise<PreferredGroup | undefined> {
		const onWillDispose = disposables.add(new Emitter<void>());
		let isDisposed = false;
		const model = disposables.add(new class extends mock<ITextModel>() {
			override readonly uri = URI.from({ scheme: Schemas.inMemory, path: '/layout-debug.jsonl' });
			override readonly onWillDispose = onWillDispose.event;

			override isDisposed(): boolean {
				return isDisposed;
			}

			override dispose(): void {
				if (!isDisposed) {
					isDisposed = true;
					onWillDispose.fire();
				}
			}
		}());
		const activeEditorPane = {
			getLayoutDebugState() {
				return constObservable({});
			}
		};
		let targetGroup: PreferredGroup | undefined;
		const editorService = {
			activeEditorPane,
			openEditor: async (...args: unknown[]) => {
				targetGroup = args[1] as PreferredGroup;
				return activeEditorPane;
			},
		};
		const modelService = new class extends mock<IModelService>() {
			override createModel(..._args: Parameters<IModelService['createModel']>): ITextModel {
				return model;
			}
		}();
		const languageService = new class extends mock<ILanguageService>() {
			override createById(): ILanguageSelection {
				return { languageId: 'jsonl', onDidChange: Event.None };
			}
		}();
		const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly isSessionsWindow = isSessionsWindow;
		}();
		const accessor = {
			get: (service: unknown) => {
				if (service === IEditorService) {
					return editorService;
				}
				if (service === IModelService) {
					return modelService;
				}
				if (service === ILanguageService) {
					return languageService;
				}
				if (service === IWorkbenchEnvironmentService) {
					return environmentService;
				}
				throw new Error('Unexpected service');
			},
		} as ServicesAccessor;

		await new OpenMultiDiffEditorLayoutDebugAction().run(accessor);
		model.dispose();
		return targetGroup;
	}

	test('opens layout debug in an auxiliary window from the Agents Window', async () => {
		assert.deepStrictEqual({
			workbench: await getLayoutDebugTargetGroup(false),
			agentsWindow: await getLayoutDebugTargetGroup(true),
		}, {
			workbench: SIDE_GROUP,
			agentsWindow: AUX_WINDOW_GROUP,
		});
	});
});
