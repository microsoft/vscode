/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DataConsumer, Dispatch, StateUpdater, TypePredicate } from './hooks';
import { TokenizerName } from '../tokenization';
import { CancellationToken } from 'vscode-languageserver-protocol';

// --------- Prompt component types

export type PromptComponentChild = PromptElement | string | number | undefined;

type PromptComponentChildren = PromptComponentChild[] | PromptComponentChild;

interface PromptAttributes {
	[key: string]: unknown;
	key?: string | number;
	weight?: number;
	source?: unknown;
}

export type PromptElementProps<P = object> = P & Readonly<PromptAttributes & { children?: PromptComponentChildren }>;

export interface ComponentContext {
	/**
	 * Hook to manage component state that can change over time.
	 * @param initialState - Initial state value or function that returns initial state
	 * @returns A tuple containing current state and setter function
	 * @example
	 * function Counter(props: PromptElementProps, context: ComponentContext) {
	 *   const [count, setCount] = context.useState(0);
	 *   return <Text>Count: {count}</Text>;
	 * }
	 */
	useState<S = undefined>(): [S | undefined, Dispatch<StateUpdater<S | undefined>>];
	useState<S>(initialState: S | (() => S)): [S, Dispatch<StateUpdater<S>>];

	/**
	 * Hook to subscribe to typed external data streams with type checking.
	 * @param typePredicate - TypeScript type predicate function for runtime type checking
	 * @param consumer - Callback function that receives type-checked data
	 * @example
	 * function DataViewer(props: PromptElementProps, context: ComponentContext) {
	 *   interface MessageData {
	 *     message: string;
	 *   }
	 *
	 *   function isMessageData(data: unknown): data is MessageData {
	 *     return typeof data === 'object' && data !== null &&
	 *            'message' in data && typeof (data as any).message === 'string';
	 *   }
	 *
	 *   context.useData(
	 *     isMessageData,
	 *     (data) => console.log(data.message)
	 *   );
	 * }
	 */
	useData<T>(typePredicate: TypePredicate<T>, consumer: DataConsumer<T>): void;
}

export interface PromptFragment {
	type: 'f';
	children: PromptComponentChild[];
}

export interface FragmentFunction {
	(children: PromptComponentChildren): PromptFragment;
}

export interface FunctionComponent<P = PromptAttributes> {
	(props: PromptElementProps<P>, context: ComponentContext): PromptComponentChildren;
}

/**
 * Data structure returned by prompt component functions and used by the `virtualize` function to construct a virtual prompt.
 */
export interface PromptElement<P = PromptAttributes> {
	type: FunctionComponent<P> | FragmentFunction;
	props: P & { children: PromptComponentChildren };
}

// --------- Prompt snapshot and rendering types
export interface PromptSnapshotNodeStatistics {
	updateDataTimeMs?: number;
}

/**
 * A prompt snapshot node is a node in the virtual prompt tree in its immutable form.
 */
export interface PromptSnapshotNode {
	name: string;
	path: string;
	value?: string;
	props?: PromptElementProps;
	children?: PromptSnapshotNode[];
	statistics: PromptSnapshotNodeStatistics;
}

export interface PromptRenderer<T extends Prompt, P extends PromptRenderOptions> {
	render(snapshot: PromptSnapshotNode, options: P, cancellationToken?: CancellationToken): T;
}

export type PromptMetadata = {
	renderId: number;
	rendererName?: string;
	tokenizer: string;
	elisionTimeMs: number;
	renderTimeMs: number;
	updateDataTimeMs: number;
	componentStatistics: ComponentStatistics[];
};

export type ComponentStatistics = {
	componentPath: string;
	expectedTokens?: number;
	actualTokens?: number;
	updateDataTimeMs?: number;
	// This field is only used internally, and even tho we send it to CTS it's not telemetrized
	source?: unknown;
};

type StatusOk = { status: 'ok' };
export type StatusNotOk = { status: 'cancelled' } | { status: 'error'; error: Error };
export type Status = StatusOk | StatusNotOk;

export type PromptOk = StatusOk & {
	metadata: PromptMetadata;
};
type Prompt = PromptOk | StatusNotOk;

export interface PromptRenderOptions {
	tokenizer?: TokenizerName;
	delimiter?: string;
}

// --------- Components
type TextPromptComponentChild = string | number | undefined;
interface TextPromptElementProps extends PromptElementProps {
	children?: TextPromptComponentChild[] | TextPromptComponentChild;
}

/**
 * Basic component to represent text in a prompt.
 */
export function Text(props: TextPromptElementProps) {
	if (props.children) {
		if (Array.isArray(props.children)) {
			return props.children.join('');
		}

		return props.children;
	}
	return;
}

/**
 * Basic component to represent a group of components that gets elided all together or not at all.
 */
export function Chunk(props: PromptElementProps) {
	return props.children;
}
