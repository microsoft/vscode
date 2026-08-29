/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode-languageserver-protocol';
import {
	FragmentFunction,
	FunctionComponent,
	type ComponentContext,
	type PromptComponentChild,
	type PromptElement,
	type PromptElementProps,
} from './components';
import { DataConsumer, Dispatch, StateUpdater, TypePredicate, UseData, UseState } from './hooks';
import { DataPipe } from './virtualPrompt';

/**
 * A virtual prompt node is an in-memory representation of a prompt component in its rendered form.
 * It is constructed from a `PromptElement` and contains the name of the component that it was constructed from, and resolved external context and state.
 */
export type VirtualPromptNode = {
	name: string;
	path: string;
	props?: PromptElementProps;
	children?: VirtualPromptNode[];
	component?: PromptComponentChild;
	lifecycle?: PromptElementLifecycle;
};

type VirtualPromptNodeChild = VirtualPromptNode | undefined;

/**
 * Translate a `PromptComponentChild` object into a virtual prompt node.
 */

export class VirtualPromptReconciler {
	private lifecycleData: Map<string, PromptElementLifecycleData> = new Map();
	private vTree: VirtualPromptNode | undefined;

	constructor(prompt: PromptElement) {
		// Initial virtualization
		this.vTree = this.virtualizeElement(prompt, '$', 0);
	}

	reconcile(cancellationToken?: CancellationToken): VirtualPromptNode | undefined {
		if (!this.vTree) {
			throw new Error('No tree to reconcile, make sure to pass a valid prompt');
		}
		if (cancellationToken?.isCancellationRequested) {
			return this.vTree;
		}
		this.vTree = this.reconcileNode(this.vTree, '$', 0, cancellationToken);
		return this.vTree;
	}

	private reconcileNode(
		node: VirtualPromptNode,
		parentNodePath: string,
		nodeIndex: number,
		cancellationToken?: CancellationToken
	): VirtualPromptNodeChild {
		// If the node has no children or does not have a lifecycle, return it as is (primitive nodes)
		if (!node.children && !node.lifecycle) { return node; }

		let newNode: VirtualPromptNodeChild = node;

		const needsReconciliation = node.lifecycle?.isRemountRequired();

		// If the node needs reconciliation, virtualize it again
		if (needsReconciliation) {
			const oldChildrenPaths = this.collectChildPaths(node);
			newNode = this.virtualizeElement(node.component, parentNodePath, nodeIndex);
			const newChildrenPaths = this.collectChildPaths(newNode);
			this.cleanupState(oldChildrenPaths, newChildrenPaths);
			// Otherwise, check if the children need reconciliation
		} else if (node.children) {
			const children: VirtualPromptNode[] = [];
			for (let i = 0; i < node.children.length; i++) {
				const child = node.children[i];
				if (child) {
					const reconciledChild = this.reconcileNode(child, node.path, i, cancellationToken);
					if (reconciledChild !== undefined) {
						children.push(reconciledChild);
					}
				}
			}
			newNode.children = children;
		}

		return newNode;
	}

	private virtualizeElement(
		component: PromptComponentChild,
		parentNodePath: string,
		nodeIndex: number
	): VirtualPromptNodeChild {
		if (typeof component === 'undefined') {
			return undefined;
		}

		if (typeof component === 'string' || typeof component === 'number') {
			return {
				name: typeof component,
				path: `${parentNodePath}[${nodeIndex}]`,
				props: { value: component },
				component,
			};
		}

		if (isFragmentFunction(component.type)) {
			const fragment = component.type(component.props.children);
			const indexIndicator = parentNodePath !== '$' ? `[${nodeIndex}]` : ``;
			const componentPath = `${parentNodePath}${indexIndicator}.${fragment.type}`;
			const children = fragment.children.map((c, i) => this.virtualizeElement(c, componentPath, i));
			this.ensureUniqueKeys(children);
			return {
				name: fragment.type,
				path: componentPath,
				children: children.flat().filter(c => c !== undefined),
				component,
			};
		}

		return this.virtualizeFunctionComponent(parentNodePath, nodeIndex, component, component.type);
	}

	private virtualizeFunctionComponent(
		parentNodePath: string,
		nodeIndex: number,
		component: PromptElement,
		functionComponent: FunctionComponent
	) {
		const indexIndicator = component.props.key ? `["${component.props.key}"]` : `[${nodeIndex}]`;
		const componentPath = `${parentNodePath}${indexIndicator}.${functionComponent.name}`;
		const lifecycle = new PromptElementLifecycle(this.getOrCreateLifecycleData(componentPath));
		const element = functionComponent(component.props, lifecycle);

		const elementToVirtualize = Array.isArray(element) ? element : [element];
		const virtualizedChildren = elementToVirtualize.map((e, i) => this.virtualizeElement(e, componentPath, i));
		const children = virtualizedChildren.flat().filter(e => e !== undefined);
		this.ensureUniqueKeys(children);
		return {
			name: functionComponent.name,
			path: componentPath,
			props: component.props,
			children,
			component,
			lifecycle,
		};
	}

	private ensureUniqueKeys(nodes: VirtualPromptNodeChild[]) {
		const keyCount = new Map<string | number, number>();
		for (const node of nodes) {
			if (!node) { continue; }
			const key = node.props?.key;
			if (key) {
				keyCount.set(key, (keyCount.get(key) || 0) + 1);
			}
		}
		// Find all duplicates
		const duplicates = Array.from(keyCount.entries())
			.filter(([_, count]) => count > 1)
			.map(([key]) => key);
		if (duplicates.length > 0) {
			throw new Error(`Duplicate keys found: ${duplicates.join(', ')}`);
		}
	}

	private collectChildPaths(node: VirtualPromptNode | undefined) {
		const paths: string[] = [];
		if (node?.children) {
			for (const child of node.children) {
				if (child) {
					paths.push(child.path);
					paths.push(...this.collectChildPaths(child));
				}
			}
		}
		return paths;
	}

	private cleanupState(oldChildrenPaths: string[], newChildrenPaths: string[]) {
		for (const path of oldChildrenPaths) {
			if (!newChildrenPaths.includes(path)) {
				this.lifecycleData.delete(path);
			}
		}
	}

	private getOrCreateLifecycleData(path: string) {
		if (!this.lifecycleData.has(path)) {
			this.lifecycleData.set(path, new PromptElementLifecycleData([]));
		}
		return this.lifecycleData.get(path)!;
	}

	createPipe(): DataPipe {
		return {
			pump: async (data: unknown) => {
				await this.pumpData(data);
			},
		};
	}

	private async pumpData<T>(data: T) {
		if (!this.vTree) {
			throw new Error('No tree to pump data into. Pumping data before initializing?');
		}
		await this.recursivelyPumpData(data, this.vTree);
	}

	private async recursivelyPumpData<T>(data: T, node: VirtualPromptNode) {
		if (!node) {
			throw new Error(`Can't pump data into undefined node.`);
		}
		await node.lifecycle?.dataHook.updateData(data);
		for (const child of node.children || []) {
			await this.recursivelyPumpData(data, child);
		}
	}
}

class PromptElementLifecycleData {
	state: unknown[];
	_updateTimeMs: number;

	constructor(state: unknown[]) {
		this.state = state;
		this._updateTimeMs = 0;
	}

	getUpdateTimeMsAndReset() {
		const value = this._updateTimeMs;
		this._updateTimeMs = 0;
		return value;
	}
}

class PromptElementLifecycle implements ComponentContext {
	private readonly stateHook: UseState;
	readonly dataHook: UseData;

	constructor(readonly lifecycleData: PromptElementLifecycleData) {
		this.stateHook = new UseState(lifecycleData.state);
		this.dataHook = new UseData((updateTimeMs: number) => {
			lifecycleData._updateTimeMs = updateTimeMs;
		});
	}

	useState<S = undefined>(): [S | undefined, Dispatch<StateUpdater<S | undefined>>];
	useState<S>(initialState: S | (() => S)): [S, Dispatch<StateUpdater<S>>];
	useState<S>(initialState?: S | (() => S)): [S | undefined, Dispatch<StateUpdater<S | undefined>>] {
		return this.stateHook.useState(initialState);
	}

	useData<T>(typePredicate: TypePredicate<T>, consumer: DataConsumer<T>): void {
		this.dataHook.useData(typePredicate, consumer);
	}

	isRemountRequired(): boolean {
		return this.stateHook.hasChanged();
	}
}

function isFragmentFunction(element: FragmentFunction | FunctionComponent): element is FragmentFunction {
	return typeof element === 'function' && 'isFragmentFunction' in element;
}
