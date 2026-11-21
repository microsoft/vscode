/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IQuickInputService, IQuickTree, IQuickTreeItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpRegistry } from '../../../../mcp/common/mcpRegistryTypes.js';
import { IMcpServer, IMcpService, McpConnectionState, McpServerCacheState } from '../../../../mcp/common/mcpTypes.js';
import { showToolsPicker } from '../../../browser/actions/chatToolPicker.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolAndToolSetEnablementMap, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('Chat tool picker MCP groups', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function row(label: string): HTMLElement | undefined {
		return Array.from(mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget .quick-input-tree-entry'))
			.find(row => row.getClientRects().length > 0 && row.querySelector('.label-name')?.textContent === label);
	}

	async function waitFor(predicate: () => boolean): Promise<void> {
		const deadline = Date.now() + 2000;
		while (!predicate()) {
			assert.ok(Date.now() < deadline, 'timed out waiting for the MCP group tree');
			await new Promise<void>(resolve => mainWindow.setTimeout(resolve, 10));
		}
	}

	async function fixture(enabled: boolean) {
		const services = workbenchInstantiationService({}, store);
		const quickInput = services.get(IQuickInputService);
		const changes = store.add(new Emitter<void>());
		const cancellation = store.add(new CancellationTokenSource());
		const source: ToolDataSource = { type: 'mcp', definitionId: 'fixture', collectionId: 'fixture', label: 'Fixture MCP', serverLabel: '', instructions: '' };
		const tool = (id: string): IToolData => ({ id, displayName: id, modelDescription: '', source, canBeReferencedInPrompt: true });
		const keep = tool('fixture-keep'), removed = tool('fixture-removed'), added = tool('fixture-added');
		let tools = [keep, removed];
		const toolset: IToolSet = { id: 'fixture-group', referenceName: 'fixture-group', source, icon: Codicon.tools, getTools: () => tools };
		const server = Object.assign(new class extends mock<IMcpServer>() { }, {
			definition: { id: 'fixture', label: 'Fixture MCP' }, collection: { id: 'fixture' },
			cacheState: constObservable(McpServerCacheState.Live), connectionState: constObservable({ state: McpConnectionState.Kind.Running }),
			serverMetadata: constObservable(undefined), tools: constObservable([])
		});
		services.stub(IMcpService, { servers: constObservable([server]) });
		services.stub(IMcpRegistry, { collections: constObservable([]) });
		services.stub(ILanguageModelToolsConfirmationService, { toolCanManageConfirmation: () => false });
		services.stub(ILanguageModelToolsService, {
			onDidChangeTools: changes.event, getTools: () => tools, getAllToolsIncludingDisabled: () => tools,
			getToolSetsForModel: () => [toolset]
		});
		const selection = () => ToolAndToolSetEnablementMap.fromEntries([[toolset, enabled], ...tools.map(tool => [tool, enabled] as [IToolData, boolean])]);
		const result = services.invokeFunction(showToolsPicker, 'Select tools', 'test', undefined, selection, undefined, cancellation.token);
		await waitFor(() => !!row('Fixture MCP'));
		const tree = quickInput.currentQuickInput as IQuickTree<IQuickTreeItem>;
		tree.expand(tree.itemTree[0]);
		await waitFor(() => !!row(keep.id));
		return {
			keep, removed, added, toolset, tree, result,
			click(label: string) { const checkbox = row(label)?.querySelector<HTMLElement>('[role="checkbox"]'); assert.ok(checkbox); checkbox.click(); },
			change() { tools = [keep, added]; changes.fire(); },
			async set(next: IToolData[]) { tools = next; changes.fire(); await waitFor(() => [keep, removed, added].every(tool => !!row(tool.id) === next.includes(tool))); },
			async current() { await waitFor(() => !!row(added.id) && !row(removed.id)); },
			async close() { cancellation.cancel(); await result; }
		};
	}

	for (const initiallyEnabled of [true, false]) {
		test(`preserves a pending MCP group ${initiallyEnabled ? 'disable' : 'enable'} when membership changes`, async () => {
			const f = await fixture(initiallyEnabled);
			try {
				f.click('Fixture MCP');
				f.change();
				await f.current();
				f.tree.accept();
				const accepted = await f.result;
				assert.ok(accepted);
				assert.deepStrictEqual({ group: accepted.get(f.toolset), keep: accepted.get(f.keep), added: accepted.get(f.added), removed: accepted.has(f.removed) },
					{ group: !initiallyEnabled, keep: !initiallyEnabled, added: !initiallyEnabled, removed: false });
			} finally { await f.close(); }
		});
	}

	test('preserves a mixed MCP group while new tools inherit the current configured defaults', async () => {
		const f = await fixture(true);
		try {
			f.click(f.keep.id);
			f.change();
			await f.current();
			f.tree.accept();
			const accepted = await f.result;
			assert.ok(accepted);
			assert.deepStrictEqual({ group: accepted.get(f.toolset), keep: accepted.get(f.keep), added: accepted.get(f.added), removed: accepted.has(f.removed) },
				{ group: false, keep: false, added: true, removed: false });
		} finally { await f.close(); }
	});

	test('keeps an individual edit individual across repeated refreshes', async () => {
		const f = await fixture(true);
		try {
			f.click(f.keep.id);
			await f.set([f.keep]);
			await f.set([f.keep, f.added]);
			f.tree.accept();
			const accepted = await f.result;
			assert.ok(accepted);
			assert.deepStrictEqual({ keep: accepted.get(f.keep), added: accepted.get(f.added) }, { keep: false, added: true });
		} finally { await f.close(); }
	});

	test('applies a pending MCP group choice to later tools after an individual edit', async () => {
		const f = await fixture(true);
		try {
			f.click('Fixture MCP');
			await f.set([f.keep, f.added]);
			f.click(f.keep.id);
			await f.set([f.keep, f.added, f.removed]);
			f.tree.accept();
			const accepted = await f.result;
			assert.ok(accepted);
			assert.deepStrictEqual({ keep: accepted.get(f.keep), added: accepted.get(f.added), removed: accepted.get(f.removed) }, { keep: true, added: false, removed: false });
		} finally { await f.close(); }
	});
});
