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

suite('MultiDiffEditor Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('groups the view modes and positions in the editor title overflow submenu', () => {
		const submenu = MenuRegistry.getMenuItems(MenuId.EditorTitle)
			.filter(isISubmenuItem)
			.find(item => item.submenu.id === 'MultiDiffEditorFilesViewAndPosition');
		assert.ok(submenu);
		const actions = [new ViewFileListAsListAction(), new ViewFileListAsTreeAction(), new PositionFileListLeftAction(), new PositionFileListRightAction()];
		const entries = actions.map(action => {
			const menu = action.desc.menu;
			assert.ok(menu && !Array.isArray(menu));
			const toggled = action.desc.toggled;
			return { id: action.desc.id, submenu: menu.id.id, group: menu.group, order: menu.order, toggled: toggled && (hasKey(toggled, { condition: true }) ? toggled.condition : toggled).serialize(), preconditionKeys: action.desc.precondition?.keys().sort() };
		});
		const toggle = new ToggleFileListAction().desc;
		assert.ok(toggle.menu && !Array.isArray(toggle.menu));
		// The view mode and position stay available in the Agents window, which contributes the submenu to its own editor title menu.
		const preconditionKeys = ['activeEditor', 'config.multiDiffEditor.experimental.fileList', 'multiDiffEditorFileListAvailable'];
		assert.deepStrictEqual({ group: submenu.group, icon: toggle.icon, toggleOrder: toggle.menu.order, togglePreconditionKeys: toggle.precondition?.keys().sort(), entries }, {
			group: 'z_files',
			icon: { id: 'list-flat' },
			toggleOrder: 100001,
			togglePreconditionKeys: ['activeEditor', 'config.multiDiffEditor.experimental.fileList', 'isSessionsWindow', 'multiDiffEditorFileListAvailable'],
			entries: [
				{ id: 'multiDiffEditor.viewFileListAsList', submenu: submenu.submenu.id, group: '1_view', order: 1, toggled: 'multiDiffEditorFileListViewMode == \'list\'', preconditionKeys },
				{ id: 'multiDiffEditor.viewFileListAsTree', submenu: submenu.submenu.id, group: '1_view', order: 2, toggled: 'multiDiffEditorFileListViewMode == \'tree\'', preconditionKeys },
				{ id: 'multiDiffEditor.positionFileListLeft', submenu: submenu.submenu.id, group: '2_position', order: 1, toggled: 'multiDiffEditorFileListPosition == \'left\'', preconditionKeys },
				{ id: 'multiDiffEditor.positionFileListRight', submenu: submenu.submenu.id, group: '2_position', order: 2, toggled: 'multiDiffEditorFileListPosition == \'right\'', preconditionKeys },
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
