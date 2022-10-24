/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export interface IEditSessionIdentityProvider {
	readonly scheme: string;
	getEditSessionIdentifier(workspaceFolder: IWorkspaceFolder, token: CancellationToken): Promise<string | undefined>;
	provideEditSessionIdentityMatch(workspaceFolder: IWorkspaceFolder, identity1: string, identity2: string, token: CancellationToken): Promise<EditSessionIdentityMatch | undefined>;
}

export const IEditSessionIdentityService = createDecorator<IEditSessionIdentityService>('editSessionIdentityService');

export interface IEditSessionIdentityService {
	readonly _serviceBrand: undefined;

	registerEditSessionIdentityProvider(provider: IEditSessionIdentityProvider): IDisposable;
	getEditSessionIdentifier(workspaceFolder: IWorkspaceFolder, cancellationTokenSource: CancellationTokenSource): Promise<string | undefined>;
	provideEditSessionIdentityMatch(workspaceFolder: IWorkspaceFolder, identity1: string, identity2: string, cancellationTokenSource: CancellationTokenSource): Promise<EditSessionIdentityMatch | undefined>;
}

export enum EditSessionIdentityMatch {
	Complete = 100,
	Partial = 50,
	None = 0,
}
