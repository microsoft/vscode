/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';

import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { ChatContextIconPath } from '../../common/attachments/chatVariableEntries.js';

export interface IChatContextItem {
	iconPath?: ChatContextIconPath;
	label?: string;
	resourceUri?: URI;
	modelDescription?: string;
	tooltip?: IMarkdownString;
	/**
	 * Show this automatic workspace context as a read-only attachment in Chat.
	 * The context remains attached automatically whether or not it is shown.
	 */
	displayInChat?: boolean;
	handle: number;
	value?: string;
	command?: {
		id: string;
	};
}

export interface IChatWorkspaceContextProvider {
	provideWorkspaceChatContext(token: CancellationToken): Promise<IChatContextItem[]>;
}

export interface IChatExplicitContextProvider {
	provideChatContext(token: CancellationToken): Promise<IChatContextItem[]>;
	resolveChatContext(context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem>;
}

export interface IChatResourceContextProvider {
	provideChatContext(resource: URI, withValue: boolean, viewType: string | undefined, token: CancellationToken): Promise<IChatContextItem | undefined>;
	resolveChatContext(context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem>;
}
