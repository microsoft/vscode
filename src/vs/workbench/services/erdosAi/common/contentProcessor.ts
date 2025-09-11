/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IContentProcessor = createDecorator<IContentProcessor>('contentProcessor');

export interface IContentProcessor {
	readonly _serviceBrand: undefined;

	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string>;
}
