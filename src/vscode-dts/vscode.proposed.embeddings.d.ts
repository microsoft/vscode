/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/212083

	export interface Embedding {
		readonly values: number[];
	}

	// TODO@API strictly not the right namespace...
	export namespace lm {

		export const embeddingModels: string[];

		export const onDidChangeEmbeddingModels: Event<void>;

		export function computeEmbeddings(embeddingsModel: string, input: string, token?: CancellationToken): Thenable<Embedding>;

		export function computeEmbeddings(embeddingsModel: string, input: string[], token?: CancellationToken): Thenable<Embedding[]>;
	}

	export interface EmbeddingsProvider {
		provideEmbeddings(input: string[], token: CancellationToken): ProviderResult<Embedding[]>;
	}

	export namespace lm {
		export function registerEmbeddingsProvider(embeddingsModel: string, provider: EmbeddingsProvider): Disposable;
	}
}
