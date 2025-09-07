/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IWidgetCompletionHandler = createDecorator<IWidgetCompletionHandler>('widgetCompletionHandler');

export interface IWidgetCompletionHandler {
	/**
	 * Extract file content for widget initialization (e.g., run_file widgets)
	 */
	extractFileContentForWidget(filename: string, startLine?: number, endLine?: number): string;
}
