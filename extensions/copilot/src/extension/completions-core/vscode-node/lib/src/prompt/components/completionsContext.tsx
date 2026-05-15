/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { PromptElementProps, PromptSnapshotNode } from '../../../../prompt/src/components/components';

/**
 * A component that marks the context part of the prompt
 */
export function CompletionsContext(props: PromptElementProps) {
	return props.children;
}

/**
 * A component that marks the context part of the prompt that is stable across requests,
 * and should be located earlier in the prompt to maximize cache hits.
 */
export function StableCompletionsContext(props: PromptElementProps) {
	return props.children;
}

/**
 * A component that marks the context part of the prompt that is subject to change quickly across requests,
 * and should be located further down in the prompt.
 */
export function AdditionalCompletionsContext(props: PromptElementProps) {
	return props.children;
}

export function isContextNode(node: PromptSnapshotNode): boolean {
	return (
		node.name === CompletionsContext.name ||
		node.name === StableCompletionsContext.name ||
		node.name === AdditionalCompletionsContext.name
	);
}
