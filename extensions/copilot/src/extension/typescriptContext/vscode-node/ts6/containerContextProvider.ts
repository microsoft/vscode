/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { IContainerContextProviderService, Container } from '../../../../platform/languageContextProvider/common/containerContextProvider';

export class TS6ContainerContextProvider implements Omit<IContainerContextProviderService, '_serviceBrand'>, vscode.Disposable {
	getContainers(document: vscode.Uri, languageId: string, line: number): Promise<Container[] | undefined> {
		return Promise.resolve(undefined);
	}

	dispose(): void {
		// No resources to dispose for the TS6 implementation
	}
}
