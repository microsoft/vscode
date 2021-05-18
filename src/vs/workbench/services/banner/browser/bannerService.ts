/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILinkDescriptor } from 'vs/platform/opener/browser/link';
import { StorageScope } from 'vs/platform/storage/common/storage';


export interface IBannerItem {
	readonly id: string;
	readonly icon: Codicon;
	readonly message: string | MarkdownString;
	readonly scope?: StorageScope; /* Used to remember that the banner has been closed. */
	readonly actions?: ILinkDescriptor[];
	readonly ariaLabel?: string;
}

export const IBannerService = createDecorator<IBannerService>('bannerService');

export interface IBannerService {
	readonly _serviceBrand: undefined;

	focus(): void;
	focusNextAction(): void;
	focusPreviousAction(): void;
	hide(id: string): void;
	show(item: IBannerItem): void;
}
