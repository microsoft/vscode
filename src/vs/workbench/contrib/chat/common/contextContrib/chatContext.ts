/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';

import { IMarkdownString } from '../../../../../base/common/htmlContent.js';

export interface IChatContextItem {
	icon?: ThemeIcon;
	label?: string;
	resourceUri?: URI;
	modelDescription?: string;
	tooltip?: IMarkdownString;
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
	provideChatContext(resource: URI, withValue: boolean, token: CancellationToken): Promise<IChatContextItem | undefined>;
	resolveChatContext(context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem>;
}
