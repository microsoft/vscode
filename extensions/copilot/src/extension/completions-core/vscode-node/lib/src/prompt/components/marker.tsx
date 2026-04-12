/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { getLanguageMarker, getPathMarker } from '../../../../prompt/src/languageMarker';
import { DocumentInfo } from '../../../../prompt/src/prompt';
import { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import {
	CompletionRequestDocument,
	isCompletionRequestData,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';

type DocumentMarkerProps = {
	tdms: ICompletionsTextDocumentManagerService;
} & PromptElementProps;

export const DocumentMarker = (props: DocumentMarkerProps, context: ComponentContext) => {
	const [document, setDocument] = context.useState<CompletionRequestDocument>();

	context.useData(isCompletionRequestData, request => {
		if (request.document.uri !== document?.uri) {
			setDocument(request.document);
		}
	});

	if (document) {
		const relativePath = props.tdms.getRelativePath(document);
		const docInfo: DocumentInfo = {
			uri: document.uri,
			source: document.getText(),
			relativePath,
			languageId: document.detectedLanguageId,
		};
		const notebook = props.tdms.findNotebook(document);
		if (docInfo.relativePath && !notebook) {
			return <PathMarker docInfo={docInfo} />;
		}
		return <LanguageMarker docInfo={docInfo} />;
	}
};

const PathMarker = (props: { docInfo: DocumentInfo }) => {
	return <Text>{getPathMarker(props.docInfo)}</Text>;
};

const LanguageMarker = (props: { docInfo: DocumentInfo }) => {
	return <Text>{getLanguageMarker(props.docInfo)}</Text>;
};
