/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { OptionalChatRequestParams } from '../../networking/common/fetch';
import { Source } from './chatMLFetcher';
import { ChatLocation } from './commonTypes';

export interface IRichChatRequestOptions {
	/** Name of the request for debugging purposes */
	debugName: string;
	messages: Raw.ChatMessage[];
	location: ChatLocation;
	source?: Source;
	requestOptions?: Omit<OptionalChatRequestParams, 'n'>;
	/** Whether the request was user-initiated (applicable to CAPI requests) */
	userInitiatedRequest?: boolean;
}
