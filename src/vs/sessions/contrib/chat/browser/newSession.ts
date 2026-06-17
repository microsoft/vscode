/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChatSessionProviderOptionGroup, IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

export type NewSessionChangeType = 'repoUri' | 'isolationMode' | 'branch' | 'options' | 'disabled' | 'agent';

/**
 * Represents a resolved option group with its current selected value.
 */
export interface ISessionOptionGroup {
	readonly group: IChatSessionProviderOptionGroup;
	readonly value: IChatSessionProviderOptionItem | undefined;
}
