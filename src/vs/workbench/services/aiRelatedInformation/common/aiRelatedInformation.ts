/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IAiRelatedInformationService = createDecorator<IAiRelatedInformationService>('IAiRelatedInformationService');

export enum RelatedInformationType {
	SymbolInformation = 1,
	CommandInformation = 2,
	SearchInformation = 3,
	SettingInformation = 4
}

export interface RelatedInformationResult {
	type: RelatedInformationType;
	weight: number;
}

export interface CommandInformationResult extends RelatedInformationResult {
	type: RelatedInformationType.CommandInformation;
	command: string;
}

export interface SettingInformationResult extends RelatedInformationResult {
	type: RelatedInformationType.SettingInformation;
	setting: string;
}

export interface IAiRelatedInformationService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	getRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): Promise<RelatedInformationResult[]>;
	registerAiRelatedInformationProvider(types: RelatedInformationType[], provider: IAiRelatedInformationProvider): IDisposable;
}

export interface IAiRelatedInformationProvider {
	provideAiRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): Promise<RelatedInformationResult[]>;
}
