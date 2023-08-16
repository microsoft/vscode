/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface InteractiveRequest {
		variables: Record<string, ChatVariableValue[]>;
	}

	export enum ChatVariableLevel {
		Short = 1,
		Medium = 2,
		Full = 3
	}

	export interface ChatVariableValue {
		level: ChatVariableLevel;
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
