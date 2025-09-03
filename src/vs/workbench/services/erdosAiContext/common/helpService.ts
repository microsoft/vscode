/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IHelpService = createDecorator<IHelpService>('helpService');

export interface IHelpService {
	readonly _serviceBrand: undefined;

	suggestTopics(query: string): Promise<Array<{name: string, topic: string, language: 'R' | 'Python'}>>;
	getHelpAsMarkdown(topic: string, packageName?: string, language?: 'R' | 'Python'): Promise<string>;
}
