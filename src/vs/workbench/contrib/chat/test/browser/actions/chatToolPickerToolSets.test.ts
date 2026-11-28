/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { constObservable, IReader, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IQuickInputService, IQuickTree, IQuickTreeItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IMcpService } from '../../../../mcp/common/mcpTypes.js';
import { showToolsPicker } from '../../../browser/actions/chatToolPicker.js';
import { ILanguageModelToolsConfirmationService } from '../../../common/tools/languageModelToolsConfirmationService.js';
import { ILanguageModelToolsService, IToolData, IToolSet, ToolAndToolSetEnablementMap, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('Chat tool picker tool sets', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function row(label: string): HTMLElement | undefined {
		return Array.from(mainWindow.document.querySelectorAll<HTMLElement>('.quick-input-widget .quick-input-tree-entry'))
			.find(row => row.getClientRects().length > 0 && row.querySelector('.label-name')?.textContent === label);
	}

	function checked(label: string): string | null | undefined {
		return row(label)?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked');
	}

	async function waitFor(predicate: () => boolean): Promise<void> {
		const deadline = Date.now() + 2000;
		while (!predicate()) {
			assert.ok(Date.now() < deadline, 'timed out waiting for the tool set rows');
			await new Promise<void>(resolve => mainWindow.setTimeout(resolve, 10));
		}
	}

	async function fixture() {
		const services = workbenchInstantiationService({}, store);
		const quickInput = services.get(IQuickInputService);
		const changes = store.add(new Emitter<void>());
		const cancellation = store.add(new CancellationTokenSource());
		const source: ToolDataSource = { type: 'extension', label: 'Fixture Extension', extensionId: new ExtensionIdentifier('fixture.extension') };
		const tool = (id: string): IToolData => ({ id, displayName: id, modelDescription: '', source, canBeReferencedInPrompt: true });
		const member = tool('fixture-member'), later = tool('fixture-later');
		let tools = [member];
		const createToolSet = (): IToolSet => ({ id: 'fixture-set', referenceName: 'fixture-set', source, icon: Codicon.tools, getTools: () => [member] });
		const toolSets = observableValue<IToolSet[]>('toolSets', [createToolSet()]);
		services.stub(IMcpService, { servers: constObservable([]) });
		services.stub(ILanguageModelToolsConfirmationService, { toolCanManageConfirmation: () => false });
		services.stub(ILanguageModelToolsService, {
			onDidChangeTools: changes.event, getTools: () => tools, getAllToolsIncludingDisabled: () => tools,
			getToolSetsForModel: (_model: unknown, reader?: IReader) => toolSets.read(reader)
		});
		const selection = () => ToolAndToolSetEnablementMap.fromEntries([...toolSets.get().map(toolSet => [toolSet, false] as [IToolSet, boolean]), ...tools.map(tool => [tool, false] as [IToolData, boolean])]);
		const result = services.invokeFunction(showToolsPicker, 'Select tools', 'test', undefined, selection, undefined, cancellation.token);
		await waitFor(() => !!row('Fixture Extension'));
		const tree = quickInput.currentQuickInput as IQuickTree<IQuickTreeItem>;
		tree.expand(tree.itemTree[0]);
		await waitFor(() => !!row('fixture-set'));
		return {
			member, later, toolSets, tree, result, createToolSet,
			click(label: string) { const checkbox = row(label)?.querySelector<HTMLElement>('[role="checkbox"]'); assert.ok(checkbox); checkbox.click(); },
			changeTools(next: IToolData[]) { tools = next; changes.fire(); },
			async close() { cancellation.cancel(); await result; }
		};
	}

	test('keeps a pending tool set enable when its tools also have separate rows', async () => {
		const f = await fixture();
		try {
			f.click('fixture-set');
			assert.strictEqual(checked('fixture-set'), 'true');
			f.changeTools([f.member, f.later]);
			await waitFor(() => !!row(f.later.id));
			assert.strictEqual(checked('fixture-set'), 'true');
			f.tree.accept();
			const accepted = await f.result;
			assert.ok(accepted);
			assert.deepStrictEqual({ set: accepted.get(f.toolSets.get()[0]), member: accepted.get(f.member), later: accepted.get(f.later) }, { set: true, member: false, later: false });
		} finally { await f.close(); }
	});

	test('restores a tool set that is recreated without a tools event', async () => {
		const f = await fixture();
		try {
			f.click('fixture-set');
			f.toolSets.set([], undefined);
			f.changeTools([f.member]);
			await waitFor(() => !row('fixture-set'));
			const recreated = f.createToolSet();
			f.toolSets.set([recreated], undefined);
			await waitFor(() => !!row('fixture-set'));
			assert.strictEqual(checked('fixture-set'), 'true');
			f.tree.accept();
			const accepted = await f.result;
			assert.ok(accepted);
			assert.strictEqual(accepted.get(recreated), true);
		} finally { await f.close(); }
	});
});
