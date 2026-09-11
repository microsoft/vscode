/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentCanvasType } from '../../../../../../platform/agentHost/common/meta/agentCanvasMeta.js';
import { IInputOptions, IPickOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../platform/quickinput/common/quickInput.js';
import { pickAgentHostCanvas } from '../../../browser/agentSessions/agentHost/agentHostCanvasPicker.js';

class CanvasQuickInput extends mock<IQuickInputService>() {
	readonly choices: (number | undefined)[] = [0];
	readonly labels: string[][] = [];
	inputOptions: IInputOptions | undefined;
	inputText: string | undefined;

	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }): Promise<T[] | undefined>;
	override pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>): Promise<T | undefined>;
	override async pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T>): Promise<T | T[] | undefined> {
		const items = (await picks).filter((item): item is T => item.type !== 'separator');
		this.labels.push(items.map(item => item.label));
		const index = this.choices.shift();
		return index === undefined ? undefined : options?.canPickMany ? [items[index]] : items[index];
	}

	override async input(options?: IInputOptions): Promise<string | undefined> {
		this.inputOptions = options;
		return this.inputText;
	}
}

suite('AgentHostCanvasPicker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const canvas: IAgentCanvasType = { extensionId: 'sample', canvasTypeId: 'counter', displayName: 'Counter', description: 'A counter' };

	test('selects a runtime catalog entry without requesting unnecessary input', async () => {
		const quickInput = new CanvasQuickInput();
		const selected = await pickAgentHostCanvas(quickInput, async () => [canvas]);
		assert.deepStrictEqual({ selected, labels: quickInput.labels, input: quickInput.inputOptions }, {
			selected: { canvas }, labels: [['Counter', 'Refresh Canvases']], input: undefined,
		});
	});

	test('refreshes an initially empty catalog after extensions register', async () => {
		const quickInput = new CanvasQuickInput();
		quickInput.choices.push(0);
		let requests = 0;
		const selected = await pickAgentHostCanvas(quickInput, async () => ++requests === 1 ? [] : [canvas]);
		assert.deepStrictEqual({ selected, requests, labels: quickInput.labels }, {
			selected: { canvas }, requests: 2, labels: [['Refresh Canvases'], ['Counter', 'Refresh Canvases']],
		});
	});

	test('cancels selection without asking for input', async () => {
		const quickInput = new CanvasQuickInput();
		quickInput.choices[0] = undefined;
		assert.deepStrictEqual(await pickAgentHostCanvas(quickInput, async () => [canvas]), undefined);
	});

	test('collects schema-defined JSON, checks syntax and leaves schema validation to the runtime', async () => {
		const quickInput = new CanvasQuickInput();
		quickInput.inputText = '{"initialCount":3}';
		const withInput = { ...canvas, inputSchema: { type: 'object' as const, default: { initialCount: 0 }, properties: { initialCount: { type: 'number' as const } } } };
		const selected = await pickAgentHostCanvas(quickInput, async () => [withInput]);
		assert.deepStrictEqual({
			selected,
			value: quickInput.inputOptions?.value,
			invalid: await quickInput.inputOptions?.validateInput?.('{'),
			nonfinite: await quickInput.inputOptions?.validateInput?.('1e999'),
			valid: await quickInput.inputOptions?.validateInput?.('{"initialCount":3}'),
		}, {
			selected: { canvas: withInput, input: { initialCount: 3 } },
			value: '{"initialCount":0}',
			invalid: 'Enter valid JSON.',
			nonfinite: 'Enter valid JSON.',
			valid: undefined,
		});
	});

	test('cancels opening when input is cancelled', async () => {
		assert.deepStrictEqual(await pickAgentHostCanvas(new CanvasQuickInput(), async () => [{ ...canvas, inputSchema: { type: 'object' } }]), undefined);
	});

	test('surfaces catalog failures', async () => {
		await assert.rejects(pickAgentHostCanvas(new CanvasQuickInput(), async () => { throw new Error('disconnected'); }), /disconnected/);
	});
});
