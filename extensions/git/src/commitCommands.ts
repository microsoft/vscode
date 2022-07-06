/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vscode';
import { CommitSecondaryCommandsProvider } from './api/git';

export interface ICommitSecondaryCommandsProviderRegistry {
	getCommitSecondaryCommandsProviders(): CommitSecondaryCommandsProvider[];
	registerCommitSecondaryCommandsProvider(provider: CommitSecondaryCommandsProvider): Disposable;
}
