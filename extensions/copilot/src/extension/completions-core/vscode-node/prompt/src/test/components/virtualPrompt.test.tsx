/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** @jsxRuntime automatic */
/** @jsxImportSource ../../../jsx-runtime */
import {
	ComponentContext,
	PromptElement,
	PromptElementProps,
	PromptSnapshotNode,
	Text,
} from '../../components/components';
import { Dispatch, StateUpdater } from '../../components/hooks';
import { VirtualPrompt } from '../../components/virtualPrompt';
import * as assert from 'assert';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';

suite('Virtual prompt', function () {
	test('The virtual prompt should return a snapshot tree of a prompt', function () {
		const prompt = (
			<>
				<Text>This is text</Text>
				<Text>This is more text</Text>
			</>
		);

		const virtualPrompt = new VirtualPrompt(prompt);
		const { snapshot } = virtualPrompt.snapshot();
		const nodeNames = getNodeNames(snapshot!);

		const expected = {
			name: 'f',
			children: [
				{
					name: 'Text',
					children: [
						{
							name: 'string',
							children: [],
						},
					],
				},
				{
					name: 'Text',
					children: [
						{
							name: 'string',
							children: [],
						},
					],
				},
			],
		};

		assert.deepStrictEqual(nodeNames, expected);
	});

	test('The virtual prompt should return an updated snapshot if the inner state changed', function () {
		let outerSetCount: Dispatch<StateUpdater<number>>;
		let renderCount = 0;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [count, setCount] = context.useState(0);

			outerSetCount = setCount;
			renderCount++;

			return <Text>This is my component {count}</Text>;
		};

		const virtualPrompt = new VirtualPrompt(<MyTestComponent />);
		const { snapshot: snapshotOne } = virtualPrompt.snapshot();

		outerSetCount!(1);

		const { snapshot: snapshotTwo } = virtualPrompt.snapshot();

		assert.strictEqual(renderCount, 2);
		assert.notDeepStrictEqual(snapshotOne, snapshotTwo);
	});

	test('Should cancel while snapshotting', function () {
		let shouldCancel = false;
		let outerCancelCount: Dispatch<StateUpdater<number>>;
		const cts = new CancellationTokenSource();

		const CancellingComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [_, setCount] = context.useState(0);
			outerCancelCount = setCount;

			// Cancel on second rendering
			if (shouldCancel) {
				cts.cancel();
			}
			shouldCancel = true;
			return <Text>CancellingComponent</Text>;
		};
		const prompt = (
			<>
				<CancellingComponent />
			</>
		);

		const virtualPrompt = new VirtualPrompt(prompt);

		outerCancelCount!(1);

		const result = virtualPrompt.snapshot(cts.token);

		assert.deepStrictEqual(result, { snapshot: undefined, status: 'cancelled' });
	});

	test('Should return an error if there was an error during snapshot', function () {
		const virtualPrompt = new VirtualPrompt(undefined as unknown as PromptElement);

		const result = virtualPrompt.snapshot();

		assert.deepStrictEqual(result.snapshot, undefined);
		assert.deepStrictEqual(result.status, 'error');
		assert.deepStrictEqual(result.error?.message, 'No tree to reconcile, make sure to pass a valid prompt');
	});

	test('Should return an error if there was an error during reconciliation', function () {
		let outerSetCount: Dispatch<StateUpdater<number>>;
		let created = false;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [count, setCount] = context.useState(0);

			if (created) {
				throw new Error('Component was recreated');
			}

			created = true;
			outerSetCount = setCount;

			return <Text>This is my component {count}</Text>;
		};

		const prompt = (
			<>
				<MyTestComponent />
			</>
		);

		const virtualPrompt = new VirtualPrompt(prompt);

		outerSetCount!(1);

		const result = virtualPrompt.snapshot();

		assert.deepStrictEqual(result.snapshot, undefined);
		assert.deepStrictEqual(result.status, 'error');
		assert.deepStrictEqual(result.error?.message, 'Component was recreated');
	});

	test('Should create a pipe', function () {
		const virtualPrompt = new VirtualPrompt(<>test</>);

		const pipe = virtualPrompt.createPipe();

		assert.ok(pipe);
	});
});

type NodeName = { name: string; children: NodeName[] };

function getNodeNames(node: PromptSnapshotNode): NodeName {
	return {
		name: node.name,
		children: node.children?.map(getNodeNames) ?? [],
	};
}
