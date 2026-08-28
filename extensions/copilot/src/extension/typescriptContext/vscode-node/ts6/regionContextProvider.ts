/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

import type { IRegionContextProviderService, Region, LineRange } from '../../../../platform/languageContextProvider/common/regionContextProvider';

export class TS6RegionContextProvider implements Omit<IRegionContextProviderService, '_serviceBrand'>, vscode.Disposable {
	getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<Region[] | undefined> {
		return Promise.resolve(undefined);
	}

	dispose(): void {
		// No resources to dispose for the TS6 implementation
	}
}
