import Handlebars from "handlebars";
import secureJSON from "secure-json-parse";
import * as vscode from "vscode";
import { AIClient } from "../../ai/AIClient";
import { readFileContent } from "../../vscode/readFileContent";
import { RetrievalAugmentation } from "../template/PearAITemplate";
import { cosineSimilarity } from "./cosineSimilarity";
import { embeddingFileSchema } from "./EmbeddingFile";

export async function executeRetrievalAugmentation({
	retrievalAugmentation,
	initVariables,
	variables,
	ai,
}: {
	retrievalAugmentation: RetrievalAugmentation;
	initVariables: Record<string, unknown>;
	variables: Record<string, unknown>;
	ai: AIClient;
}): Promise<
	| Array<{
			file: string;
			startPosition: number;
			endPosition: number;
			content: string;
	  }>
	| undefined
> {
	const file = retrievalAugmentation.file;

	const fileUri = vscode.Uri.joinPath(
		vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(""),
		".pearai/embedding",
		file
	);

	const fileContent = await readFileContent(fileUri);
	const parsedContent = secureJSON.parse(fileContent);
	const { chunks } = embeddingFileSchema.parse(parsedContent);

	// expand query with variables:
	const query = Handlebars.compile(retrievalAugmentation.query, {
		noEscape: true,
	})({
		...initVariables,
		...variables,
	});

	const result = await ai.generateEmbedding({
		input: query,
	});

	if (result.type === "error") {
		console.log(result.errorMessage);
		return undefined;
	}

	const queryEmbedding = result.embedding!;

	const similarityChunks = chunks
		.map(({ start_position, end_position, content, file, embedding }) => ({
			file,
			startPosition: start_position,
			endPosition: end_position,
			content,
			similarity: cosineSimilarity(embedding, queryEmbedding),
		}))
		.filter(({ similarity }) => similarity >= retrievalAugmentation.threshold);

	similarityChunks.sort((a, b) => b.similarity - a.similarity);

	return similarityChunks
		.slice(0, retrievalAugmentation.maxResults)
		.map((chunk) => ({
			file: chunk.file,
			startPosition: chunk.startPosition,
			endPosition: chunk.endPosition,
			content: chunk.content,
		}));
}
