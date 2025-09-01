/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IJupytextService = createDecorator<IJupytextService>('jupytextService');

export interface IJupytextService {
	readonly _serviceBrand: undefined;

	pythonTextToNotebook(pythonText: string, options: any): Promise<string>;
}
