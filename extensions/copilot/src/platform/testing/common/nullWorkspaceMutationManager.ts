/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceMutation, IWorkspaceMutationManager, IWorkspaceMutationOptions } from './workspaceMutationManager';

export class NullWorkspaceMutationManager implements IWorkspaceMutationManager {
	declare _serviceBrand: undefined;

	create(requestId: string, options: IWorkspaceMutationOptions): IWorkspaceMutation {
		return null as any;
	}

	get(requestId: string): IWorkspaceMutation {
		throw new Error('Method not implemented.');
	}
}
