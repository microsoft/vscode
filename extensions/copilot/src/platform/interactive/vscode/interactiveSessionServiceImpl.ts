/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { interactive, Uri } from 'vscode';
import { IInteractiveSessionService } from '../common/interactiveSessionService';

export class InteractiveSessionServiceImpl implements IInteractiveSessionService {
	declare readonly _serviceBrand: undefined;
	transferActiveChat(workspaceUri: Uri): Thenable<void> {
		return interactive.transferActiveChat(workspaceUri);
	}
}