/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const IConversationOptions = createServiceIdentifier<IConversationOptions>('ConversationOptions');

export interface IConversationOptions {
	readonly _serviceBrand: undefined;
	maxResponseTokens: number | undefined;
	temperature: number;
	topP: number;
	rejectionMessage: string;
}
