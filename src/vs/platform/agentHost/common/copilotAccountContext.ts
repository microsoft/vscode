/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ICopilotServiceChoice {
	readonly service: 'github' | 'm365';
	readonly resource: string;
	readonly selectionId: string;
	readonly host: string;
	readonly accountName: string;
}

/** Runtime account state owned by the host; never sent over AHP. */
export type CopilotAccountContext =
	| { readonly kind: 'legacy' }
	| { readonly kind: 'discovering'; readonly entraAccountId: string }
	| { readonly kind: 'choiceRequired'; readonly entraAccountId: string; readonly choices: readonly ICopilotServiceChoice[] }
	| { readonly kind: 'activating'; readonly entraAccountId: string; readonly choice: ICopilotServiceChoice }
	| { readonly kind: 'ready'; readonly entraAccountId: string; readonly choice: ICopilotServiceChoice }
	| { readonly kind: 'error'; readonly entraAccountId: string; readonly stage: 'discovery' | 'activation' };

export function isMicrosoftCopilotAccountContext(context: CopilotAccountContext): context is Exclude<CopilotAccountContext, { kind: 'legacy' }> {
	return context.kind !== 'legacy';
}
