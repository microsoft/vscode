/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface InteractiveRequest {
		variables: Record<string, ChatVariableValue[]>;
	}

	export interface ChatVariableValue {
		// eslint-disable-next-line local/vscode-dts-literal-or-types, local/vscode-dts-string-type-literals
		level: 'short' | 'medium' | 'full';
		value: string;
		description?: string;
	}

	export interface ChatVariableContext {
		message: string;
	}

	export interface ChatVariableResolver {
		resolve(name: string, context: ChatVariableContext, token: CancellationToken): ProviderResult<ChatVariableValue[]>;
	}

	export namespace chat {
		export function registerVariable(name: string, description: string, resolver: ChatVariableResolver): Disposable;
	}
}
