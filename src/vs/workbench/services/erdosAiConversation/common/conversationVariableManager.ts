/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IConversationVariableManager = createDecorator<IConversationVariableManager>('conversationVariableManager');

export interface IConversationVariableManager {
	readonly _serviceBrand: undefined;

	storeConversationVariables(conversationId: number): Promise<void>;
	loadConversationVariables(conversationId: number): Promise<void>;
	initializeConversationDefaults(): void;
	clearConversationVariables(): void;
	setConversationVar(varName: string, value: any): boolean;
	getConversationVar(varName: string, defaultValue?: any): any;
	conversationVarExists(varName: string): boolean;
	removeConversationVar(varName: string): boolean;
	setConversationVarInCache(varName: string, value: any): boolean;
	getCurrentCachedConversationId(): number | null;
	forceSaveCurrentConversationVariables(): Promise<boolean>;
	switchToConversation(conversationId: number): Promise<void>;
	getAllConversationVars(): Record<string, any>;
}
