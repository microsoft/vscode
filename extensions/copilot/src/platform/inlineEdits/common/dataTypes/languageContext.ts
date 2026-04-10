/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../../../../util/vs/editor/common/core/range';
import { Diagnostic, Uri } from '../../../../vscodeTypes';
import { ContextItem, ContextKind, SnippetContext, TraitContext, type DiagnosticBagContext } from '../../../languageServer/common/languageContextService';

export type LanguageContextEntry = {
	context: ContextItem;
	timeStamp: number;
	onTimeout: boolean;
}

export type LanguageContextResponse = {
	start: number;
	end: number;
	items: LanguageContextEntry[];
}

type SerializedSnippetContext = {
	kind: ContextKind.Snippet;
	priority: number;
	uri: string;
	additionalUris?: string[];
	value: string;
}

type SerializedTraitContext = {
	kind: ContextKind.Trait;
	priority: number;
	name: string;
	value: string;
}

type SerializedDiagnosticBagContext = {
	kind: ContextKind.DiagnosticBag;
	priority: number;
	uri: string;
	values: Omit<SerializedDiagnostic, 'uri'>[];
}

type SerializedContextItem = SerializedSnippetContext | SerializedTraitContext | SerializedDiagnosticBagContext;

export type SerializedContextResponse = {
	start: number;
	end: number;
	items: {
		context: SerializedContextItem;
		timeStamp: number;
	}[];
}

export function serializeLanguageContext(response: LanguageContextResponse): SerializedContextResponse {
	return {
		start: response.start,
		end: response.end,
		items: response.items.map(item => ({
			context: serializeLanguageContextItem(item.context),
			timeStamp: item.timeStamp,
			onTimeout: item.onTimeout,
		}))
	};
}

function serializeLanguageContextItem(context: ContextItem): SerializedContextItem {
	switch (context.kind) {
		case ContextKind.Snippet:
			return serializeSnippetContext(context);
		case ContextKind.Trait:
			return serializeTraitContext(context);
		case ContextKind.DiagnosticBag:
			return serializeDiagnosticBagContext(context);
	}
}

function serializeSnippetContext(context: SnippetContext): SerializedSnippetContext {
	return {
		kind: context.kind,
		priority: context.priority,
		uri: context.uri.toString(),
		additionalUris: context.additionalUris?.map(uri => uri.toString()),
		value: context.value
	};
}

function serializeTraitContext(context: TraitContext): SerializedTraitContext {
	return {
		kind: context.kind,
		priority: context.priority,
		name: context.name,
		value: context.value
	};
}

function serializeDiagnosticBagContext(context: DiagnosticBagContext): SerializedDiagnosticBagContext {
	const values = context.values.map((diagnostic) => {
		return serializeDiagnostic(diagnostic);
	});
	return {
		kind: context.kind,
		priority: context.priority,
		uri: context.uri.toString(),
		values: values
	};
}

export type SerializedDiagnostic = {
	uri: string;
	severity: 'Error' | 'Warning' | 'Information' | 'Hint';
	message: string;
	source: string;
	code: string | number | undefined;
	range: string;
}

function serializeDiagnostic(diagnostic: Diagnostic): Omit<SerializedDiagnostic, 'uri'>;
function serializeDiagnostic(diagnostic: Diagnostic, resource: Uri): SerializedDiagnostic;
function serializeDiagnostic(diagnostic: Diagnostic, resource?: Uri): SerializedDiagnostic | Omit<SerializedDiagnostic, 'uri'> {
	const result: SerializedDiagnostic | Omit<SerializedDiagnostic, 'uri'> = {
		severity: diagnostic.severity === 0 ? 'Error' : diagnostic.severity === 1 ? 'Warning' : diagnostic.severity === 2 ? 'Information' : 'Hint',
		message: diagnostic.message,
		source: diagnostic.source || '',
		code: diagnostic.code && !(typeof diagnostic.code === 'number') && !(typeof diagnostic.code === 'string') ? diagnostic.code.value : diagnostic.code,
		range: new Range(diagnostic.range.start.line + 1, diagnostic.range.start.character + 1, diagnostic.range.end.line + 1, diagnostic.range.end.character + 1).toString(),
	};
	if (resource) {
		(result as SerializedDiagnostic).uri = resource.toString();
	}
	return result;
}

export function serializeFileDiagnostics(diagnostics: [Uri, Diagnostic[]][]): SerializedDiagnostic[] {
	return diagnostics.flatMap(([resource, diags]) =>
		diags.map(diagnostic => serializeDiagnostic(diagnostic, resource))
	);
}