/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IInteractiveSessionService = createServiceIdentifier<IInteractiveSessionService>('IInteractiveSessionService');
export interface IInteractiveSessionService {
	readonly _serviceBrand: undefined;
	transferActiveChat(workspaceUri: Uri): Thenable<void>;
}