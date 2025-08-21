/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { ILinkDescriptor } from '../../../../platform/opener/browser/link.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IErdosTopActionBarItem {
	readonly id: string;
	readonly icon: ThemeIcon | URI | undefined;
	readonly message: string | MarkdownString;
	readonly actions?: ILinkDescriptor[];
	readonly ariaLabel?: string;
	readonly onClose?: () => void;
}

export const IErdosTopActionBarService = createDecorator<IErdosTopActionBarService>('erdosTopActionBarService');

export interface IErdosTopActionBarService {
	readonly _serviceBrand: undefined;

	focus(): void;
}
