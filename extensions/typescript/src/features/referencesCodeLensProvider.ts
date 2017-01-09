/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { CodeLensProvider, CodeLens, CancellationToken, TextDocument, Range, Uri, Location, Position, workspace, WorkspaceConfiguration } from 'vscode';
import * as Proto from '../protocol';
import * as PConst from '../protocol.const';

import { ITypescriptServiceClient } from '../typescriptService';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();


class ReferencesCodeLens extends CodeLens {
	public document: Uri;
	public file: string;

	constructor(document: Uri, file: string, range: Range) {
		super(range);
		this.document = document;
		this.file = file;
	}
}

export default class TypeScriptReferencesCodeLensProvider implements CodeLensProvider {
	private client: ITypescriptServiceClient;
	private enabled = false;

	constructor(client: ITypescriptServiceClient) {
		this.client = client;
	}

	public updateConfiguration(config: WorkspaceConfiguration): void {
		let typeScriptConfig = workspace.getConfiguration('typescript');
		this.enabled = typeScriptConfig.get('referencesCodeLens.enabled', false);
	}

	provideCodeLenses(document: TextDocument, token: CancellationToken): Promise<CodeLens[]> {
		if (!this.enabled) {
			return Promise.resolve([]);
		}

		const filepath = this.client.asAbsolutePath(document.uri);
		if (!filepath) {
			return Promise.resolve([]);
		}
		return this.client.execute('navtree', { file: filepath }, token).then(response => {
			const tree = response.body;
			const referenceableSpans: Range[] = [];
			if (tree && tree.childItems) {
				tree.childItems.forEach(item => this.extractReferenceableSymbols(document, item, referenceableSpans));
			}
			return Promise.resolve(referenceableSpans.map(span => new ReferencesCodeLens(document.uri, filepath, span)));
		});
	}

	resolveCodeLens(inputCodeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
		const codeLens = inputCodeLens as ReferencesCodeLens;
		if (!codeLens.document) {
			return Promise.reject<CodeLens>(codeLens);
		}
		const args: Proto.FileLocationRequestArgs = {
			file: codeLens.file,
			line: codeLens.range.start.line + 1,
			offset: codeLens.range.start.character + 1
		};
		return this.client.execute('references', args, token).then(response => {
			if (response && response.body) {
				const referenceCount = Math.max(0, response.body.refs.length - 1);
				const locations = response.body.refs.map(reference =>
					new Location(Uri.file(reference.file),
						new Range(
							new Position(reference.start.line - 1, reference.start.offset - 1),
							new Position(reference.end.line - 1, reference.end.offset - 1))));

				codeLens.command = {
					title: referenceCount + ' ' + (referenceCount === 1 ? localize('oneReferenceLabel', 'reference') : localize('manyReferenceLabel', 'references')),
					command: 'editor.action.showReferences',
					arguments: [codeLens.document, codeLens.range.start, locations]
				};
				return Promise.resolve(codeLens);
			}
			return Promise.reject(codeLens);
		}).catch(() => {
			codeLens.command = {
				title: localize('referenceErrorLabel', 'Could not determine references'),
				command: ''
			};
			return Promise.resolve(codeLens);
		});
	}

	private extractReferenceableSymbols(document: TextDocument, item: Proto.NavigationTree, results: Range[]) {
		if (!item) {
			return;
		}

		const span = item.spans && item.spans[0];
		if (span) {
			const range = new Range(
				new Position(span.start.line - 1, span.start.offset - 1),
				new Position(span.end.line - 1, span.end.offset - 1));

			// TODO: TS currently requires the position for 'references 'to be inside of the identifer
			// Massage the range to make sure this is the case
			const text = document.getText(range);

			switch (item.kind) {
				case PConst.Kind.const:
				case PConst.Kind.let:
				case PConst.Kind.variable:
				case PConst.Kind.function:
					// Only show references for exported variables
					if (!item.kindModifiers.match(/\bexport\b/)) {
						break;
					}
				// fallthrough

				case PConst.Kind.memberFunction:
				case PConst.Kind.memberVariable:
				case PConst.Kind.memberGetAccessor:
				case PConst.Kind.memberSetAccessor:
				case PConst.Kind.constructorImplementation:
				case PConst.Kind.class:
				case PConst.Kind.interface:
				case PConst.Kind.type:
				case PConst.Kind.enum:
					const identifierMatch = new RegExp(`^(.*?(\\b|\\W))${item.text}`, 'g');
					const match = identifierMatch.exec(text);
					const start = match ? match.index + match[1].length : 0;
					results.push(new Range(
						new Position(range.start.line, range.start.character + start),
						new Position(range.start.line, range.start.character + start + item.text.length)));
					break;
			}
		}

		(item.childItems || []).forEach(item => this.extractReferenceableSymbols(document, item, results));
	}
};