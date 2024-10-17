/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IAiRelatedInformationService = createDecorator<IAiRelatedInformationService>('IAiRelatedInformationService');

export enum RelatedInformationType {
	SymbolInformation = 1,
	CommandInformation = 2,
	SearchInformation = 3,
	SettingInformation = 4
}

interface RelatedInformationBaseResult {
	type: RelatedInformationType;
	weight: number;
}

export interface CommandInformationResult extends RelatedInformationBaseResult {
	type: RelatedInformationType.CommandInformation;
	command: string;
}

export interface SettingInformationResult extends RelatedInformationBaseResult {
	type: RelatedInformationType.SettingInformation;
	setting: string;
}

export type RelatedInformationResult = CommandInformationResult | SettingInformationResult;

export interface IAiRelatedInformationService {
	readonly _serviceBrand: undefined;

	isEnabled(): boolean;
	getRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): Promise<RelatedInformationResult[]>;
	registerAiRelatedInformationProvider(type: RelatedInformationType, provider: IAiRelatedInformationProvider): IDisposable;
}

export interface IAiRelatedInformationProvider {
	provideAiRelatedInformation(query: string, token: CancellationToken): Promise<RelatedInformationResult[]>;
}
