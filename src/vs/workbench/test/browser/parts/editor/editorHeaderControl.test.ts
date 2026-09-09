/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMenuService, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { DEFAULT_EDITOR_PART_OPTIONS, IEditorGroupsView, IEditorGroupView, IEditorGroupViewOptions } from '../../../../browser/parts/editor/editor.js';
import { EditorHeaderControl } from '../../../../browser/parts/editor/editorHeaderControl.js';
import { IActiveEditorChangeEvent } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { workbenchInstantiationService } from '../../workbenchTestServices.js';

class TestHeaderEditorInput extends EditorInput {
	override get typeId(): string { return 'test.headerEditor'; }
	override get resource(): undefined { return undefined; }
}

suite('EditorHeaderControl', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createHeader(options: IEditorGroupViewOptions, tabHeight: 'default' | 'compact' = 'default') {
		const instantiationService = workbenchInstantiationService({
			configurationService: () => new TestConfigurationService({ breadcrumbs: { enabled: false } }),
		}, store);
		const contextKeyService = store.add(instantiationService.createInstance(ContextKeyService));
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));

		const hasActions = contextKeyService.createKey<boolean>('test.editorHeader.hasActions', false);
		const menuId = MenuId.for('test.editorHeader');
		store.add(MenuRegistry.appendMenuItem(menuId, {
			command: { id: 'test.editorHeader.action', title: 'Header Action' },
			group: 'navigation',
			when: ContextKeyExpr.has('test.editorHeader.hasActions'),
		}));
		const onDidActiveEditorChange = store.add(new Emitter<IActiveEditorChangeEvent>());
		let activeEditor: EditorInput | null = null;
		const groupsView = new class extends mock<IEditorGroupsView>() {
			override readonly partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, tabHeight };
			override readonly onDidChangeEditorPartOptions = Event.None;
		}();
		const heights: number[] = [];
		const groupView = new class extends mock<IEditorGroupView>() {
			override get activeEditor() { return activeEditor; }
			override get activeEditorPane() { return undefined; }
			override readonly groupsView = groupsView;
			override readonly onDidActiveEditorChange = onDidActiveEditorChange.event;
			override relayout() { heights.push(control.height); }
		}();
		const container = $('.title');
		const control = store.add(instantiationService.createInstance(EditorHeaderControl, container, groupView, groupsView, { headerPrimary: menuId }, options.showHeader === true, options.reserveHeaderSpace));
		return {
			control,
			heights,
			hasActions,
			state: () => ({
				height: control.height,
				display: container.querySelector<HTMLElement>('.editor-group-header')?.style.display,
				actionsDisplay: container.querySelector<HTMLElement>('.editor-group-header-actions')?.style.display,
			}),
			activate: (editor: EditorInput | undefined) => {
				activeEditor = editor ?? null;
				onDidActiveEditorChange.fire({ editor });
			},
		};
	}

	for (const tabHeight of ['default', 'compact'] as const) {
		test(`reserves header height across tab and delayed menu changes (${tabHeight})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const first = store.add(new TestHeaderEditorInput());
			const second = store.add(new TestHeaderEditorInput());
			const header = createHeader({ showHeader: true, reserveHeaderSpace: editor => editor === first || editor === second }, tabHeight);
			const height = tabHeight === 'compact' ? EditorHeaderControl.COMPACT_HEIGHT : EditorHeaderControl.DEFAULT_HEIGHT;

			header.activate(first);
			const states = [header.state()];
			header.hasActions.set(true);
			await timeout(100);
			states.push(header.state());

			header.hasActions.set(false);
			header.activate(second);
			states.push(header.state());
			await timeout(100);
			states.push(header.state());
			header.hasActions.set(true);
			await timeout(100);
			states.push(header.state());

			assert.deepStrictEqual({
				states,
				relayoutHeights: [...new Set(header.heights)],
			}, {
				states: [
					{ height, display: '', actionsDisplay: 'none' },
					{ height, display: '', actionsDisplay: '' },
					{ height, display: '', actionsDisplay: 'none' },
					{ height, display: '', actionsDisplay: 'none' },
					{ height, display: '', actionsDisplay: '' },
				],
				relayoutHeights: [height],
			});
		}));
	}

	test('does not reserve an empty header for other editors or an empty group', () => {
		const reservedEditor = store.add(new TestHeaderEditorInput());
		const otherEditor = store.add(new TestHeaderEditorInput());
		const header = createHeader({ showHeader: true, reserveHeaderSpace: editor => editor === reservedEditor });
		header.activate(reservedEditor);
		const states = [header.state()];
		header.activate(otherEditor);
		states.push(header.state());
		header.activate(undefined);
		states.push(header.state());
		assert.deepStrictEqual(states, [
			{ height: EditorHeaderControl.DEFAULT_HEIGHT, display: '', actionsDisplay: 'none' },
			{ height: 0, display: 'none', actionsDisplay: 'none' },
			{ height: 0, display: 'none', actionsDisplay: 'none' },
		]);
	});

	test('without a reservation policy header visibility follows menu contents', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const header = createHeader({ showHeader: true });
		header.activate(store.add(new TestHeaderEditorInput()));
		const states = [header.state()];
		header.hasActions.set(true);
		await timeout(100);
		states.push(header.state());
		header.hasActions.set(false);
		await timeout(100);
		states.push(header.state());
		assert.deepStrictEqual(states, [
			{ height: 0, display: 'none', actionsDisplay: 'none' },
			{ height: EditorHeaderControl.DEFAULT_HEIGHT, display: '', actionsDisplay: '' },
			{ height: 0, display: 'none', actionsDisplay: 'none' },
		]);
	}));

	test('reservation does not enable a group header when showHeader is false', () => {
		const header = createHeader({ showHeader: false, reserveHeaderSpace: () => true });
		header.activate(store.add(new TestHeaderEditorInput()));
		assert.deepStrictEqual(header.state(), { height: 0, display: undefined, actionsDisplay: undefined });
	});
});
