/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/190909

	export interface SearchResult {
		// from Andrea
		preview: string;
		resource: Uri;
		location: Range;
	}

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

	export interface SymbolInformationResult extends RelatedInformationResult {
		type: RelatedInformationType.SymbolInformation;
		symbolInformation: SymbolInformation;
	}

	export interface CommandInformationResult extends RelatedInformationResult {
		type: RelatedInformationType.CommandInformation;
		command: string;
	}

	export interface SettingInformationResult extends RelatedInformationResult {
		type: RelatedInformationType.SettingInformation;
		setting: string;
	}

	export interface SearchInformationResult extends RelatedInformationResult {
		type: RelatedInformationType.SearchInformation;
		searchResult: SearchResult;
	}

	export interface RelatedInformationProvider {
		provideRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): ProviderResult<RelatedInformationResult[]>;
	}

	export interface EmbeddingVectorProvider {
		provideEmbeddingVector(strings: string[], token: CancellationToken): ProviderResult<number[][]>;
	}

	export namespace ai {
		export function getRelatedInformation(query: string, types: RelatedInformationType[], token: CancellationToken): Thenable<RelatedInformationResult[]>;
		export function registerRelatedInformationProvider(types: RelatedInformationType[], provider: RelatedInformationProvider): Disposable;
		export function registerEmbeddingVectorProvider(model: string, provider: EmbeddingVectorProvider): Disposable;
	}
}
