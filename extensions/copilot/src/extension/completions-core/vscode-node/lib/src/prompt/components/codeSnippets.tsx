/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { Chunk, ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import {
	CompletionRequestDocument,
	isCompletionRequestData,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';
import { addRelativePathToCodeSnippets, CodeSnippetWithRelativePath } from '../contextProviders/codeSnippets';
import { CodeSnippetWithId } from '../contextProviders/contextItemSchemas';

type CodeSnippetsProps = {
	tdms: ICompletionsTextDocumentManagerService;
} & PromptElementProps;

export const CodeSnippets = (props: CodeSnippetsProps, context: ComponentContext) => {
	const [snippets, setSnippets] = context.useState<CodeSnippetWithId[]>();
	const [document, setDocument] = context.useState<CompletionRequestDocument>();

	context.useData(isCompletionRequestData, request => {
		if (request.codeSnippets !== snippets) {
			setSnippets(request.codeSnippets);
		}
		if (request.document.uri !== document?.uri) {
			setDocument(request.document);
		}
	});

	if (!snippets || snippets.length === 0 || !document) {
		return;
	}

	const codeSnippetsWithRelativePath = addRelativePathToCodeSnippets(props.tdms, snippets);

	// Snippets with the same URI should appear together as a single snippet.
	const snippetsByUri = new Map<string, CodeSnippetWithRelativePath[]>();

	for (const snippet of codeSnippetsWithRelativePath) {
		const uri = snippet.relativePath ?? snippet.snippet.uri;
		let groupedSnippets = snippetsByUri.get(uri);
		if (groupedSnippets === undefined) {
			groupedSnippets = [];
			snippetsByUri.set(uri, groupedSnippets);
		}
		groupedSnippets.push(snippet);
	}

	const codeSnippetChunks: {
		chunkElements: CodeSnippetWithId[];
		importance: number;
		uri: string;
	}[] = [];
	for (const [uri, snippets] of snippetsByUri.entries()) {
		const validSnippets = snippets.filter(s => s.snippet.value.length > 0);
		if (validSnippets.length > 0) {
			codeSnippetChunks.push({
				chunkElements: validSnippets.map(s => s.snippet),
				// The importance is the maximum importance of the snippets in this group.
				importance: Math.max(...validSnippets.map(snippet => snippet.snippet.importance ?? 0)),
				uri,
			});
		}
	}

	if (codeSnippetChunks.length === 0) {
		return;
	}

	// Sort by importance, with the most important first
	codeSnippetChunks.sort((a, b) => b.importance - a.importance);
	// Reverse the order so the most important snippet is last. Note, that we don't directly
	// sort in ascending order to handle importance 0 correctly.
	codeSnippetChunks.reverse();
	return codeSnippetChunks.map(chunk => {
		const elements = [];

		elements.push(
			<Text>
				{`Compare ${chunk.chunkElements.length > 1 ? 'these snippets' : 'this snippet'} from ${chunk.uri}:`}
			</Text>
		);

		chunk.chunkElements.forEach((element, index) => {
			elements.push(
				<Text source={element} key={element.id}>
					{element.value}
				</Text>
			);
			if (chunk.chunkElements.length > 1 && index < chunk.chunkElements.length - 1) {
				elements.push(<Text>---</Text>);
			}
		});

		// TODO: change Chunk for KeepTogether
		return <Chunk>{elements}</Chunk>;
	});
};
