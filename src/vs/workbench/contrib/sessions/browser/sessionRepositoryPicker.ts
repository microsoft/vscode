/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISessionRepositoryPicker = createDecorator<ISessionRepositoryPicker>('sessionRepositoryPicker');

/** Entry-selected UI for starting a session; callers own authentication and repository validation. */
export interface ISessionRepositoryPicker {
	readonly _serviceBrand: undefined;
	pickRepository(getRepositories: (query: string, token: CancellationToken) => Promise<readonly string[]>, token: CancellationToken): Promise<string | undefined>;
}
