/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import Parser = require('./jsonParser');
import SchemaService = require('./jsonSchemaService');

import {Hover, ITextDocument, TextDocumentPosition, Range, MarkedString, RemoteConsole} from 'vscode-languageserver';

import {LinesModel} from './utils/lines';

export class JSONHover {

	private schemaService: SchemaService.IJSONSchemaService;

	constructor(schemaService: SchemaService.IJSONSchemaService) {
		this.schemaService = schemaService;
	}

	public doHover(document: ITextDocument, textDocumentPosition: TextDocumentPosition, lines: LinesModel, doc: Parser.JSONDocument): Thenable<Hover> {

		let offset = lines.offsetAt(textDocumentPosition.position);
		let node = doc.getNodeFromOffset(offset);
		let originalNode = node;

		// use the property description when hovering over an object key
		if (node && node.type === 'string') {
			let stringNode = <Parser.StringASTNode>node;
			if (stringNode.isKey) {
				let propertyNode = <Parser.PropertyASTNode>node.parent;
				node = propertyNode.value;

			}
		}

		if (!node) {
			return Promise.resolve(void 0);
		}

		return this.schemaService.getSchemaForResource(textDocumentPosition.uri, doc).then((schema) => {
			if (schema) {
				let matchingSchemas: Parser.IApplicableSchema[] = [];
				doc.validate(schema.schema, matchingSchemas, node.start);

				let description: string = null;
				let contributonId: string = null;
				matchingSchemas.every((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						description = description || s.schema.description;
						contributonId = contributonId || s.schema.id;
					}
					return true;
				});

				if (description) {
					let range = Range.create(lines.positionAt(node.start), lines.positionAt(node.end));
					let result: Hover = {
						contents: [description],
						range: range
					};
					return result;
				}
			}
			return void 0;
		});
	}
}