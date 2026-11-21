/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IQuickInputHideEvent, IQuickInputService, IQuickTree, IQuickTreeItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { showToolsPicker } from '../../../browser/actions/chatToolPicker.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, ToolAndToolSetEnablementMap, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('Chat tool picker', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function tool(id: string): IToolData {
		return { id, source: ToolDataSource.Internal, displayName: id, modelDescription: id, canBeReferencedInPrompt: true };
	}

	function fixture(initial: IToolData[], selection?: () => ToolAndToolSetEnablementMap) {
		const services = workbenchInstantiationService({}, store);
		const changed = store.add(new Emitter<void>());
		const checkbox = store.add(new Emitter<IQuickTreeItem>());
		const accepted = store.add(new Emitter<void>());
		const hidden = store.add(new Emitter<IQuickInputHideEvent>());
		const cancellation = store.add(new CancellationTokenSource());
		let registered = initial;
		const picker = new class extends mock<IQuickTree<IQuickTreeItem>>() {
			override itemTree: IQuickTreeItem[] = [];
			override activeItems: IQuickTreeItem[] = [];
			override value = '';
			override onDidAccept = accepted.event;
			override onDidHide = hidden.event;
			override onDidTriggerButton = Event.None;
			override onDidTriggerItemButton = Event.None;
			override onDidChangeCheckboxState = checkbox.event;
			override setItemTree(items: IQuickTreeItem[]) { this.itemTree = items; }
			override isCollapsed(item: IQuickTreeItem) { return !!item.collapsed; }
			override show() { }
			override hide() { hidden.fire({ reason: QuickInputHideReason.Other }); }
			override dispose() { }
		}();

		services.stub(IQuickInputService, 'createQuickTree', () => picker);
		services.stub(IMcpService, { servers: constObservable([]) });
		services.stub(ILanguageModelToolsConfirmationService, { toolCanManageConfirmation: () => false });
		services.stub(ILanguageModelToolsService, {
			onDidChangeTools: changed.event,
			getTools: () => registered,
			getAllToolsIncludingDisabled: () => registered,
			getToolSetsForModel: () => [],
		});

		const result = services.invokeFunction(showToolsPicker, 'Select tools', 'test', undefined, selection, undefined, cancellation.token);
		return {
			picker, result,
			rows: () => picker.itemTree.flatMap(bucket => bucket.children ?? []),
			check(id: string, checked: boolean) {
				const row = picker.itemTree.flatMap(bucket => bucket.children ?? []).find(row => row.id === id);
				assert.ok(row);
				row.checked = checked;
				checkbox.fire(row);
			},
			async change(tools: IToolData[]) {
				registered = tools;
				changed.fire();
				// The picker coalesces registry changes before it rebuilds its rows.
				await timeout(150);
			},
			accept() { accepted.fire(); },
			cancel() { cancellation.cancel(); },
		};
	}

	test('refreshes the open tree and accepts only current tools with the pending choices', async () => {
		const first = tool('first'), second = tool('second'), removed = tool('removed'), excluded = tool('excluded');
		const added = tool('added');
		let choices = ToolAndToolSetEnablementMap.fromEntries([[first, true], [second, false], [removed, true], [excluded, true]]);
		const f = fixture([first, second, removed, excluded], () => choices);
		try {
			assert.deepStrictEqual(f.rows().map(row => row.id), ['excluded', 'first', 'removed', 'second']);
			// The tree controller keeps the current checkbox state on its item objects.
			f.check(first.id, false);
			f.check(second.id, true);
			const replacement = tool('first');
			choices = ToolAndToolSetEnablementMap.fromEntries([[replacement, true], [second, false], [added, true]]);
			await f.change([replacement, second, excluded, added]);
			assert.deepStrictEqual(f.rows().map(row => [row.id, row.checked]), [['added', true], ['first', false], ['second', true]]);
			f.accept();
			const result = await f.result;
			assert.ok(result);
			assert.deepStrictEqual([...result].map(([entry, enabled]) => [entry.id, enabled]), [['added', true], ['first', false], ['second', true]]);
			assert.ok(result.has(replacement));
		} finally {
			f.cancel();
			await f.result;
		}
	});

	test('uses unchecked defaults without a selection provider and stops refreshing after cancellation', async () => {
		const first = tool('first'), added = tool('added');
		const f = fixture([first]);
		try {
			await f.change([first, added]);
			assert.deepStrictEqual(f.rows().map(row => [row.id, row.checked]), [['added', false], ['first', false]]);
		} finally {
			f.cancel();
			assert.strictEqual(await f.result, undefined);
		}
		const closedTree = f.picker.itemTree;
		await f.change([]);
		assert.strictEqual(f.picker.itemTree, closedTree);
	});
});
