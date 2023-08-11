/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface ChatVariableValue {
		content: string;
	}

	export interface ChatVariableResolver {
		resolve(name: string, token: CancellationToken): ProviderResult<ChatVariableValue>;
	}

	// Could be provider/resolver pattern, but how dynamic are they?
	export namespace chat {
		// name: selection
		export function registerVariable(name: string, description: string, resolver: ChatVariableResolver): Disposable;
	}
}
