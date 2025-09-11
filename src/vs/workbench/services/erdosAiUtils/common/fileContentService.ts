/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IFileContentService = createDecorator<IFileContentService>('fileContentService');

export interface IFileContentService {
	readonly _serviceBrand: undefined;
	
	/**
	 * Extract file content for widget display, with optional line range
	 */
	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): Promise<string>;
}
