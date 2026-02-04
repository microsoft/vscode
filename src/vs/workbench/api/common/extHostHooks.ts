/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { HookTypeValue } from '../../contrib/chat/common/promptSyntax/hookSchema.js';
import { ExtHostHooksShape } from './extHost.protocol.js';

export const IExtHostHooks = createDecorator<IExtHostHooks>('IExtHostHooks');

export interface IChatHookExecutionOptions {
	readonly input?: unknown;
	readonly toolInvocationToken: unknown;
}

export interface IExtHostHooks extends ExtHostHooksShape {
	executeHook(hookType: HookTypeValue, options: IChatHookExecutionOptions, token?: CancellationToken): Promise<vscode.ChatHookResult[]>;
}
