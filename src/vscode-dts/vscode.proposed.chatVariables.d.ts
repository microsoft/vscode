/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export enum ChatVariableLevel {
		Short = 1,
		Medium = 2,
		Full = 3
	}

	export enum ChatVariableKind {
		String = 1,
		Uri = 2
	}

	export interface ChatVariableValue {
		level: ChatVariableLevel;
		kind: ChatVariableKind | string;
		value: any; // Should this be stricter? This needs to serialize/deserialize, travel between extensions, and we won't guarantee returning the same instance.
		description?: string;
	}

	export interface ChatVariableStringValue extends ChatVariableValue {
		kind: ChatVariableKind.String;
		value: string;
	}

	export interface ChatVariableUriValue extends ChatVariableValue {
		kind: ChatVariableKind.Uri;
		value: Uri;
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
