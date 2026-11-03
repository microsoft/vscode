/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	FunctionComponent,
	PromptComponentChild,
	PromptElement,
	PromptElementProps,
	PromptFragment,
} from '../src/components/components';

/**
 * JSX factory function called for any JSX element.
 *
 * @param type Type of the element: `type` is the function that instantiate a prompt component. We store it so that we can render the component later in the virtual prompt.
 * @param props Properties of the element, with children
 */
function functionComponentFunction(
	type: FunctionComponent,
	props: PromptElementProps,
	key?: string | number
): PromptElement {
	let children: PromptComponentChild[] = [];
	if (Array.isArray(props.children)) {
		children = props.children;
	} else if (props.children) {
		children = [props.children];
	}
	const componentProps = { ...props, children };
	if (key) {
		componentProps.key = key;
	}
	return { type, props: componentProps };
}

/**
 * JSX factory function called for any JSX fragment.
 * It is used as the function when the jsx element is a fragment. It gets invoked from the reconciler when it encounters a fragment.
 */
function fragmentFunction(children: PromptComponentChild[]): PromptFragment {
	return { type: 'f', children };
}
fragmentFunction.isFragmentFunction = true;

/* JSX namespace is used by TypeScript to type JSX:
 * https://www.typescriptlang.org/docs/handbook/jsx.html#the-jsx-namespace
 */
export namespace JSX {
	export interface IntrinsicElements {
		[s: string]: unknown;
	}

	export interface IntrinsicAttributes {
		key?: string | number;
		weight?: number;
		source?: unknown;
	}

	/* any type necessary for component prop types */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	export type ElementType<P = any> = FunctionComponent<P>;
	export type Element = PromptElement;

	export interface ElementAttributesProperty {
		props: unknown;
	}

	export interface ElementChildrenAttribute {
		children: unknown;
	}
}

export { fragmentFunction as Fragment, functionComponentFunction as jsx, functionComponentFunction as jsxs };
