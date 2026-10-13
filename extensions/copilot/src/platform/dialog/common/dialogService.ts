/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken, OpenDialogOptions, QuickPickItem, QuickPickOptions, Uri } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IDialogService = createServiceIdentifier<IDialogService>('IDialogService');
export interface IDialogService {
	readonly _serviceBrand: undefined;

	showQuickPick<T extends QuickPickItem>(items: readonly T[] | Thenable<readonly T[]>, options: QuickPickOptions, token?: CancellationToken): Thenable<T | undefined>;
	showOpenDialog(options: OpenDialogOptions): Thenable<Uri[] | undefined>;
}
