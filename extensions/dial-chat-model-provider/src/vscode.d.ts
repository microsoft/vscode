import 'vscode';
import type { DialLanguageModelConfigurationSchema } from './modelConfigurationSchema';

declare module 'vscode' {
	interface LanguageModelChatInformation {
		readonly configurationSchema?: DialLanguageModelConfigurationSchema;
		readonly isBYOK?: boolean;
		readonly isUserSelectable?: boolean;
	}

	interface Embedding {
		readonly values: number[];
	}

	interface EmbeddingsProvider {
		provideEmbeddings(
			input: string[],
			token: CancellationToken,
		): ProviderResult<Embedding[]>;
	}

	namespace lm {
		const embeddingModels: string[];
		const onDidChangeEmbeddingModels: Event<void>;
		function registerEmbeddingsProvider(
			embeddingsModel: string,
			provider: EmbeddingsProvider,
		): Disposable;
		function computeEmbeddings(
			embeddingsModel: string,
			input: string,
			token?: CancellationToken,
		): Thenable<Embedding>;
		function computeEmbeddings(
			embeddingsModel: string,
			input: string[],
			token?: CancellationToken,
		): Thenable<Embedding[]>;
	}
}
