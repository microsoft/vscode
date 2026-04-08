/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { IInstantiationService } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { Chunk, ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { DocumentInfoWithOffset, PromptOptions } from '../../../../prompt/src/prompt';
import { getSimilarSnippets } from '../../../../prompt/src/snippetInclusion/similarFiles';
import { announceSnippet } from '../../../../prompt/src/snippetInclusion/snippets';
import { getSimilarFilesOptions } from '../../experiments/similarFileOptionsProvider';
import { TelemetryWithExp } from '../../telemetry';
import { TextDocumentContents } from '../../textDocument';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import {
	CompletionRequestData,
	CompletionRequestDocument,
	isCompletionRequestData,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';
import { getPromptOptions } from '../prompt';
import { NeighborsCollection, NeighborSource } from '../similarFiles/neighborFiles';

type SimilarFilesProps = {
	instantiationService: IInstantiationService;
	tdms: ICompletionsTextDocumentManagerService;
} & PromptElementProps;

type SimilarFileSnippet = {
	headline: string;
	snippet: string;
	score: number;
};

export const SimilarFiles = (props: SimilarFilesProps, context: ComponentContext) => {
	const [document, setDocument] = context.useState<CompletionRequestDocument>();
	const [similarFiles, setSimilarFiles] = context.useState<SimilarFileSnippet[]>([]);

	context.useData(isCompletionRequestData, async (requestData: CompletionRequestData) => {
		if (requestData.document.uri !== document?.uri) {
			setSimilarFiles([]);
		}
		setDocument(requestData.document);

		let files: { docs: NeighborsCollection } = NeighborSource.defaultEmptyResult();
		if (!requestData.turnOffSimilarFiles) {
			files = await props.instantiationService.invokeFunction(async acc => await NeighborSource.getNeighborFilesAndTraits(
				acc,
				requestData.document.uri,
				requestData.document.detectedLanguageId,
				requestData.telemetryData,
				requestData.cancellationToken,
				requestData.data
			));
		}

		const similarFiles = await produceSimilarFiles(
			requestData.telemetryData,
			requestData.document,
			requestData,
			files
		);
		setSimilarFiles(similarFiles);
	});

	async function produceSimilarFiles(
		telemetryData: TelemetryWithExp,
		doc: TextDocumentContents,
		requestData: CompletionRequestData,
		files: {
			docs: NeighborsCollection;
		}
	): Promise<SimilarFileSnippet[]> {
		const promptOptions = props.instantiationService.invokeFunction(getPromptOptions, telemetryData, doc.detectedLanguageId);
		const similarSnippets = await findSimilarSnippets(promptOptions, telemetryData, doc, requestData, files);
		return similarSnippets
			.filter(s => s.snippet.length > 0)
			.sort((a, b) => a.score - b.score)
			.map(s => {
				return { ...announceSnippet(s), score: s.score };
			});
	}

	async function findSimilarSnippets(
		promptOptions: PromptOptions,
		telemetryData: TelemetryWithExp,
		doc: TextDocumentContents,
		requestData: CompletionRequestData,
		files: { docs: NeighborsCollection }
	) {
		const similarFilesOptions =
			promptOptions.similarFilesOptions ||
			props.instantiationService.invokeFunction(getSimilarFilesOptions, telemetryData, doc.detectedLanguageId);
		const tdm = props.tdms;
		const relativePath = tdm.getRelativePath(doc);
		const docInfo: DocumentInfoWithOffset = {
			uri: doc.uri,
			source: doc.getText(),
			offset: doc.offsetAt(requestData.position),
			relativePath,
			languageId: doc.detectedLanguageId,
		};
		return await getSimilarSnippets(docInfo, Array.from(files.docs.values()), similarFilesOptions);
	}

	return <>{...similarFiles.map((file, index) => <SimilarFile snippet={file} />)}</>;
};

// TODO: change Chunk for KeepTogether
const SimilarFile = (props: { snippet: SimilarFileSnippet }, context: ComponentContext) => {
	return (
		<Chunk>
			<Text>{props.snippet.headline}</Text>
			<Text>{props.snippet.snippet}</Text>
		</Chunk>
	);
};
