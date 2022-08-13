/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';

export interface ICanonicalWorkspaceIdentityProvider {
	readonly scheme: string;
	getCanonicalWorkspaceIdentifier(workspaceFolder: IWorkspaceFolder, token: CancellationToken): Promise<string | null>;
}

export const ICanonicalWorkspaceService = createDecorator<ICanonicalWorkspaceService>('canonicalWorkspaceService');

export interface ICanonicalWorkspaceService {
	readonly _serviceBrand: undefined;

	registerCanonicalWorkspaceIdentityProvider(provider: ICanonicalWorkspaceIdentityProvider): void;
	getCanonicalWorkspaceIdentifier(workspaceFolder: IWorkspaceFolder, cancellationTokenSource: CancellationTokenSource): Promise<string | null>;
}
