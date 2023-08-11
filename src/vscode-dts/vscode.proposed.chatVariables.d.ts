/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	interface ResolvedVariable {
		content: string;
	}

	interface ChatVariableResolver {
		resolve(name: string): ResolvedVariable;
	}

	// Could be provider/resolver pattern, but how dynamic are they?
	export namespace chat {
		// name: selection
		export function registerVariable(name: string, description: string, resolver: ChatVariableResolver): void;
	}
}
