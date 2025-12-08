/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	export interface InteractiveSlashCommandProvider {
		provideSlashCommands(token: CancellationToken): ProviderResult<InteractiveSessionSlashCommand[]>;
		resolveSlashCommand(command: string, token: CancellationToken): ProviderResult<string>;
	}

	export namespace interactiveSlashCommands {
		export function registerSlashCommandProvider(chatProviderId: string, provider: InteractiveSlashCommandProvider): Disposable;
	}
}
