/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IQuickInputService, IQuickTree, IQuickTreeItem, QuickInputType } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { showToolsPicker } from '../../../browser/actions/chatToolPicker.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, ToolAndToolSetEnablementMap, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('Chat tool picker live refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function tool(id: string): IToolData {
		return { id, displayName: id, modelDescription: '', canBeReferencedInPrompt: true, source: ToolDataSource.Internal };
	}

	function visibleRow(id: string): HTMLElement | undefined {
		const rows = mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget .quick-input-tree-entry');
		return Array.from(rows).find(row => row.getClientRects().length > 0 && row.querySelector('.label-name')?.textContent === id);
	}

	async function waitForRows(predicate: () => boolean): Promise<void> {
		const deadline = Date.now() + 2000;
		while (!predicate()) {
			assert.ok(Date.now() < deadline, 'timed out waiting for the rendered tool rows');
			await new Promise<void>(resolve => mainWindow.setTimeout(resolve, 10));
		}
	}

	test('keeps filter, focus and pending checks when visible rows change', async () => {
		const services = workbenchInstantiationService({}, store);
		const quickInput = services.get(IQuickInputService);
		const changes = store.add(new Emitter<void>());
		const cancellation = store.add(new CancellationTokenSource());
		const keep = tool('matching-keep');
		const removed = tool('matching-removed');
		const added = tool('matching-added');
		const hidden = tool('other');
		let tools = [keep, removed, hidden];
		services.stub(IMcpService, { servers: constObservable([]) });
		services.stub(ILanguageModelToolsConfirmationService, { toolCanManageConfirmation: () => false });
		services.stub(ILanguageModelToolsService, {
			onDidChangeTools: changes.event,
			getTools: () => tools,
			getAllToolsIncludingDisabled: () => tools,
			getToolSetsForModel: () => [],
		});

		const selection = () => ToolAndToolSetEnablementMap.fromEntries(tools.map(tool => [tool, true]));
		const result = services.invokeFunction(showToolsPicker, 'Select tools', 'test', undefined, selection, undefined, cancellation.token);
		try {
			await waitForRows(() => !!visibleRow(keep.id));
			assert.strictEqual(quickInput.currentQuickInput?.type, QuickInputType.QuickTree);
			const tree = quickInput.currentQuickInput as IQuickTree<IQuickTreeItem>;
			const checkbox = visibleRow(keep.id)?.querySelector<HTMLElement>('[role="checkbox"]');
			assert.ok(checkbox);
			checkbox.click();
			const input = mainWindow.document.querySelector<HTMLInputElement>('.quick-input-filter input');
			assert.ok(input);
			input.focus();
			input.value = 'matching';
			input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
			await waitForRows(() => !!visibleRow(removed.id) && !visibleRow(hidden.id));
			assert.strictEqual(mainWindow.document.activeElement, input);

			tools = [keep, added, hidden];
			changes.fire();
			await waitForRows(() => !!visibleRow(added.id) && !visibleRow(removed.id));
			assert.strictEqual(quickInput.currentQuickInput, tree);
			assert.strictEqual(mainWindow.document.activeElement, input);
			assert.deepStrictEqual({
				filter: input.value,
				nonmatchingVisible: !!visibleRow(hidden.id),
				expanded: !tree.isCollapsed(tree.itemTree[0]),
				keptChecked: visibleRow(keep.id)?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
				addedChecked: visibleRow(added.id)?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			}, { filter: 'matching', nonmatchingVisible: false, expanded: true, keptChecked: 'false', addedChecked: 'true' });

			tree.accept();
			const accepted = await result;
			assert.ok(accepted);
			assert.deepStrictEqual([accepted.get(keep), accepted.get(added), accepted.get(hidden), accepted.has(removed)], [false, true, true, false]);
		} finally {
			cancellation.cancel();
			await result;
		}
	});

	test('updates Check All and the selected count when rows are replaced', async () => {
		const services = workbenchInstantiationService({}, store);
		const changes = store.add(new Emitter<void>());
		const cancellation = store.add(new CancellationTokenSource());
		const keep = tool('keep');
		const removed = tool('removed');
		const added = tool('added');
		let tools = [keep, removed];
		services.stub(IMcpService, { servers: constObservable([]) });
		services.stub(ILanguageModelToolsConfirmationService, { toolCanManageConfirmation: () => false });
		services.stub(ILanguageModelToolsService, {
			onDidChangeTools: changes.event,
			getTools: () => tools,
			getAllToolsIncludingDisabled: () => tools,
			getToolSetsForModel: () => [],
		});

		const header = () => {
			// The mixed state renders as an unchecked box with a dash icon.
			const checkAll = mainWindow.document.querySelector('.quick-input-widget [aria-label="Toggle all checkboxes"]');
			return {
				checkAll: checkAll?.classList.contains('codicon-dash') ? 'mixed' : checkAll?.getAttribute('aria-checked'),
				count: mainWindow.document.querySelector('.quick-input-widget .quick-input-count')?.textContent,
			};
		};
		const selection = () => ToolAndToolSetEnablementMap.fromEntries(tools.map(tool => [tool, tool !== added]));
		const result = services.invokeFunction(showToolsPicker, 'Select tools', 'test', undefined, selection, undefined, cancellation.token);
		try {
			await waitForRows(() => !!visibleRow(keep.id) && header().count === '2 Selected');
			assert.deepStrictEqual(header(), { checkAll: 'true', count: '2 Selected' });

			tools = [keep, added];
			changes.fire();
			await waitForRows(() => !!visibleRow(added.id) && !visibleRow(removed.id));
			assert.deepStrictEqual(header(), { checkAll: 'mixed', count: '1 Selected' });
		} finally {
			cancellation.cancel();
			await result;
		}
	});
});
