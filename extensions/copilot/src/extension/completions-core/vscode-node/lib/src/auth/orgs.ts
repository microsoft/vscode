/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotToken } from './copilotTokenManager';

export function getUserKind(token: Omit<CopilotToken, 'token'>): string {
	return token.userKind;
}
