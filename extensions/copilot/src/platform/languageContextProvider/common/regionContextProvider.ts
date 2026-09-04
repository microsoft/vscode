/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type * as vscode from 'vscode';

import { createServiceIdentifier } from '../../../util/common/services';

export type LineRange = {
	start: number;
	end: number;
};

export interface Region {
	kind: string;
	name?: string;
	range: LineRange;
}

export namespace Region {
	export function getSpan(region: Region): number {
		return region.range.end - region.range.start;
	}
}

export type PathInfo = {
	smallest: number[];
	largest?: number[];
};

export type RegionResult = {
	regions: Region[];
	paths: PathInfo;
};

export const IRegionContextProviderService = createServiceIdentifier<IRegionContextProviderService>('IRegionContextProviderService');

export interface IRegionContextProviderService extends vscode.Disposable {
	readonly _serviceBrand: undefined;

	getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[]): Promise<RegionResult | undefined>;
	getRegions(document: vscode.Uri, languageId: string, ranges: vscode.Range[], requested?: LineRange): Promise<RegionResult | undefined>;
}

export class NullRegionContextProviderService implements IRegionContextProviderService {
	readonly _serviceBrand: undefined;

	async getRegions(): Promise<RegionResult | undefined> {
		return undefined;
	}

	dispose(): void {
		// No resources to dispose for the Null implementation
	}
}
