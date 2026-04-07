/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import { ChatResponsePart } from '@vscode/prompt-tsx/dist/base/vscodeTypes';
import { Embedding, EmbeddingType, EmbeddingVector, IEmbeddingsComputer, rankEmbeddings } from '../../../../platform/embeddings/common/embeddingsComputer';
import { EmbeddingCacheType, IEmbeddingsCache, LocalEmbeddingsCache, RemoteCacheType, RemoteEmbeddingsCache } from '../../../../platform/embeddings/common/embeddingsIndex';
import { IEnvService } from '../../../../platform/env/common/envService';
import { Progress } from '../../../../platform/notification/common/notificationService';
import { createFencedCodeBlock } from '../../../../util/common/markdown';
import { TelemetryCorrelationId } from '../../../../util/common/telemetryCorrelationId';
import { sanitizeVSCodeVersion } from '../../../../util/common/vscodeVersion';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { createDecorator, IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';

type BaseApiContext = { text: string; embedding: EmbeddingVector; type: 'code' | 'command' | 'documentationCodeBlock' };
type CodeApiContext = BaseApiContext & { type: 'code'; lang: string };
type CommandApiContext = BaseApiContext & { type: 'command' };
type DocumentationCodeBlockApiContext = BaseApiContext & { type: 'documentationCodeBlock'; lang: string };
type ApiContext = CodeApiContext | CommandApiContext | DocumentationCodeBlockApiContext;

export class ApiEmbeddingsIndex implements IApiEmbeddingsIndex {
	declare readonly _serviceBrand: undefined;
	private readonly embeddingsCache: IEmbeddingsCache;
	private apiChunks: ApiContext[] | undefined;

	constructor(
		useRemoteCache: boolean = true,
		@IEnvService envService: IEnvService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		const cacheVersion = sanitizeVSCodeVersion(envService.getEditorInfo().version);
		this.embeddingsCache = useRemoteCache ?
			instantiationService.createInstance(RemoteEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'api', cacheVersion, EmbeddingType.text3small_512, RemoteCacheType.Api) :
			instantiationService.createInstance(LocalEmbeddingsCache, EmbeddingCacheType.GLOBAL, 'api', cacheVersion, EmbeddingType.text3small_512);
	}

	async updateIndex(): Promise<void> {
		this.apiChunks = await this.embeddingsCache.getCache();
	}

	public nClosestValues(queryEmbedding: Embedding, n: number): string[] {
		if (!this.apiChunks) {
			return [];
		}

		return rankEmbeddings(queryEmbedding, this.apiChunks.map(item => [item, { type: this.embeddingsCache.embeddingType, value: item.embedding } satisfies Embedding]), n)
			.map(x => this.toContextString(x.value));
	}

	private toContextString(context: ApiContext): string {
		if (context.type === 'code') {
			return `API Reference Code Snippet from vscode.d.ts:\n${createFencedCodeBlock(context.lang, context.text)}`;
		} else if (context.type === 'command') {
			return `${context.text}`;
		} else if (context.type === 'documentationCodeBlock') {
			return `Example code from VS Code documentation:\n${createFencedCodeBlock(context.lang, context.text)}`;
		}

		return '';
	}
}

export interface IApiEmbeddingsIndex {
	readonly _serviceBrand: undefined;

	updateIndex(): Promise<void>;
	nClosestValues(embedding: Embedding, n: number): string[];
}

export const IApiEmbeddingsIndex = createDecorator<IApiEmbeddingsIndex>('IApiEmbeddingsIndex');

export interface VSCodeAPIContextProps extends BasePromptElementProps {
	query: string;
}

export class VSCodeAPIContextElement extends PromptElement<VSCodeAPIContextProps> {
	constructor(
		props: VSCodeAPIContextProps,
		@IApiEmbeddingsIndex private readonly apiEmbeddingsIndex: IApiEmbeddingsIndex,
		@IEmbeddingsComputer private readonly embeddingsComputer: IEmbeddingsComputer,
	) {
		super(props);
	}

	async renderAsString(): Promise<string> {
		const snippets = await this.getSnippets(undefined);
		return `Below are some potentially relevant code samples related to VS Code extension development. You may use information from these samples to help you answer the question if you believe it is relevant.\n${snippets.join('\n\n')}`;
	}

	private async getSnippets(token: CancellationToken | undefined): Promise<string[]> {
		await this.apiEmbeddingsIndex.updateIndex();
		if (token?.isCancellationRequested) {
			return [];
		}

		const embeddingResult = await this.embeddingsComputer.computeEmbeddings(EmbeddingType.text3small_512, [this.props.query], {}, new TelemetryCorrelationId('VSCodeAPIContextElement::getSnippets'), token);
		return this.apiEmbeddingsIndex.nClosestValues(embeddingResult.values[0], 5);
	}

	override async render(state: undefined, sizing: PromptSizing, progress?: Progress<ChatResponsePart>, token?: CancellationToken): Promise<PromptPiece<any, any> | undefined> {
		const snippets = await this.getSnippets(token);
		if (snippets.length) {
			return <>
				Below are some potentially relevant code samples related to VS Code extension development. You may use information from these samples to help you answer the question if you believe it is relevant.<br />
				{snippets.map(s => {
					return <><TextChunk>{s}</TextChunk><br /><br /></>;
				})}
			</>;
		}
	}
}
