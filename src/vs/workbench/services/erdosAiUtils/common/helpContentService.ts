/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IHelpContentService = createDecorator<IHelpContentService>('helpContentService');

export interface IHelpContentService {
	readonly _serviceBrand: undefined;
	
	/**
	 * Get help content as markdown for a given topic
	 */
	getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string>;
}
