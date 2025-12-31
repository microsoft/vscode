/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';

export interface IChatContextItem {
	icon: ThemeIcon;
	label: string;
	modelDescription?: string;
	handle: number;
	value?: string;
}

export interface IChatContextSupport {
	supportsResource: boolean;
	supportsResolve: boolean;
}

export interface IChatContextProvider {
	provideChatContext(options: {}, token: CancellationToken): Promise<IChatContextItem[]>;
	provideChatContextForResource?(resource: URI, withValue: boolean, token: CancellationToken): Promise<IChatContextItem | undefined>;
	resolveChatContext?(context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem>;
}
