/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IErdosOutputWebviewService = createDecorator<IErdosOutputWebviewService>('erdosOutputWebviewService');

export interface IErdosOutputWebviewService {
	readonly _serviceBrand: undefined;

	/**
	 * Create a new output webview
	 */
	createOutputWebview(outputId: string, title: string): void;

	/**
	 * Update content in an existing output webview
	 */
	updateWebviewContent(outputId: string, content: string): void;

	/**
	 * Close an output webview
	 */
	closeOutputWebview(outputId: string): void;
}
