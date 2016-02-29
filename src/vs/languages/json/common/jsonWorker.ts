/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import EditorCommon = require('vs/editor/common/editorCommon');
import Modes = require('vs/editor/common/modes');
import HtmlContent = require('vs/base/common/htmlContent');
import Parser = require('./parser/jsonParser');
import JSONFormatter = require('vs/languages/json/common/features/jsonFormatter');
import SchemaService = require('./jsonSchemaService');
import JSONSchema = require('vs/base/common/jsonSchema');
import JSONIntellisense = require('./jsonIntellisense');
import WinJS = require('vs/base/common/winjs.base');
import Strings = require('vs/base/common/strings');
import ProjectJSONContribution = require('./contributions/projectJSONContribution');
import PackageJSONContribution = require('./contributions/packageJSONContribution');
import BowerJSONContribution = require('./contributions/bowerJSONContribution');
import GlobPatternContribution = require('./contributions/globPatternContribution');
import errors = require('vs/base/common/errors');
import {IMarkerService, IMarkerData} from 'vs/platform/markers/common/markers';
import {IRequestService} from 'vs/platform/request/common/request';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ISchemaContributions} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {JSONLocation} from './parser/jsonLocation';
import {filterSuggestions} from 'vs/editor/common/modes/supports/suggestSupport';
import {ValidationHelper} from 'vs/editor/common/worker/validationHelper';

export interface IOptionsSchema {
	/**
	 * HTTP schema URL or a relative path to schema file in workspace
	 */
	url: string;
	/**
	 * The patterns (e.g. *.pack.json) to map files to this schema
	 */
	fileMatch: string[];
	/**
	 * A unresolved schema definition. Optional, to avoid fetching from a URL.
	 */
	schema?: JSONSchema.IJSONSchema;

	/* deprecated */
	schemaPath: string;
	/* deprecated */
	filePattern: string;
}

export interface IOptions {
	schemas: IOptionsSchema[];
}

export interface ISuggestionsCollector {
	add(suggestion: Modes.ISuggestion): void;
	setAsIncomplete() : void;
	error(message:string): void;
}

export interface IJSONWorkerContribution {
	getInfoContribution(resource: URI, location: JSONLocation) : WinJS.TPromise<HtmlContent.IHTMLContentElement[]>;
	collectPropertySuggestions(resource: URI, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: ISuggestionsCollector) : WinJS.Promise;
	collectValueSuggestions(resource: URI, location: JSONLocation, propertyKey: string, result: ISuggestionsCollector): WinJS.Promise;
	collectDefaultSuggestions(resource: URI, result: ISuggestionsCollector): WinJS.Promise;
}

export class JSONWorker implements Modes.IExtraInfoSupport {

	private schemaService: SchemaService.IJSONSchemaService;
	private requestService: IRequestService;
	private contextService: IWorkspaceContextService;
	private jsonIntellisense : JSONIntellisense.JSONIntellisense;
	private contributions: IJSONWorkerContribution[];
	private _validationHelper: ValidationHelper;
	private resourceService:IResourceService;
	private markerService: IMarkerService;
	private _modeId: string;

	constructor(
		modeId: string,
		participants: Modes.IWorkerParticipant[],
		@IResourceService resourceService: IResourceService,
		@IMarkerService markerService: IMarkerService,
		@IRequestService requestService: IRequestService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IInstantiationService instantiationService: IInstantiationService
	) {

		this._modeId = modeId;
		this.resourceService = resourceService;
		this.markerService = markerService;

		this._validationHelper = new ValidationHelper(
			this.resourceService,
			this._modeId,
			(toValidate) => this.doValidate(toValidate)
		);

		this.requestService = requestService;
		this.contextService = contextService;
		this.schemaService = instantiationService.createInstance(SchemaService.JSONSchemaService);

		this.contributions = [
			instantiationService.createInstance(ProjectJSONContribution.ProjectJSONContribution),
			instantiationService.createInstance(PackageJSONContribution.PackageJSONContribution),
			instantiationService.createInstance(BowerJSONContribution.BowerJSONContribution),
			instantiationService.createInstance(GlobPatternContribution.GlobPatternContribution)
		];

		this.jsonIntellisense = new JSONIntellisense.JSONIntellisense(this.schemaService, this.requestService, this.contributions);
	}

	public navigateValueSet(resource:URI, range:EditorCommon.IRange, up:boolean):WinJS.TPromise<Modes.IInplaceReplaceSupportResult> {
		var modelMirror = this.resourceService.get(resource);
		var offset = modelMirror.getOffsetFromPosition({ lineNumber: range.startLineNumber, column: range.startColumn });

		var parser = new Parser.JSONParser();
		var config = new Parser.JSONDocumentConfig();
		config.ignoreDanglingComma = true;
		var doc = parser.parse(modelMirror.getValue(), config);
		var node = doc.getNodeFromOffsetEndInclusive(offset);

		if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
			return this.schemaService.getSchemaForResource(resource.toString(), doc).then((schema) => {
				if (schema) {
					var proposals : Modes.ISuggestion[] = [];
					var proposed: any = {};
					var collector = {
						add: (suggestion: Modes.ISuggestion) => {
							if (!proposed[suggestion.label]) {
								proposed[suggestion.label] = true;
								proposals.push(suggestion);
							}
						},
						setAsIncomplete: () => { /* ignore */ },
						error: (message: string) => {
							errors.onUnexpectedError(message);
						}
					};

					this.jsonIntellisense.getValueSuggestions(resource, schema, doc, node.parent, node.start, collector);

					var range = modelMirror.getRangeFromOffsetAndLength(node.start, node.end - node.start);
					var text = modelMirror.getValueInRange(range);
					for (var i = 0, len = proposals.length; i < len; i++) {
						if (Strings.equalsIgnoreCase(proposals[i].label, text)) {
							var nextIdx = i;
							if (up) {
								nextIdx = (i + 1) % len;
							} else {
								nextIdx =  i - 1;
								if (nextIdx < 0) {
									nextIdx = len - 1;
								}
							}
							return {
								value: proposals[nextIdx].label,
								range: range
							};
						}
					}
					return null;
				}
			});
		}
		return null;
	}

	/**
	 * @return true if you want to revalidate your models
	 */
	_doConfigure(options:IOptions): WinJS.TPromise<void> {
		if (options && options.schemas) {
			this.schemaService.clearExternalSchemas();
			options.schemas.forEach((schema) => {
				if (schema.url && (schema.fileMatch || schema.schema)) {
					var url = schema.url;
					if (!Strings.startsWith(url, 'http://') && !Strings.startsWith(url, 'https://') && !Strings.startsWith(url, 'file://')) {
						var resourceURL = this.contextService.toResource(url);
						if (resourceURL) {
							url = resourceURL.toString();
						}
					}
					if (url) {
						this.schemaService.registerExternalSchema(url, schema.fileMatch, schema.schema);
					}
				} else if (schema.filePattern && schema.schemaPath) {
					var url = this.contextService.toResource(schema.schemaPath).toString();
					var patterns = schema.filePattern ? [ schema.filePattern ] : [];
					this.schemaService.registerExternalSchema(url, patterns);
				}
			});
		}
		this._validationHelper.triggerDueToConfigurationChange();

		return WinJS.TPromise.as(void 0);
	}

	public setSchemaContributions(contributions:ISchemaContributions): WinJS.TPromise<boolean> {
		this.schemaService.setSchemaContributions(contributions);
		return WinJS.TPromise.as(true);
	}

	public enableValidator(): WinJS.TPromise<void> {
		this._validationHelper.enable();
		return WinJS.TPromise.as(null);
	}

	public doValidate(resources: URI[]):void {
		for (var i = 0; i < resources.length; i++) {
			this.doValidate1(resources[i]);
		}
	}

	private doValidate1(resource: URI):void {
		var modelMirror = this.resourceService.get(resource);
		var parser = new Parser.JSONParser();
		var content = modelMirror.getValue();

		if (content.length === 0) {
			// ignore empty content, no marker can be set anyway
			return;
		}
		var result = parser.parse(content);
		this.schemaService.getSchemaForResource(resource.toString(), result).then((schema) => {
			if (schema) {
				if (schema.errors.length && result.root) {
					var property = result.root.type === 'object' ? (<Parser.ObjectASTNode> result.root).getFirstProperty('$schema') : null;
					if (property) {
						var node = property.value || property;
						result.warnings.push({ location: { start: node.start, end: node.end }, message: schema.errors[0] });
					} else {
						result.warnings.push({ location: { start: result.root.start, end: result.root.start + 1 }, message: schema.errors[0] });
					}
				} else {
					result.validate(schema.schema);
				}
			}
			var added : { [signature:string]: boolean} = {};
			var markerData: IMarkerData[] = [];

			result.errors.concat(result.warnings).forEach((error, idx) => {
				// remove duplicated messages
				var signature = error.location.start + ' ' + error.location.end + ' ' + error.message;
				if (!added[signature]) {
					added[signature] = true;
					var startPosition = modelMirror.getPositionFromOffset(error.location.start);
					var endPosition = modelMirror.getPositionFromOffset(error.location.end);
					markerData.push({
						message: error.message,
						severity: idx >= result.errors.length ? Severity.Warning : Severity.Error,
						startLineNumber: startPosition.lineNumber,
						startColumn: startPosition.column,
						endLineNumber: endPosition.lineNumber,
						endColumn: endPosition.column
					});
				}
			});

			this.markerService.changeOne(this._modeId, resource, markerData);
		});

	}

	public suggest(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ISuggestResult[]> {
		return this.doSuggest(resource, position).then(value => filterSuggestions(value));
	}

	private doSuggest(resource:URI, position:EditorCommon.IPosition):WinJS.TPromise<Modes.ISuggestResult> {
		var modelMirror = this.resourceService.get(resource);

		return this.jsonIntellisense.doSuggest(resource, modelMirror, position);
	}

	public computeInfo(resource:URI, position:EditorCommon.IPosition): WinJS.TPromise<Modes.IComputeExtraInfoResult> {

		var modelMirror = this.resourceService.get(resource);

		var parser = new Parser.JSONParser();
		var doc = parser.parse(modelMirror.getValue());

		var offset = modelMirror.getOffsetFromPosition(position);
		var node = doc.getNodeFromOffset(offset);
		var originalNode = node;

		// use the property description when hovering over an object key
		if (node && node.type === 'string') {
			var stringNode = <Parser.StringASTNode>node;
			if (stringNode.isKey) {
				var propertyNode = <Parser.PropertyASTNode>node.parent;
				node = propertyNode.value;

			}
		}

		if (!node) {
			return WinJS.TPromise.as(null);
		}

		return this.schemaService.getSchemaForResource(resource.toString(), doc).then((schema) => {
			if (schema) {
				var matchingSchemas : Parser.IApplicableSchema[] = [];
				doc.validate(schema.schema, matchingSchemas, node.start);

				var description: string = null;
				var contributonId: string = null;
				matchingSchemas.every((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						description = description || s.schema.description;
						contributonId = contributonId || s.schema.id;
					}
					return true;
				});

				var location = node.getNodeLocation();
				for (var i= this.contributions.length -1; i >= 0; i--) {
					var contribution = this.contributions[i];
					var promise = contribution.getInfoContribution(resource, location);
					if (promise) {
						return promise.then((htmlContent) => { return this.createInfoResult(htmlContent, originalNode, modelMirror); } );
					}
				}

				if (description) {
					var htmlContent = [ {className: 'documentation', text: description } ];
					return this.createInfoResult(htmlContent, originalNode, modelMirror);
				}
			}
			return null;
		});
	}

	private createInfoResult(htmlContent : HtmlContent.IHTMLContentElement[], node: Parser.ASTNode, modelMirror: EditorCommon.IMirrorModel) : Modes.IComputeExtraInfoResult {
		var range = modelMirror.getRangeFromOffsetAndLength(node.start, node.end - node.start);

		var result:Modes.IComputeExtraInfoResult = {
			value: '',
			htmlContent: htmlContent,
			className: 'typeInfo json',
			range: range
		};
		return result;
	}


	public getOutline(resource:URI):WinJS.TPromise<Modes.IOutlineEntry[]> {
		var modelMirror = this.resourceService.get(resource);

		var parser = new Parser.JSONParser();
		var doc = parser.parse(modelMirror.getValue());
		var root = doc.root;
		if (!root) {
			return WinJS.TPromise.as(null);
		}

		// special handling for key bindings
		var resourceString = resource.toString();
		if ((resourceString === 'vscode://defaultsettings/keybindings.json') || Strings.endsWith(resourceString.toLowerCase(), '/user/keybindings.json')) {
			if (root.type === 'array') {
				var result : Modes.IOutlineEntry[] = [];
				(<Parser.ArrayASTNode> root).items.forEach((item) => {
					if (item.type === 'object') {
						var property = (<Parser.ObjectASTNode> item).getFirstProperty('key');
						if (property && property.value) {
							var range = modelMirror.getRangeFromOffsetAndLength(item.start, item.end - item.start);
							result.push({ label: property.value.getValue(), icon: 'function', type: 'string', range: range, children: []});
						}
					}
				});
				return WinJS.TPromise.as(result);
			}
		}

		function collectOutlineEntries(result: Modes.IOutlineEntry[], node: Parser.ASTNode): Modes.IOutlineEntry[] {
			if (node.type === 'array') {
				(<Parser.ArrayASTNode>node).items.forEach((node:Parser.ASTNode) => {
					collectOutlineEntries(result, node);
				});
			} else if (node.type === 'object') {
				var objectNode = <Parser.ObjectASTNode>node;

				objectNode.properties.forEach((property:Parser.PropertyASTNode) => {
					var range = modelMirror.getRangeFromOffsetAndLength(property.start, property.end - property.start);
					var valueNode = property.value;
					if (valueNode) {
						var children = collectOutlineEntries([], valueNode);
						var icon = valueNode.type === 'object' ? 'module' : valueNode.type;
						result.push({ label: property.key.getValue(), icon: icon, type: valueNode.type, range: range, children: children});
					}
				});
			}
			return result;
		}
		var result = collectOutlineEntries([], root);
		return WinJS.TPromise.as(result);
	}

	public format(resource: URI, range: EditorCommon.IRange, options: Modes.IFormattingOptions): WinJS.TPromise<EditorCommon.ISingleEditOperation[]> {
		var model = this.resourceService.get(resource);
		return WinJS.TPromise.as(JSONFormatter.format(model, range, options));
	}
}
