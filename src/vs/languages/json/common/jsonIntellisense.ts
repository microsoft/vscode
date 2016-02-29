/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import URI from 'vs/base/common/uri';
import Parser = require('./parser/jsonParser');
import SchemaService = require('./jsonSchemaService');
import Types = require('vs/base/common/types');
import WinJS = require('vs/base/common/winjs.base');
import JsonWorker = require('./jsonWorker');
import JsonSchema = require('vs/base/common/jsonSchema');
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import {IRequestService} from 'vs/platform/request/common/request';

export class JSONIntellisense {

	private schemaService: SchemaService.IJSONSchemaService;
	private requestService: IRequestService;
	private contributions: JsonWorker.IJSONWorkerContribution[];

	constructor(schemaService: SchemaService.IJSONSchemaService, requestService: IRequestService, contributions: JsonWorker.IJSONWorkerContribution[]) {
		this.schemaService = schemaService;
		this.requestService = requestService;
		this.contributions = contributions;
	}

	public doSuggest(resource: URI, modelMirror: EditorCommon.IMirrorModel, position: EditorCommon.IPosition): WinJS.TPromise<Modes.ISuggestResult> {
		var currentWord = modelMirror.getWordUntilPosition(position).word;

		var parser = new Parser.JSONParser();
		var config = new Parser.JSONDocumentConfig();
		// so you can invoke suggest after the comma in an object literal
		config.ignoreDanglingComma = true;

		var doc = parser.parse(modelMirror.getValue(), config);

		var result: Modes.ISuggestResult = {
			currentWord: currentWord,
			incomplete: false,
			suggestions: []
		};
		var overwriteBefore = void 0;
		var overwriteAfter = void 0;

		var proposed: { [key: string]: boolean } = {};
		var collector : JsonWorker.ISuggestionsCollector = {
			add: (suggestion: Modes.ISuggestion) => {
				if (!proposed[suggestion.label]) {
					proposed[suggestion.label] = true;

					suggestion.overwriteBefore = overwriteBefore;
					suggestion.overwriteAfter = overwriteAfter;
					result.suggestions.push(suggestion);
				}
			},
			setAsIncomplete: () => {
				result.incomplete = true;
			},
			error: (message: string) => {
				errors.onUnexpectedError(message);
			}
		};

		return this.schemaService.getSchemaForResource(resource.toString(), doc).then((schema) => {
			var collectionPromises: WinJS.Promise[] = [];

			var offset = modelMirror.getOffsetFromPosition(position);
			var node = doc.getNodeFromOffsetEndInclusive(offset);
			var addValue = true;
			var currentKey = currentWord;
			var currentProperty : Parser.PropertyASTNode = null;
			if (node) {

				if (node.type === 'string') {
					var stringNode = <Parser.StringASTNode> node;
					if (stringNode.isKey) {
						var nodeRange = modelMirror.getRangeFromOffsetAndLength(node.start, node.end - node.start);
						overwriteBefore = position.column - nodeRange.startColumn;
						overwriteAfter = nodeRange.endColumn - position.column;
						addValue = !(node.parent && ((<Parser.PropertyASTNode> node.parent).value));
						currentProperty = node.parent ? <Parser.PropertyASTNode> node.parent : null;
						currentKey = modelMirror.getValueInRange({ startColumn: nodeRange.startColumn + 1, startLineNumber: nodeRange.startLineNumber, endColumn: position.column, endLineNumber: position.lineNumber });
						if (node.parent) {
							node = node.parent.parent;
						}
					}

				}
			}

			// proposals for properties
			if (node && node.type === 'object') {
				// don't suggest keys when the cursor is just before the opening curly brace
				if (node.start === offset) {
					return result;
				}
				// don't suggest properties that are already present
				var properties = (<Parser.ObjectASTNode> node).properties;
				properties.forEach(p => {
					if (!currentProperty || currentProperty !== p) {
						proposed[p.key.value] = true;
					}
				});

				if (schema) {
					// property proposals with schema
					var isLast = properties.length === 0 || offset >= properties[properties.length - 1].start;
					this.getPropertySuggestions(resource, schema, doc, node, currentKey, addValue, isLast, collector);
				} else if (node.parent) {
					// property proposals without schema
					this.getSchemaLessPropertySuggestions(doc, node, collector);
				}

				var location = node.getNodeLocation();
				this.contributions.forEach((contribution) => {
					var collectPromise = contribution.collectPropertySuggestions(resource, location, currentWord, addValue, isLast, collector);
					if (collectPromise) {
						collectionPromises.push(collectPromise);
					}
				});
			}

			// proposals for values
			if (node && (node.type === 'string' || node.type === 'number' || node.type === 'integer' || node.type === 'boolean' || node.type === 'null')) {
				var nodeRange = modelMirror.getRangeFromOffsetAndLength(node.start, node.end - node.start);
				overwriteBefore = position.column - nodeRange.startColumn;
				overwriteAfter = nodeRange.endColumn - position.column;
				node = node.parent;
			}

			if (schema) {
				// value proposals with schema
				this.getValueSuggestions(resource, schema, doc, node, offset, collector);
			} else {
				// value proposals without schema
				this.getSchemaLessValueSuggestions(doc, node, offset, modelMirror, collector);
			}
			if (!node) {
				this.contributions.forEach((contribution) => {
					var collectPromise = contribution.collectDefaultSuggestions(resource, collector);
					if (collectPromise) {
						collectionPromises.push(collectPromise);
					}
				});
			} else {
				if ((node.type === 'property') && offset > (<Parser.PropertyASTNode> node).colonOffset) {
					var parentKey = (<Parser.PropertyASTNode>node).key.value;

					var valueNode = (<Parser.PropertyASTNode> node).value;
					if (!valueNode || offset <= valueNode.end) {
						var location = node.parent.getNodeLocation();
						this.contributions.forEach((contribution) => {
							var collectPromise = contribution.collectValueSuggestions(resource, location, parentKey, collector);
							if (collectPromise) {
								collectionPromises.push(collectPromise);
							}
						});
					}
				}
			}


			return WinJS.Promise.join(collectionPromises).then(() => { return result; } );
		});
	}

	private getPropertySuggestions(resource: URI, schema: SchemaService.ResolvedSchema, doc: Parser.JSONDocument, node: Parser.ASTNode, currentWord: string, addValue: boolean, isLast: boolean, collector: JsonWorker.ISuggestionsCollector): void {
		var matchingSchemas: Parser.IApplicableSchema[] = [];
		doc.validate(schema.schema, matchingSchemas, node.start);

		matchingSchemas.forEach((s) => {
			if (s.node === node && !s.inverted) {
				var schemaProperties = s.schema.properties;
				if (schemaProperties) {
					Object.keys(schemaProperties).forEach((key: string) => {
						var propertySchema = schemaProperties[key];
						collector.add({ type: 'property', label: key, codeSnippet: this.getTextForProperty(key, propertySchema, addValue, isLast), documentationLabel: propertySchema.description || '' });
					});
				}
			}
		});
	}

	private getSchemaLessPropertySuggestions(doc: Parser.JSONDocument, node: Parser.ASTNode, collector: JsonWorker.ISuggestionsCollector): void {
		var collectSuggestionsForSimilarObject = (obj: Parser.ObjectASTNode) => {
			obj.properties.forEach((p) => {
				var key = p.key.value;
				collector.add({ type: 'property', label: key, codeSnippet: this.getTextForSimilarProperty(key, p.value), documentationLabel: '' });
			});
		};
		if (node.parent.type === 'property') {
			// if the object is a property value, check the tree for other objects that hang under a property of the same name
			var parentKey = (<Parser.PropertyASTNode>node.parent).key.value;
			doc.visit((n) => {
				if (n.type === 'property' && (<Parser.PropertyASTNode>n).key.value === parentKey && (<Parser.PropertyASTNode>n).value && (<Parser.PropertyASTNode>n).value.type === 'object') {
					collectSuggestionsForSimilarObject(<Parser.ObjectASTNode> (<Parser.PropertyASTNode>n).value);
				}
				return true;
			});
		} else if (node.parent.type === 'array') {
			// if the object is in an array, use all other array elements as similar objects
			(<Parser.ArrayASTNode> node.parent).items.forEach((n) => {
				if (n.type === 'object' && n !== node) {
					collectSuggestionsForSimilarObject(<Parser.ObjectASTNode> n);
				}
			});
		}
	}

	public getSchemaLessValueSuggestions(doc: Parser.JSONDocument, node: Parser.ASTNode, offset: number, modelMirror: EditorCommon.IMirrorModel, collector: JsonWorker.ISuggestionsCollector): void {
		var collectSuggestionsForValues = (value: Parser.ASTNode) => {
			var content = this.getTextForMatchingNode(value, modelMirror);
			collector.add({ type: this.getSuggestionType(value.type), label: content, codeSnippet: content, documentationLabel: '' });
			if (value.type === 'boolean') {
				this.addBooleanSuggestion(!value.getValue(), collector);
			}
		};

		if (!node) {
			collector.add({ type: this.getSuggestionType('object'), label: 'Empty object', codeSnippet: '{\n\t{{}}\n}', documentationLabel: '' });
			collector.add({ type: this.getSuggestionType('array'), label: 'Empty array', codeSnippet: '[\n\t{{}}\n]', documentationLabel: '' });
		} else {
			if (node.type === 'property' && offset > (<Parser.PropertyASTNode> node).colonOffset) {
				var valueNode = (<Parser.PropertyASTNode>node).value;
				if (valueNode && offset > valueNode.end) {
					return;
				}
				// suggest values at the same key
				var parentKey = (<Parser.PropertyASTNode>node).key.value;
				doc.visit((n) => {
					if (n.type === 'property' && (<Parser.PropertyASTNode>n).key.value === parentKey && (<Parser.PropertyASTNode>n).value) {
						collectSuggestionsForValues((<Parser.PropertyASTNode>n).value);
					}
					return true;
				});
			}
			if (node.type === 'array') {
				if (node.parent && node.parent.type === 'property') {
					// suggest items of an array at the same key
					var parentKey = (<Parser.PropertyASTNode>node.parent).key.value;
					doc.visit((n) => {
						if (n.type === 'property' && (<Parser.PropertyASTNode>n).key.value === parentKey && (<Parser.PropertyASTNode>n).value && (<Parser.PropertyASTNode>n).value.type === 'array') {
							((<Parser.ArrayASTNode>(<Parser.PropertyASTNode>n).value).items).forEach((n) => {
								collectSuggestionsForValues(<Parser.ObjectASTNode> n);
							});
						}
						return true;
					});
				} else {
					// suggest items in the same array
					(<Parser.ArrayASTNode> node).items.forEach((n) => {
						collectSuggestionsForValues(<Parser.ObjectASTNode> n);
					});
				}
			}
		}
	}


	public getValueSuggestions(resource: URI, schema: SchemaService.ResolvedSchema, doc: Parser.JSONDocument, node: Parser.ASTNode, offset: number, collector: JsonWorker.ISuggestionsCollector) : void {

		if (!node) {
			this.addDefaultSuggestion(schema.schema, collector);
		} else {
			var parentKey: string = null;
			if (node && (node.type === 'property') && offset > (<Parser.PropertyASTNode> node).colonOffset) {
				var valueNode = (<Parser.PropertyASTNode> node).value;
				if (valueNode && offset > valueNode.end) {
					return; // we are past the value node
				}
				parentKey = (<Parser.PropertyASTNode>node).key.value;
				node = node.parent;
			}
			if (node && (parentKey !== null || node.type === 'array')) {
				var matchingSchemas: Parser.IApplicableSchema[] = [];
				doc.validate(schema.schema, matchingSchemas, node.start);

				matchingSchemas.forEach((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						if (s.schema.items) {
							this.addDefaultSuggestion(s.schema.items, collector);
							this.addEnumSuggestion(s.schema.items, collector);
						}
						if (s.schema.properties) {
							var propertySchema = s.schema.properties[parentKey];
							if (propertySchema) {
								this.addDefaultSuggestion(propertySchema, collector);
								this.addEnumSuggestion(propertySchema, collector);
							}
						}
					}
				});

			}
		}
	}

	private addBooleanSuggestion(value: boolean, collector: JsonWorker.ISuggestionsCollector): void {
		collector.add({ type: this.getSuggestionType('boolean'), label: value ? 'true' : 'false', codeSnippet: this.getTextForEnumValue(value), documentationLabel: '' });
	}

	private addEnumSuggestion(schema: JsonSchema.IJSONSchema, collector: JsonWorker.ISuggestionsCollector): void {
		if (Array.isArray(schema.enum)) {
			schema.enum.forEach((enm) => collector.add({ type: this.getSuggestionType(schema.type), label: this.getLabelForValue(enm), codeSnippet: this.getTextForEnumValue(enm), documentationLabel: '' }));
		} else if (schema.type === 'boolean') {
			this.addBooleanSuggestion(true, collector);
			this.addBooleanSuggestion(false, collector);
		}
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach((s) => this.addEnumSuggestion(s, collector));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach((s) => this.addEnumSuggestion(s, collector));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach((s) => this.addEnumSuggestion(s, collector));
		}
	}

	private addDefaultSuggestion(schema: JsonSchema.IJSONSchema, collector: JsonWorker.ISuggestionsCollector): void {
		if (schema.default) {
			collector.add({
				type: this.getSuggestionType(schema.type),
				label: this.getLabelForValue(schema.default),
				codeSnippet: this.getTextForValue(schema.default),
				typeLabel:  nls.localize('json.suggest.default', 'Default value'),
			});
		}
		if (Array.isArray(schema.defaultSnippets)) {
			schema.defaultSnippets.forEach(s => {
				collector.add({
					type: 'snippet',
					label: this.getLabelForSnippetValue(s.body),
					codeSnippet: this.getTextForSnippetValue(s.body)
				});
			});
		}
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach((s) => this.addDefaultSuggestion(s, collector));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach((s) => this.addDefaultSuggestion(s, collector));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach((s) => this.addDefaultSuggestion(s, collector));
		}
	}

	private getLabelForValue(value: any) : string {
		var label = JSON.stringify(value);
		label = label.replace('{{', '').replace('}}', '');
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getLabelForSnippetValue(value: any): string {
		let label = JSON.stringify(value);
		label = label.replace(/\{\{|\}\}/g, '');
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getTextForValue(value: any): string {
		var text = JSON.stringify(value, null, '\t');
		text = text.replace(/[\\\{\}]/g, '\\$&');
		return text;
	}

	private getTextForSnippetValue(value: any): string {
		return JSON.stringify(value, null, '\t');
	}

	private getTextForEnumValue(value: any) : string {
		var snippet = JSON.stringify(value, null, '\t');
		switch (typeof value) {
			case 'object':
				if (value === null) {
					return '{{null}}';
				}
				return snippet;
			case 'string':
				return '"{{' + snippet.substr(1, snippet.length - 2) + '}}"';
			case 'number':
			case 'integer':
			case 'boolean':
				return '{{' + snippet + '}}';
		}
		return snippet;
	}

	private getSuggestionType(type: any): string {
		if (Array.isArray(type)) {
			var array = <any[]> type;
			type = array.length > 0 ? array[0] : null;
		}
		if (!type) {
			return 'text';
		}
		switch (type) {
			case 'string': return 'text';
			case 'object': return 'module';
			case 'property': return 'property';
			default: return 'value';
		}
	}


	private getTextForMatchingNode(node: Parser.ASTNode, modelMirror: EditorCommon.IMirrorModel): string {
		switch (node.type) {
			case 'array':
				return '[]';
			case 'object':
				return '{}';
			default:
				var content = modelMirror.getValueInRange(modelMirror.getRangeFromOffsetAndLength(node.start, node.end - node.start));
				return content;
		}
	}

	private getTextForProperty(key: string, propertySchema: JsonSchema.IJSONSchema, addValue:boolean, isLast: boolean): string {

		let result = this.getTextForValue(key);
		if (!addValue) {
			return result;
		}
		result += ': ';

		var defaultVal = propertySchema.default;
		if (!Types.isUndefined(defaultVal)) {
			result = result + this.getTextForEnumValue(defaultVal);
		} else if (propertySchema.enum && propertySchema.enum.length > 0) {
			result = result + this.getTextForEnumValue(propertySchema.enum[0]);
		} else {
			switch (propertySchema.type) {
				case 'boolean':
					result += '{{false}}';
					break;
				case 'string':
					result += '"{{}}"';
					break;
				case 'object':
					result += '{\n\t{{}}\n}';
					break;
				case 'array':
					result += '[\n\t{{}}\n]';
					break;
				case 'number':
				case 'integer':
					result += '{{0}}';
					break;
				case 'null':
					result += '{{null}}';
					break;
				default:
					return result;
			}
		}
		if (!isLast) {
			result += ',';
		}
		return result;
	}

	private getTextForSimilarProperty(key: string, templateValue: Parser.ASTNode): string {
		return this.getTextForValue(key);
	}
}
