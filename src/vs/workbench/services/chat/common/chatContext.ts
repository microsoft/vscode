/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { LanguageSelector } from '../../../../editor/common/languageSelector.js';

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
	provideChatContextForResource?(resource: URI, options: {}, token: CancellationToken): Promise<IChatContextItem | undefined>;
	resolveChatContext?(context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem>;
}

export interface ChatContextService {
	_serviceBrand: undefined;
	setChatContextProvider(id: string, picker: { title: string; icon: ThemeIcon }): void;
	registerChatContextProvider(id: string, selector: LanguageSelector, provider: IChatContextProvider): void;
}
