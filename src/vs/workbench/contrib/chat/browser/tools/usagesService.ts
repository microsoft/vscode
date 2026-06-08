/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const ICodeUsageService = createDecorator<ICodeUsageService>('usageService');

export type CodeUsageId = string;

export interface LineRange {
	startLine: number;
	endLine: number;
}

export interface Container {
	kind: string;
	name: string;
	range: LineRange;
}

export interface CodeUsage {
	id: CodeUsageId;
	uri: URI;
	line: number;
	containers?: Container[];
}


export interface ICodeUsageService {
	readonly _serviceBrand: undefined;
	storeUsage(key: CodeUsageId, usage: CodeUsage): void;
	getUsage(key: CodeUsageId): CodeUsage | undefined;
}

export class CodeUsageService implements ICodeUsageService {
	public _serviceBrand: undefined;

	private readonly usageMap;

	constructor() {
		this.usageMap = new Map<CodeUsageId, CodeUsage>();
	}

	public storeUsage(key: CodeUsageId, usage: CodeUsage): void {
		this.usageMap.set(key, usage);
	}

	public getUsage(key: CodeUsageId): CodeUsage | undefined {
		return this.usageMap.get(key);
	}
}

registerSingleton(ICodeUsageService, CodeUsageService, InstantiationType.Delayed);
