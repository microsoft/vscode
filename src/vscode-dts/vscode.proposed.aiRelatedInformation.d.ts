/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/190909

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

	// TODO: Symbols and Search

	export interface CommandInformationResult extends RelatedInformationBaseResult {
		type: RelatedInformationType.CommandInformation;
		command: string;
	}

	export interface SettingInformationResult extends RelatedInformationBaseResult {
		type: RelatedInformationType.SettingInformation;
		setting: string;
	}

	export type RelatedInformationResult = CommandInformationResult | SettingInformationResult;

	export interface RelatedInformationProvider {
		provideRelatedInformation(query: string, token: CancellationToken): ProviderResult<RelatedInformationResult[]>;
	}

	export interface EmbeddingVectorProvider {
		provideEmbeddingVector(strings: string[], token: CancellationToken): ProviderResult<number[][]>;
	}

	export namespace ai {
		export function getRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): Thenable<RelatedInformationResult[]>;
		export function registerRelatedInformationProvider(type: RelatedInformationType, provider: RelatedInformationProvider): Disposable;
		export function registerEmbeddingVectorProvider(model: string, provider: EmbeddingVectorProvider): Disposable;
	}
}
