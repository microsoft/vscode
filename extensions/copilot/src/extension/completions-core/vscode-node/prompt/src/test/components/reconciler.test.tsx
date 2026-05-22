/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../jsx-runtime */
import { Chunk, ComponentContext, PromptElement, PromptElementProps, Text } from '../../components/components';
import { Dispatch, StateUpdater } from '../../components/hooks';
import { VirtualPromptReconciler } from '../../components/reconciler';
import * as assert from 'assert';
import { CancellationTokenSource } from 'vscode-languageserver-protocol';
import { extractNodesWitPath, isNumber, isString } from './testHelpers';

suite('Virtual prompt reconciler', function () {
	test('computes paths for virtual prompt nodes', function () {
		const MyNestedComponent = () => {
			return (
				<>
					<Text>Hola</Text>
					<Text>Adios</Text>
				</>
			);
		};

		const prompt = (
			<>
				<MyNestedComponent />
				<Text>Intermediate</Text>
				<MyNestedComponent />
			</>
		);

		const reconciler = new VirtualPromptReconciler(prompt);
		const result = reconciler.reconcile();

		const orderedPaths = extractNodesWitPath(result!);

		// Assert expected paths
		assert.deepStrictEqual(orderedPaths, [
			'$.f',
			'$.f[0].MyNestedComponent',
			'$.f[0].MyNestedComponent[0].f',
			'$.f[0].MyNestedComponent[0].f[0].Text',
			'$.f[0].MyNestedComponent[0].f[0].Text[0]',
			'$.f[0].MyNestedComponent[0].f[1].Text',
			'$.f[0].MyNestedComponent[0].f[1].Text[0]',
			'$.f[1].Text',
			'$.f[1].Text[0]',
			'$.f[2].MyNestedComponent',
			'$.f[2].MyNestedComponent[0].f',
			'$.f[2].MyNestedComponent[0].f[0].Text',
			'$.f[2].MyNestedComponent[0].f[0].Text[0]',
			'$.f[2].MyNestedComponent[0].f[1].Text',
			'$.f[2].MyNestedComponent[0].f[1].Text[0]',
		]);

		// Assert uniqueness of paths
		assert.deepStrictEqual([...new Set(orderedPaths)], orderedPaths);
	});

	test('computes paths for virtual prompt nodes with keys', function () {
		const MyNestedComponent = () => {
			return (
				<>
					<Text>Hola</Text>
					<Text key={23}>Adios</Text>
				</>
			);
		};

		const prompt = (
			<>
				<MyNestedComponent />
				<Chunk>
					<Text key={'key-1'}>Text with key</Text>
				</Chunk>
				<MyNestedComponent />
			</>
		);

		const reconciler = new VirtualPromptReconciler(prompt);
		const result = reconciler.reconcile();

		const orderedPaths = extractNodesWitPath(result!);

		assert.deepStrictEqual(orderedPaths, [
			'$.f',
			'$.f[0].MyNestedComponent',
			'$.f[0].MyNestedComponent[0].f',
			'$.f[0].MyNestedComponent[0].f[0].Text',
			'$.f[0].MyNestedComponent[0].f[0].Text[0]',
			'$.f[0].MyNestedComponent[0].f["23"].Text',
			'$.f[0].MyNestedComponent[0].f["23"].Text[0]',
			'$.f[1].Chunk',
			'$.f[1].Chunk["key-1"].Text',
			'$.f[1].Chunk["key-1"].Text[0]',
			'$.f[2].MyNestedComponent',
			'$.f[2].MyNestedComponent[0].f',
			'$.f[2].MyNestedComponent[0].f[0].Text',
			'$.f[2].MyNestedComponent[0].f[0].Text[0]',
			'$.f[2].MyNestedComponent[0].f["23"].Text',
			'$.f[2].MyNestedComponent[0].f["23"].Text[0]',
		]);

		// Assert uniqueness of paths
		assert.deepStrictEqual([...new Set(orderedPaths)], orderedPaths);
	});

	test('rejects duplicate keys on same level in initial prompt', function () {
		const prompt = (
			<>
				<Text key={23}>Hola</Text>
				<Text key={23}>Adios</Text>
			</>
		);

		try {
			new VirtualPromptReconciler(prompt);
			assert.fail('Should have thrown an error');
		} catch (e) {
			assert.equal((e as Error).message, 'Duplicate keys found: 23');
		}
	});

	test('rejects multiple duplicate keys on same level in initial prompt', function () {
		const prompt = (
			<>
				<Text key={23}>Hola</Text>
				<Text key={23}>Adios</Text>
				<Text key={'aKey'}>Hola</Text>
				<Text key={'aKey'}>Adios</Text>
			</>
		);

		try {
			new VirtualPromptReconciler(prompt);
			assert.fail('Should have thrown an error');
		} catch (e) {
			assert.equal((e as Error).message, 'Duplicate keys found: 23, aKey');
		}
	});

	test('rejects duplicate keys on same level during reconciliation', function () {
		let outerSetCount: Dispatch<StateUpdater<number>>;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [count, setCount] = context.useState(1);

			outerSetCount = setCount;

			return (
				<>
					{Array.from({ length: count }).map((_, i) => (
						<Text key={23}>Text {i}</Text>
					))}
				</>
			);
		};

		const reconciler = new VirtualPromptReconciler(<MyTestComponent />);

		outerSetCount!(2);

		try {
			reconciler.reconcile();
			assert.fail('Should have thrown an error');
		} catch (e) {
			assert.equal((e as Error).message, 'Duplicate keys found: 23');
		}
	});

	test('accepts same keys on different level', function () {
		const prompt = (
			<>
				<>
					<Text key={23}>Hola</Text>
				</>
				<>
					<Text key={23}>Adios</Text>
				</>
			</>
		);

		const reconciler = new VirtualPromptReconciler(prompt);
		const result = reconciler.reconcile();

		const orderedPaths = extractNodesWitPath(result!);

		assert.deepStrictEqual(orderedPaths, [
			'$.f',
			'$.f[0].f',
			'$.f[0].f["23"].Text',
			'$.f[0].f["23"].Text[0]',
			'$.f[1].f',
			'$.f[1].f["23"].Text',
			'$.f[1].f["23"].Text[0]',
		]);

		// Assert uniqueness of paths
		assert.deepStrictEqual([...new Set(orderedPaths)], orderedPaths);
	});

	test('Should re-render if the state of the component changed', function () {
		let outerShouldRenderChildren: Dispatch<StateUpdater<boolean>>;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [shouldRenderChildren, setShouldRenderChildren] = context.useState(false);

			outerShouldRenderChildren = setShouldRenderChildren;

			if (shouldRenderChildren) {
				return <Text>This is my child</Text>;
			}
		};

		const reconciler = new VirtualPromptReconciler(<MyTestComponent />);
		const resultOne = reconciler.reconcile();
		assert.deepStrictEqual(resultOne!.children?.length, 0);

		outerShouldRenderChildren!(true);

		// Should re-render since the state changed
		const resultTwo = reconciler.reconcile();
		assert.deepStrictEqual(resultTwo!.children?.length, 1);
	});

	test('Should re-render if the state of a nested component changed', function () {
		let outerSetShouldRenderChildren: Dispatch<StateUpdater<boolean>>;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [shouldRenderChildren, setShouldRenderChildren] = context.useState(false);

			outerSetShouldRenderChildren = setShouldRenderChildren;

			if (shouldRenderChildren) {
				return <Text>This is my child</Text>;
			}
		};

		const reconciler = new VirtualPromptReconciler(
			(
				<>
					<MyTestComponent />
				</>
			)
		);
		const resultOne = reconciler.reconcile();
		assert.deepStrictEqual(resultOne!.children?.length, 1);
		assert.deepStrictEqual(resultOne!.children[0].children?.length, 0);

		outerSetShouldRenderChildren!(true);

		// Should re-render since the state changed
		const resultTwo = reconciler.reconcile();
		assert.deepStrictEqual(resultTwo!.children?.length, 1);
		assert.deepStrictEqual(resultTwo!.children[0].children?.length, 1);
	});

	test('Should not re-render if the state did not change', function () {
		let created = false;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [count, _] = context.useState(0);

			if (created) {
				throw new Error('Component was created more than once');
			}

			created = true;

			return <Text>This is my component {count}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<MyTestComponent />);
		try {
			reconciler.reconcile();
			reconciler.reconcile();
		} catch (e) {
			assert.fail('Component was created more than once, which should not happen');
		}
	});

	test('Should preserve child state if position and type within parent are the same', function () {
		let outerSetParentState: Dispatch<StateUpdater<string>>;

		const ParentComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [parentState, setParentState] = context.useState('BEFORE');

			outerSetParentState = setParentState;

			return (
				<>
					<Text>This is the parent count: {parentState}</Text>
					<ChildComponent parentState={parentState} />
				</>
			);
		};
		type ChildComponentProps = { parentState: string };
		let childState = 'UNINITIALIZED';
		const ChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childState = childComponentState;

			return <Text>This is the child state {childComponentState}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<ParentComponent />);

		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');

		outerSetParentState!('AFTER');
		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');
	});

	test('Should not preserve child state if position and type change and switch back', function () {
		let outerSetParentState: Dispatch<StateUpdater<string>>;

		const ParentComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [parentState, setParentState] = context.useState('BEFORE');

			outerSetParentState = setParentState;

			if (parentState === 'BEFORE') {
				return (
					<>
						<Text>This is the parent count: {parentState}</Text>
						<ChildComponent parentState={parentState} />
					</>
				);
			}
			return (
				<>
					<ChildComponent parentState={parentState} />
					<Text>This is the parent count: {parentState}</Text>
				</>
			);
		};
		type ChildComponentProps = { parentState: string };
		let childState = 'UNINITIALIZED';
		const ChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childState = childComponentState;

			return <Text>This is the child state {childComponentState}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<ParentComponent />);

		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');

		outerSetParentState!('AFTER');
		reconciler.reconcile();
		assert.strictEqual(childState, 'AFTER');

		outerSetParentState!('BEFORE');
		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');
	});

	test('Should preserve child state if position changes but key stays the same', function () {
		let outerSetParentState: Dispatch<StateUpdater<string>>;

		const ParentComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [parentState, setParentState] = context.useState('BEFORE');

			outerSetParentState = setParentState;

			if (parentState === 'BEFORE') {
				return (
					<>
						<Text>This is the parent count: {parentState}</Text>
						<ChildComponent key='child' parentState={parentState} />
					</>
				);
			}
			return (
				<>
					<ChildComponent key='child' parentState={parentState} />
					<Text>This is the parent count: {parentState}</Text>
				</>
			);
		};
		type ChildComponentProps = { parentState: string };
		let childState = 'UNINITIALIZED';
		const ChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childState = childComponentState;

			return <Text>This is the child state {childComponentState}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<ParentComponent />);

		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');

		outerSetParentState!('AFTER');
		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');

		outerSetParentState!('BEFORE');
		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');
	});

	test('Should preserve child state if position and type within parent are the same with deep nesting', function () {
		let outerSetParentState: Dispatch<StateUpdater<string>>;

		const ParentComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [parentState, setParentState] = context.useState('BEFORE');

			outerSetParentState = setParentState;

			return (
				<>
					<Text>This is the parent count: {parentState}</Text>
					<ChildComponent parentState={parentState} />
				</>
			);
		};
		type ChildComponentProps = { parentState: string };
		let childState = 'UNINITIALIZED';
		const ChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childState = childComponentState;

			return (
				<>
					<Text>This is the child state {childComponentState}</Text>
					<ChildChildComponent parentState={childComponentState} />
				</>
			);
		};
		let childChildState = 'UNINITIALIZED';
		const ChildChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childChildState = childComponentState;

			return <Text>This is the child state {childComponentState}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<ParentComponent />);

		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');
		assert.strictEqual(childChildState, 'BEFORE');

		outerSetParentState!('AFTER');
		reconciler.reconcile();
		assert.strictEqual(childState, 'BEFORE');
		assert.strictEqual(childChildState, 'BEFORE');
	});

	test('Should preserve child state if position and type within parent are the same with multiple children of same type', function () {
		let outerSetParentState: Dispatch<StateUpdater<string>>;

		const ParentComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [parentState, setParentState] = context.useState('BEFORE');

			outerSetParentState = setParentState;

			return (
				<>
					<Text>This is the parent count: {parentState}</Text>
					<ChildComponent parentState={parentState + '_A'} />
					<ChildComponent parentState={parentState + '_B'} />
				</>
			);
		};
		type ChildComponentProps = { parentState: string };
		let childState: string[] = [];
		const ChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childState.push(childComponentState);

			return <Text>This is the child state {childComponentState}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<ParentComponent />);

		reconciler.reconcile();
		assert.deepStrictEqual(childState, ['BEFORE_A', 'BEFORE_B']);

		childState = [];
		outerSetParentState!('AFTER');
		reconciler.reconcile();
		assert.deepStrictEqual(childState, ['BEFORE_A', 'BEFORE_B']);
	});

	test('Should initialize child state if position changes on reconciliation', function () {
		let outerSetParentCount: Dispatch<StateUpdater<number>>;
		let outerSetParentState: Dispatch<StateUpdater<string>>;

		const ParentComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [parentState, setParentState] = context.useState('FIRST');
			const [count, setCount] = context.useState(0);

			outerSetParentCount = setCount;
			outerSetParentState = setParentState;

			const renderChildren = () => {
				const children = [];
				for (let i = 0; i < count; i++) {
					children.push(<Text>This is the parent count: {parentState}</Text>);
				}
				children.push(<ChildComponent parentState={parentState} />);
				return children;
			};
			return <>{renderChildren()}</>;
		};
		type ChildComponentProps = { parentState: string };
		let childState = 'UNINITIALIZED';
		const ChildComponent = (props: ChildComponentProps, context: ComponentContext) => {
			const [childComponentState, _] = context.useState(props.parentState);
			childState = childComponentState;

			return <Text>This is the child state {childComponentState}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<ParentComponent />);

		reconciler.reconcile();
		assert.strictEqual(childState, 'FIRST');

		outerSetParentCount!(1);
		outerSetParentState!('SECOND');
		reconciler.reconcile();
		assert.strictEqual(childState, 'SECOND');
	});

	test('Should support cancellation', function () {
		const cts = new CancellationTokenSource();
		let outerSetCount: Dispatch<StateUpdater<number>> = () => 0;

		const MyTestComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [count, setCount] = context.useState(0);
			outerSetCount = setCount;
			return <Text>This is my component {count}</Text>;
		};

		const reconciler = new VirtualPromptReconciler(<MyTestComponent />);

		const result = reconciler.reconcile(cts.token);
		outerSetCount(1);
		cts.cancel();
		const resultAfterCancellation = reconciler.reconcile(cts.token);

		assert.deepStrictEqual(result, resultAfterCancellation);
	});

	test('Creates a pipe to route data to a component', async function () {
		let componentData = '';
		const DataComponent = (props: PromptElementProps, context: ComponentContext) => {
			context.useData(isString, (data: string) => {
				componentData = data;
			});
			return <></>;
		};
		const reconciler = new VirtualPromptReconciler(<DataComponent />);

		const pipe = reconciler.createPipe();
		await pipe.pump('test');

		assert.deepStrictEqual(componentData, 'test');
	});

	test('Fails to pump data before initialization', async function () {
		const reconciler = new VirtualPromptReconciler(undefined as unknown as PromptElement);
		const pipe = reconciler.createPipe();
		try {
			await pipe.pump('test');
			assert.fail('Should have thrown an error');
		} catch (e) {
			assert.equal((e as Error).message, 'No tree to pump data into. Pumping data before initializing?');
		}
	});

	test('Creates a pipe to route data to a component after previous reconciliation has been cancelled', async function () {
		const cts = new CancellationTokenSource();
		let componentData = '';
		const DataComponent = (props: PromptElementProps, context: ComponentContext) => {
			context.useData(isString, (data: string) => {
				componentData = data;
			});
			return <></>;
		};
		const reconciler = new VirtualPromptReconciler(<DataComponent />);
		const pipe = reconciler.createPipe();

		cts.cancel();
		reconciler.reconcile(cts.token);
		await pipe.pump('test');

		assert.deepStrictEqual(componentData, 'test');
	});

	test('Computes node statistics on reconcile', async function () {
		const DataComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [state, setState] = context.useState('');
			context.useData(isString, (data: string) => {
				setState(data);
			});
			return <>{state}</>;
		};
		const reconciler = new VirtualPromptReconciler(<DataComponent />);

		const pipe = reconciler.createPipe();
		await pipe.pump('test');
		const tree = reconciler.reconcile();

		const updateTime = tree?.lifecycle?.lifecycleData.getUpdateTimeMsAndReset();
		assert.ok(updateTime);
		assert.ok(updateTime > 0);
	});

	test('Computes node statistics on reconcile with measurements from data pumping', async function () {
		const DataComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [state, setState] = context.useState('');
			context.useData(isString, (data: string) => {
				setState(data);
			});
			return <>{state}</>;
		};
		const reconciler = new VirtualPromptReconciler(<DataComponent />);

		const pipe = reconciler.createPipe();
		await pipe.pump('test');

		let tree = reconciler.reconcile();
		let updateTime = tree?.lifecycle?.lifecycleData.getUpdateTimeMsAndReset();
		assert.ok(updateTime);
		assert.ok(updateTime > 0);

		tree = reconciler.reconcile();
		updateTime = tree?.lifecycle?.lifecycleData.getUpdateTimeMsAndReset();
		assert.ok(updateTime === 0);
	});

	test('Updates data time is updated on every data update', async function () {
		const DataComponent = (props: PromptElementProps, context: ComponentContext) => {
			const [count, setCount] = context.useState(0);
			context.useData(isNumber, async (newCount: number) => {
				await new Promise(resolve => setTimeout(resolve, count));
				setCount(newCount);
			});
			return <>{count}</>;
		};
		const reconciler = new VirtualPromptReconciler(<DataComponent />);
		const pipe = reconciler.createPipe();
		await pipe.pump(1);

		const tree = reconciler.reconcile();
		const lifeCycleData = tree?.lifecycle?.lifecycleData;
		assert.ok(lifeCycleData);
		const timeFirstPump = lifeCycleData?.getUpdateTimeMsAndReset();
		assert.ok(timeFirstPump > 0);
		await pipe.pump(2);
		const timeSecondPump = lifeCycleData?.getUpdateTimeMsAndReset();
		assert.ok(timeSecondPump > 0);
		assert.notDeepStrictEqual(timeFirstPump, timeSecondPump);
	});

	test('Creates a pipe to route data to many components', async function () {
		let componentDataA = '';
		const DataComponentA = (props: PromptElementProps, context: ComponentContext) => {
			context.useData(isString, (data: string) => {
				componentDataA = data;
			});
			return <></>;
		};
		let componentDataB = '';
		const DataComponentB = (props: PromptElementProps, context: ComponentContext) => {
			context.useData(isString, (data: string) => {
				componentDataB = data;
			});
			return <></>;
		};
		const reconciler = new VirtualPromptReconciler(
			(
				<>
					<DataComponentA />
					<DataComponentB />
				</>
			)
		);

		const pipe = reconciler.createPipe();
		await pipe.pump('test');

		assert.deepStrictEqual(componentDataA, 'test');
		assert.deepStrictEqual(componentDataB, 'test');
	});

	test('Creates a pipe to route data async to many components', async function () {
		let componentDataA = '';
		const DataComponentA = (props: PromptElementProps, context: ComponentContext) => {
			context.useData(isString, async (data: string) => {
				await Promise.resolve();
				componentDataA = data;
			});
			return <></>;
		};
		let componentDataB = '';
		const DataComponentB = (props: PromptElementProps, context: ComponentContext) => {
			context.useData(isString, async (data: string) => {
				await Promise.resolve();
				componentDataB = data;
			});
			return <></>;
		};
		const reconciler = new VirtualPromptReconciler(
			(
				<>
					<DataComponentA />
					<DataComponentB />
				</>
			)
		);

		const pipe = reconciler.createPipe();
		await pipe.pump('test');

		assert.deepStrictEqual(componentDataA, 'test');
		assert.deepStrictEqual(componentDataB, 'test');
	});

	test('Pumps data to components with any pipe independently', async function () {
		const componentDataA: string[] = [];
		const DataComponentA = (props: unknown, context: ComponentContext) => {
			context.useData(isString, (data: string) => {
				componentDataA.push(data);
			});
			return <></>;
		};
		const componentDataB: string[] = [];
		const DataComponentB = (props: unknown, context: ComponentContext) => {
			context.useData(isString, (data: string) => {
				componentDataB.push(data);
			});
			return <></>;
		};
		const reconciler = new VirtualPromptReconciler(
			(
				<>
					<DataComponentA />
					<DataComponentB />
				</>
			)
		);

		const pipe1 = reconciler.createPipe();
		await pipe1.pump('test');
		const pipe2 = reconciler.createPipe();
		await pipe2.pump('test2');

		assert.deepStrictEqual(componentDataA, ['test', 'test2']);
		assert.deepStrictEqual(componentDataB, ['test', 'test2']);
	});
});
