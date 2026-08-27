/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';

export interface LineRange {
	start: number;
	end: number;
}

export interface Container {
	kind: string;
	name?: string;
	range: LineRange;
}

export const IContainerContextProvider = createServiceIdentifier<IContainerContextProvider>('IContainerContextProvider');

export interface IContainerContextProvider extends vscode.Disposable {
	readonly _serviceBrand: undefined;

	getContainers(document: vscode.Uri, languageId: string, line: number): Promise<Container[] | undefined>;
}

export class NullContainerContextProvider implements IContainerContextProvider {
	declare readonly _serviceBrand: undefined;

	async getContainers(document: vscode.Uri, languageId: string, line: number): Promise<Container[] | undefined> {
		return undefined;
	}

	dispose(): void {
		// No resources to dispose for the Null implementation
	}
}
