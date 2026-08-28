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

export interface Region {
	kind: string;
	name?: string;
	range: LineRange;
}

export const IRegionContextProviderService = createServiceIdentifier<IRegionContextProviderService>('IRegionContextProviderService');

export interface IRegionContextProviderService extends vscode.Disposable {
	readonly _serviceBrand: undefined;

	getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[]): Promise<Region[] | undefined>;
	getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined>;
}

export class NullRegionContextProviderService implements IRegionContextProviderService {
	readonly _serviceBrand: undefined;

	async getRegions(): Promise<Region[] | undefined> {
		return undefined;
	}

	dispose(): void {
		// No resources to dispose for the Null implementation
	}
}
