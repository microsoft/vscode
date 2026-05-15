/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/** @jsxRuntime automatic */
/** @jsxImportSource ../../../../prompt/jsx-runtime/ */

import { DiagnosticSeverity, type Diagnostic } from 'vscode';
import { Chunk, ComponentContext, PromptElementProps, Text } from '../../../../prompt/src/components/components';
import { normalizeLanguageId } from '../../../../prompt/src/prompt';
import type { ICompletionsTextDocumentManagerService } from '../../textDocumentManager';
import {
	CompletionRequestData,
	isCompletionRequestData,
	type CompletionRequestDocument,
} from '../completionsPromptFactory/componentsCompletionsPromptFactory';
import { type DiagnosticBagWithId } from '../contextProviders/contextItemSchemas';


function getCode(diagnostic: Diagnostic): string | undefined {
	if (diagnostic.code === undefined) {
		return undefined;
	}
	if (typeof diagnostic.code === 'string') {
		return diagnostic.code;
	}
	if (typeof diagnostic.code === 'number') {
		return diagnostic.code.toString();
	}
	if (typeof diagnostic.code === 'object' && diagnostic.code !== null && diagnostic.code.value) {
		return diagnostic.code.value.toString();
	}
	return undefined;
}

function getRelativePath(tdm: ICompletionsTextDocumentManagerService, item: DiagnosticBagWithId): string {
	return tdm.getRelativePath({ uri: item.uri.toString() }) ?? item.uri.path;
}

type DiagnosticsProps = {
	tdms: ICompletionsTextDocumentManagerService;
} & PromptElementProps;


export const Diagnostics = (props: DiagnosticsProps, context: ComponentContext) => {
	const [diagnostics, setDiagnostics] = context.useState<DiagnosticBagWithId[]>();
	const [languageId, setLanguageId] = context.useState<string>();
	const [position, setPosition] = context.useState<{ line: number; character: number }>();
	const [document, setDocument] = context.useState<CompletionRequestDocument>();


	context.useData(isCompletionRequestData, (data: CompletionRequestData) => {
		if (data.diagnostics !== diagnostics) {
			setDiagnostics(data.diagnostics);
		}

		const normalizedLanguageId = normalizeLanguageId(data.document.detectedLanguageId);
		if (normalizedLanguageId !== languageId) {
			setLanguageId(normalizedLanguageId);
		}

		if (data.position !== position) {
			setPosition(data.position);
		}

		if (data.document.uri !== document?.uri) {
			setDocument(data.document);
		}
	});

	if (!diagnostics || diagnostics.length === 0 || !languageId) {
		return;
	}
	const validChunks = diagnostics.filter(diagnostic => diagnostic.values.length > 0);
	if (validChunks.length === 0) {
		return;
	}

	// Sort by importance, with the most important first
	validChunks.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
	// Reverse the order so the most important snippet is last. Note, that we don't directly
	// sort in ascending order to handle importance 0 correctly.
	validChunks.reverse();

	return validChunks.map(diagnosticBag => {
		const elements = [];
		elements.push(
			<Text key={diagnosticBag.id} source={diagnosticBag}>
				{`Consider the following ${languageId} diagnostics from ${getRelativePath(props.tdms, diagnosticBag)}:`}
			</Text>
		);
		let values: Diagnostic[] = diagnosticBag.values;
		if (document !== undefined && document.uri.toString() === diagnosticBag.uri.toString() && position !== undefined) {
			// Create a copy of the diagnostics to avoid mutating the original array in the context item in case it is used elsewhere.
			values = diagnosticBag.values.slice();
			values.sort((a, b) => {
				const aDist = Math.abs(a.range.start.line - position.line);
				const bDist = Math.abs(b.range.start.line - position.line);
				return aDist - bDist;
			});
		}
		values.forEach(diagnostic => {
			let codeStr = '';
			const code = getCode(diagnostic);
			if (code !== undefined) {
				const source = diagnostic.source ? diagnostic.source.toUpperCase() : '';
				codeStr = ` ${source}${code}`;
			}
			const start = diagnostic.range.start;
			elements.push(
				<Text>
					{`${start.line + 1}:${start.character + 1} - ${DiagnosticSeverity[diagnostic.severity].toLowerCase()}${codeStr}: ${diagnostic.message}`}
				</Text>
			);
		});
		return <Chunk>{elements}</Chunk>;
	});
};