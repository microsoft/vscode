/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import nls = require('vs/nls');
import Objects = require('vs/base/common/objects');
import Json = require('vs/base/common/json');
import http = require('vs/base/common/http');
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import Strings = require('vs/base/common/strings');
import URI from 'vs/base/common/uri';
import Types = require('vs/base/common/types');
import Parser = require('vs/languages/json/common/parser/jsonParser');
import WinJS = require('vs/base/common/winjs.base');
import EditorCommon = require('vs/editor/common/editorCommon');
import EventEmitter = require('vs/base/common/eventEmitter');
import {IResourceService, ResourceEvents, IResourceChangedEvent} from 'vs/editor/common/services/resourceService';
import {IRequestService} from 'vs/platform/request/common/request';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ISchemaContributions} from 'vs/languages/json/common/jsonContributionRegistry';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';

'use strict';

export interface IJSONSchemaService {

	/**
	 * Registers a schema file in the current workspace to be applicable to files that match the pattern
	 */
	registerExternalSchema(uri:string, filePatterns?: string[], unresolvedSchema?: IJSONSchema):ISchemaHandle;

	/**
	 * Clears all cached schema files
	 */
	clearExternalSchemas():void;

	/**
	 * Registers contributed schemas
	 */
	setSchemaContributions(schemaContributions:ISchemaContributions):void;

	/**
	 * Looks up the appropriate schema for the given URI
	 */
	getSchemaForResource(resource:string, document: Parser.JSONDocument):WinJS.TPromise<ResolvedSchema>;
}

export interface ISchemaHandle {
	/**
	 * The schema id
	 */
	url: string;

	/**
	 * The schema from the file, with potential $ref references
	 */
	getUnresolvedSchema():WinJS.TPromise<UnresolvedSchema>;

	/**
	 * The schema from the file, with references resolved
	 */
	getResolvedSchema():WinJS.TPromise<ResolvedSchema>;
}


interface InlineReferencePointer {
	parent: any;
	key: any;
	value: any;
}

class FilePatternAssociation {

	private schemas: string[];
	private combinedSchemaId: string;
	private patternRegExp: RegExp;
	private combinedSchema: ISchemaHandle;

	constructor(pattern: string) {
		this.combinedSchemaId = 'local://combinedSchema/' + encodeURIComponent(pattern);
		try {
			this.patternRegExp = new RegExp(Strings.convertSimple2RegExpPattern(pattern) + '$');
		} catch (e) {
			// invalid pattern
			this.patternRegExp = null;
		}
		this.schemas = [];
		this.combinedSchema = null;
	}

	public addSchema(id: string) {
		this.schemas.push(id);
		this.combinedSchema = null;
	}

	public matchesPattern(fileName: string) : boolean {
		return this.patternRegExp && this.patternRegExp.test(fileName);
	}

	public getCombinedSchema(service: JSONSchemaService) : ISchemaHandle {
		if (!this.combinedSchema) {
			this.combinedSchema = service.createCombinedSchema(this.combinedSchemaId, this.schemas);
		}
		return this.combinedSchema;
	}
}

class SchemaHandle implements ISchemaHandle {

	public url: string;

	private resolvedSchema: WinJS.TPromise<ResolvedSchema>;
	private unresolvedSchema: WinJS.TPromise<UnresolvedSchema>;
	private service: JSONSchemaService;

	constructor(service: JSONSchemaService, url:string, unresolvedSchemaContent?: IJSONSchema) {
		this.service = service;
		this.url = url;
		if (unresolvedSchemaContent) {
			this.unresolvedSchema = WinJS.Promise.as(new UnresolvedSchema(unresolvedSchemaContent));
		}
	}

	public getUnresolvedSchema():WinJS.TPromise<UnresolvedSchema> {
		if (!this.unresolvedSchema) {
			this.unresolvedSchema = this.service.loadSchema(this.url);
		}
		return this.unresolvedSchema;
	}

	public getResolvedSchema():WinJS.TPromise<ResolvedSchema> {
		if (!this.resolvedSchema) {
			this.resolvedSchema = this.getUnresolvedSchema().then(unresolved => {
				return this.service.resolveSchemaContent(unresolved);
			});
		}
		return this.resolvedSchema;
	}

	public clearSchema() : void {
		this.resolvedSchema = null;
		this.unresolvedSchema = null;
	}
}

export class UnresolvedSchema {
	public schema: IJSONSchema;
	public errors: string[];

	constructor(schema: IJSONSchema, errors: string[] = []) {
		this.schema = schema;
		this.errors = errors;
	}
}

export class ResolvedSchema {
	public schema: IJSONSchema;
	public errors: string[];

	constructor(schema: IJSONSchema, errors: string[] = []) {
		this.schema = schema;
		this.errors = errors;
	}

	public getSection(path: string[]): IJSONSchema {
		return this.getSectionRecursive(path, this.schema);
	}

	private getSectionRecursive(path: string[], schema: IJSONSchema): IJSONSchema {
		if (!schema || path.length === 0) {
			return schema;
		}
		var next = path.shift();

		if (schema.properties && schema.properties[next]) {
			return this.getSectionRecursive(path, schema.properties[next]);
		} else if (Types.isObject(schema.patternProperties)) {
			Object.keys(schema.patternProperties).forEach((pattern) => {
				var regex = new RegExp(pattern);
				if (regex.test(next)) {
					return this.getSectionRecursive(path, schema.patternProperties[pattern]);
				}
			});
		} else if (Types.isObject(schema.additionalProperties)) {
			return this.getSectionRecursive(path, schema.additionalProperties);
		} else if (next.match('[0-9]+')) {
			if (Types.isObject(schema.items)) {
				return this.getSectionRecursive(path, schema.items);
			} else if (Array.isArray(schema.items)) {
				try {
					var index = parseInt(next, 10);
					if (schema.items[index]) {
						return this.getSectionRecursive(path, schema.items[index]);
					}
					return null;
				}
				catch (e) {
					return null;
				}
			}
		}

		return null;
	}
}

export class JSONSchemaService implements IJSONSchemaService {

	private contributionSchemas:{ [id:string]:SchemaHandle };
	private contributionAssociations:{ [id:string]:string[] };

	private preloadedSchemas:{ [id:string]:SchemaHandle };

	private schemasById: { [id:string]:SchemaHandle };
	private filePatternAssociations: FilePatternAssociation[];
	private filePatternAssociationById: { [id:string]: FilePatternAssociation };

	private requestService: IRequestService;
	private contextService : IWorkspaceContextService;
	private callOnDispose:Function[];
	private telemetryService: ITelemetryService;

	constructor(@IRequestService requestService: IRequestService,
		@ITelemetryService telemetryService?: ITelemetryService,
		@IWorkspaceContextService contextService?: IWorkspaceContextService,
		@IResourceService resourceService?: IResourceService) {
		this.requestService = requestService;
		this.contextService = contextService;
		this.telemetryService = telemetryService;
		this.callOnDispose = [];

		if (resourceService) {
			this.callOnDispose.push(resourceService.addListener_(ResourceEvents.CHANGED, (e: IResourceChangedEvent) => this.onResourceChange(e)));
		}

		this.contributionSchemas = {};
		this.contributionAssociations = {};
		this.preloadedSchemas = {};
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.filePatternAssociationById = {};
		this.addPreloadedFileSchemas();
	}

	public dispose(): void {
		while(this.callOnDispose.length > 0) {
			this.callOnDispose.pop()();
		}
	}

	private onResourceChange(e: IResourceChangedEvent): void {
		var url = e.url.toString();
		var schemaFile = this.schemasById[url];
		if (schemaFile) {
			schemaFile.clearSchema();
		}
	}

	private normalizeId(id: string) {
		if (id.length > 0 && id.charAt(id.length - 1) === '#') {
			return id.substring(0, id.length - 1);
		}
		return id;
	}

	public setSchemaContributions(schemaContributions: ISchemaContributions): void {
		if (schemaContributions.schemas) {
			var schemas = schemaContributions.schemas;
			for (let id in schemas) {
				id = this.normalizeId(id);
				this.contributionSchemas[id] = this.addSchemaHandle(id, schemas[id]);
			}
		}
		if (schemaContributions.schemaAssociations) {
			var schemaAssociations = schemaContributions.schemaAssociations;
			for (let pattern in schemaAssociations) {
				var associations = schemaAssociations[pattern];
				if (this.contextService) {
					let env = this.contextService.getConfiguration().env;
					if (env) {
						pattern = pattern.replace(/%APP_SETTINGS_HOME%/, URI.file(env.appSettingsHome).toString());
					}
				}
				this.contributionAssociations[pattern] = associations;

				var fpa = this.getOrAddFilePatternAssociation(pattern);
				associations.forEach(schemaId => fpa.addSchema(schemaId));
			}
		}
	}

	private addSchemaHandle(id:string, unresolvedSchemaContent?: IJSONSchema) : SchemaHandle {
		var schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
		this.schemasById[id] = schemaHandle;
		return schemaHandle;
	}

	private getOrAddSchemaHandle(id:string, unresolvedSchemaContent?: IJSONSchema) : ISchemaHandle {
		return this.schemasById[id] || this.addSchemaHandle(id, unresolvedSchemaContent);
	}

	private getOrAddFilePatternAssociation(pattern: string) {
		var fpa = this.filePatternAssociationById[pattern];
		if (!fpa) {
			fpa = new FilePatternAssociation(pattern);
			this.filePatternAssociationById[pattern] = fpa;
			this.filePatternAssociations.push(fpa);
		}
		return fpa;
	}

	public registerExternalSchema(uri:string, filePatterns: string[] = null, unresolvedSchemaContent?: IJSONSchema) : ISchemaHandle {
		var id = this.normalizeId(uri);

		if (filePatterns) {
			filePatterns.forEach(pattern => {
				this.getOrAddFilePatternAssociation(pattern).addSchema(uri);
			});
		}
		return unresolvedSchemaContent ? this.addSchemaHandle(id, unresolvedSchemaContent) : this.getOrAddSchemaHandle(id);
	}

	public clearExternalSchemas():void {
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.filePatternAssociationById = {};

		for (var id in this.preloadedSchemas) {
			this.schemasById[id] = this.preloadedSchemas[id];
		}
		for (var id in this.contributionSchemas) {
			this.schemasById[id] = this.contributionSchemas[id];
		}
		for (var pattern in this.contributionAssociations) {
			var fpa = this.getOrAddFilePatternAssociation(pattern);

			this.contributionAssociations[pattern].forEach(schemaId => fpa.addSchema(schemaId));
		}
	}

	public getResolvedSchema(schemaId:string): WinJS.TPromise<ResolvedSchema> {
		var id = this.normalizeId(schemaId);
		var schemaHandle = this.schemasById[id];
		if (schemaHandle) {
			return schemaHandle.getResolvedSchema();
		}
		return WinJS.TPromise.as(null);
	}

	public loadSchema(url:string) : WinJS.TPromise<UnresolvedSchema> {
		if (this.telemetryService && Strings.startsWith(url, 'https://schema.management.azure.com')) {
			this.telemetryService.publicLog('json.schema', {
				schemaURL: url
			});
		}

		return this.requestService.makeRequest({ url: url }).then(
			request => {
				var content = request.responseText;
				if (!content) {
					var errorMessage = nls.localize('json.schema.nocontent', 'Unable to load schema from \'{0}\': No content.', toDisplayString(url));
					return new UnresolvedSchema(<IJSONSchema> {}, [ errorMessage ]);
				}

				var schemaContent: IJSONSchema = {};
				var jsonErrors = [];
				schemaContent = Json.parse(content, errors);
				var errors = jsonErrors.length ? [ nls.localize('json.schema.invalidFormat', 'Unable to parse content from \'{0}\': {1}.', toDisplayString(url), jsonErrors[0])] : [];
				return new UnresolvedSchema(schemaContent, errors);
			},
			(error : http.IXHRResponse) => {
				var errorMessage = nls.localize('json.schema.unabletoload', 'Unable to load schema from \'{0}\': {1}', toDisplayString(url), error.responseText || http.getErrorStatusDescription(error.status) || error.toString());
				return new UnresolvedSchema(<IJSONSchema> {}, [ errorMessage ]);
			}
		);
	}

	public resolveSchemaContent(schemaToResolve: UnresolvedSchema): WinJS.TPromise<ResolvedSchema> {

		var resolveErrors : string[] = schemaToResolve.errors.slice(0);
		var schema = schemaToResolve.schema;

		var findSection = (schema: IJSONSchema, path: string): any => {
			if (!path) {
				return schema;
			}
			var current: any = schema;
			path.substr(1).split('/').some((part) => {
				current = current[part];
				return !current;
			});
			return current;
		};

		var resolveLink = (node: any, linkedSchema: IJSONSchema, linkPath: string): void => {
			var section = findSection(linkedSchema, linkPath);
			if (typeof section === 'object') {
				Objects.mixin(node, section, false);
			} else {
				resolveErrors.push(nls.localize('json.schema.invalidref', '$ref \'{0}\' in {1} can not be resolved.', linkPath, linkedSchema.id));
			}
			delete node.$ref;
		}

		var resolveExternalLink = (node: any, uri: string, linkPath: string): WinJS.Promise => {
			return this.getOrAddSchemaHandle(uri).getUnresolvedSchema().then(unresolvedSchema => {
				if (unresolvedSchema.errors.length) {
					var loc = linkPath ? uri + '#' + linkPath : uri;
					resolveErrors.push(nls.localize('json.schema.problemloadingref', 'Problems loading reference \'{0}\': {1}', loc, unresolvedSchema.errors[0]));
				}
				resolveLink(node, unresolvedSchema.schema, linkPath);
				return resolveRefs(node, unresolvedSchema.schema);
			});
		}

		var resolveRefs = (node:any, parentSchema: any) : WinJS.Promise => {
			var toWalk = [ node ];
			var seen: any[] = [];

			var openPromises: WinJS.Promise[] = [];

			while (toWalk.length) {
				var next = toWalk.pop();
				if (seen.indexOf(next) >= 0) {
					continue;
				}
				seen.push(next);
				if (Array.isArray(next)) {
					next.forEach(item => {
						toWalk.push(item);
					});
				} else if (Types.isObject(next)) {
					if (next.$ref) {
						var segments = next.$ref.split('#', 2);
						if (segments[0].length > 0) {
							openPromises.push(resolveExternalLink(next, segments[0], segments[1]));
							continue;
						} else {
							resolveLink(next, parentSchema, segments[1]);
						}
					}
					for (var key in next) {
						toWalk.push(next[key]);
					}
				}
			}
			return WinJS.Promise.join(openPromises);
		}

		return resolveRefs(schema, schema).then(_ => new ResolvedSchema(schema, resolveErrors));
	}

	public getSchemaForResource(resource: string, document: Parser.JSONDocument): WinJS.TPromise<ResolvedSchema> {

		// first use $schema if present
		if (document && document.root && document.root.type === 'object') {
			var schemaProperties = (<Parser.ObjectASTNode> document.root).properties.filter((p) => (p.key.value === '$schema') && !!p.value);
			if (schemaProperties.length > 0) {
				var schemeId = <string> schemaProperties[0].value.getValue();
				if (!Strings.startsWith(schemeId, 'http://') && !Strings.startsWith(schemeId, 'https://') && !Strings.startsWith(schemeId, 'file://')) {
					var resourceURL = this.contextService.toResource(schemeId);
					if (resourceURL) {
						schemeId = resourceURL.toString();
					}
				}
				if (schemeId) {
					var id = this.normalizeId(schemeId);
					return this.getOrAddSchemaHandle(id).getResolvedSchema();
				}
			}
		}

		// then check for matching file names, last to first
		for (var i= this.filePatternAssociations.length - 1; i >= 0 ; i--) {
			var entry = this.filePatternAssociations[i];
			if (entry.matchesPattern(resource)) {
				return entry.getCombinedSchema(this).getResolvedSchema();
			}
		}
		return WinJS.TPromise.as(null);
	}

	public createCombinedSchema(combinedSchemaId: string, schemaIds: string[]) : ISchemaHandle {
		if (schemaIds.length === 1) {
			return this.getOrAddSchemaHandle(schemaIds[0]);
		} else {
			var combinedSchema: IJSONSchema = {
				allOf: schemaIds.map(schemaId => ({ $ref: schemaId }))
			}
			return this.addSchemaHandle(combinedSchemaId, combinedSchema);
		}
	}

	public addPreloadedFileSchema(uri: string, schema : IJSONSchema): void {
		var id = this.normalizeId(uri);
		this.preloadedSchemas[id] = this.addSchemaHandle(id, schema);
	}

	private addPreloadedFileSchemas(): void {
		this.addPreloadedFileSchema('http://json-schema.org/draft-04/schema#', {
			'id': 'http://json-schema.org/draft-04/schema#',
			'title': nls.localize('schema.json', 'Describes a JSON file using a schema. See json-schema.org for more info.'),
			'$schema': 'http://json-schema.org/draft-04/schema#',
			'definitions': {
				'schemaArray': {
					'type': 'array',
					'minItems': 1,
					'items': { '$ref': '#' }
				},
				'positiveInteger': {
					'type': 'integer',
					'minimum': 0
				},
				'positiveIntegerDefault0': {
					'allOf': [{ '$ref': '#/definitions/positiveInteger' }, { 'default': 0 }]
				},
				'simpleTypes': {
					'type': 'string',
					'enum': ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']
				},
				'stringArray': {
					'type': 'array',
					'items': { 'type': 'string' },
					'minItems': 1,
					'uniqueItems': true
				}
			},
			'type': 'object',
			'properties': {
				'id': {
					'type': 'string',
					'format': 'uri',
					'description': nls.localize('schema.json.id', 'A unique identifier for the schema.')
				},
				'$schema': {
					'type': 'string',
					'format': 'uri',
					'description': nls.localize('schema.json.$schema', 'The schema to verify this document against ')
				},
				'title': {
					'type': 'string',
					'description': nls.localize('schema.json.title', 'A descriptive title of the element')
				},
				'description': {
					'type': 'string',
					'description': nls.localize('schema.json.description', 'A long description of the element. Used in hover menus and suggestions.')
				},
				'default': {
					'description': nls.localize('schema.json.default', 'A default value. Used by suggestions.')
				},
				'multipleOf': {
					'type': 'number',
					'minimum': 0,
					'exclusiveMinimum': true,
					'description': nls.localize('schema.json.multipleOf', 'A number that should cleanly divide the current value (i.e. have no remainder)')
				},
				'maximum': {
					'type': 'number',
					'description': nls.localize('schema.json.maximum', 'The maximum numerical value, inclusive by default.')
				},
				'exclusiveMaximum': {
					'type': 'boolean',
					'default': false,
					'description': nls.localize('schema.json.exclusiveMaximum', 'Makes the maximum property exclusive.')
				},
				'minimum': {
					'type': 'number',
					'description': nls.localize('schema.json.minimum', 'The minimum numerical value, inclusive by default.')
				},
				'exclusiveMinimum': {
					'type': 'boolean',
					'default': false,
					'description': nls.localize('schema.json.exclusiveMininum', 'Makes the minimum property exclusive.')
				},
				'maxLength': {
					'allOf': [
						{ '$ref': '#/definitions/positiveInteger' }
					],
					'description': nls.localize('schema.json.maxLength', 'The maximum length of a string.')
				},
				'minLength': {
					'allOf': [
						{ '$ref': '#/definitions/positiveIntegerDefault0' }
					],
					'description': nls.localize('schema.json.minLength', 'The minimum length of a string.')
				},
				'pattern': {
					'type': 'string',
					'format': 'regex',
					'description': nls.localize('schema.json.pattern', 'A regular expression to match the string against. It is not implicitly anchored.')
				},
				'additionalItems': {
					'anyOf': [
						{ 'type': 'boolean' },
						{ '$ref': '#' }
					],
					'default': {},
					'description': nls.localize('schema.json.additionalItems', 'For arrays, only when items is set as an array. If it is a schema, then this schema validates items after the ones specified by the items array. If it is false, then additional items will cause validation to fail.')
				},
				'items': {
					'anyOf': [
						{ '$ref': '#' },
						{ '$ref': '#/definitions/schemaArray' }
					],
					'default': {},
					'description': nls.localize('schema.json.items', 'For arrays. Can either be a schema to validate every element against or an array of schemas to validate each item against in order (the first schema will validate the first element, the second schema will validate the second element, and so on.')
				},
				'maxItems': {
					'allOf': [
						{ '$ref': '#/definitions/positiveInteger' }
					],
					'description': nls.localize('schema.json.maxItems', 'The maximum number of items that can be inside an array. Inclusive.')
				},
				'minItems': {
					'allOf': [
						{ '$ref': '#/definitions/positiveIntegerDefault0' }
					],
					'description': nls.localize('schema.json.minItems', 'The minimum number of items that can be inside an array. Inclusive.')
				},
				'uniqueItems': {
					'type': 'boolean',
					'default': false,
					'description': nls.localize('schema.json.uniqueItems', 'If all of the items in the array must be unique. Defaults to false.')
				},
				'maxProperties': {
					'allOf': [
						{ '$ref': '#/definitions/positiveInteger' }
					],
					'description': nls.localize('schema.json.maxProperties', 'The maximum number of properties an object can have. Inclusive.')
				},
				'minProperties': {
					'allOf': [
						{ '$ref': '#/definitions/positiveIntegerDefault0' },
					],
					'description': nls.localize('schema.json.minProperties', 'The minimum number of properties an object can have. Inclusive.')
				},
				'required': {
					'allOf': [
						{ '$ref': '#/definitions/stringArray' }
					],
					'description': nls.localize('schema.json.required', 'An array of strings that lists the names of all properties required on this object.')
				},
				'additionalProperties': {
					'anyOf': [
						{ 'type': 'boolean' },
						{ '$ref': '#' }
					],
					'default': {},
					'description': nls.localize('schema.json.additionalProperties', 'Either a schema or a boolean. If a schema, then used to validate all properties not matched by \'properties\' or \'patternProperties\'. If false, then any properties not matched by either will cause this schema to fail.')
				},
				'definitions': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {},
					'description': nls.localize('schema.json.definitions', 'Not used for validation. Place subschemas here that you wish to reference inline with $ref')
				},
				'properties': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {},
					'description': nls.localize('schema.json.properties', 'A map of property names to schemas for each property.')
				},
				'patternProperties': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {},
					'description': nls.localize('schema.json.patternProperties', 'A map of regular expressions on property names to schemas for matching properties.')
				},
				'dependencies': {
					'type': 'object',
					'additionalProperties': {
						'anyOf': [
							{ '$ref': '#' },
							{ '$ref': '#/definitions/stringArray' }
						]
					},
					'description': nls.localize('schema.json.dependencies', 'A map of property names to either an array of property names or a schema. An array of property names means the property named in the key depends on the properties in the array being present in the object in order to be valid. If the value is a schema, then the schema is only applied to the object if the property in the key exists on the object.')
				},
				'enum': {
					'type': 'array',
					'minItems': 1,
					'uniqueItems': true,
					'description': nls.localize('schema.json.enum', 'The set of literal values that are valid')
				},
				'type': {
					'anyOf': [
						{ '$ref': '#/definitions/simpleTypes' },
						{
							'type': 'array',
							'items': { '$ref': '#/definitions/simpleTypes' },
							'minItems': 1,
							'uniqueItems': true
						}
					],
					'description': nls.localize('schema.json.type', 'Either a string of one of the basic schema types (number, integer, null, array, object, boolean, string) or an array of strings specifying a subset of those types.')
				},
				'allOf': {
					'allOf': [
						{ '$ref': '#/definitions/schemaArray' }
					],
					'description': nls.localize('schema.json.allOf', 'An array of schemas, all of which must match.')
				},
				'anyOf': {
					'allOf': [
						{ '$ref': '#/definitions/schemaArray' }
					],
					'description': nls.localize('schema.json.anyOf', 'An array of schemas, where at least one must match.')
				},
				'oneOf': {
					'allOf': [
						{ '$ref': '#/definitions/schemaArray' }
					],
					'description': nls.localize('schema.json.oneOf', 'An array of schemas, exactly one of which must match.')
				},
				'not': {
					'allOf': [
						{ '$ref': '#' }
					],
					'description': nls.localize('schema.json.not', 'A schema which must not match.')
				}
			},
			'dependencies': {
				'exclusiveMaximum': ['maximum'],
				'exclusiveMinimum': ['minimum']
			},
			'default': {}
		});
		this.addPreloadedFileSchema('http://json.schemastore.org/project', {
			'title': nls.localize('project.json.title', 'JSON schema for ASP.NET project.json files'),
			'$schema': 'http://json-schema.org/draft-04/schema#',
			'id': 'http://json.schemastore.org/project',
			'type': 'object',

			'definitions': {
				'compilationOptions': {
					'description': nls.localize('project.json.compilationOptions', 'Compilation options that are passed through to Roslyn'),
					'type': 'object',
					'properties': {
						'define': {
							'type': 'array',
							'items': {
								'type': 'string',
								'uniqueItems': true
							}
						},
						'warningsAsErrors': {
							'type': 'boolean',
							'default': false
						},
						'allowUnsafe': {
							'type': 'boolean',
							'default': false
						},
						'optimize': {
							'type': 'boolean',
							'default': false
						},
						'languageVersion': {
							'type': 'string',
							'enum': ['csharp1', 'csharp2', 'csharp3', 'csharp4', 'csharp5', 'csharp6', 'experimental']
						}
					}
				},
				'configType': {
					'type': 'object',
					'properties': {
						'dependencies': { '$ref': '#/definitions/dependencies' },
						'compilationOptions': { '$ref': '#/definitions/compilationOptions' },
						'frameworkAssemblies': { '$ref': '#/definitions/dependencies' }
					}
				},
				'dependencies': {
					'type': 'object',
					'additionalProperties': {
						'type': ['string', 'object'],
						'properties': {
							'version': {
								'type': 'string',
								'description': nls.localize('project.json.dependency.name', 'The version of the dependency.')
							},
							'type': {
								'type': 'string',
								'default': 'default',
								'enum': ['default', 'build'],
								'description': nls.localize('project.json.dependency.type', 'The type of the dependency. \'build\' dependencies only exist at build time')
							}
						},
						'id': 'nugget-package'

					},
					'description': nls.localize('project.json.dependencies', 'The dependencies of the application. Each entry specifes the name and the version of a Nuget package.'),
					'id': 'nugget-packages'
				},
				'script': {
					'type': ['string', 'array'],
					'items': {
						'type': 'string'
					},
					'description': nls.localize('project.json.script', 'A command line script or scripts.\r\rAvailable variables:\r%project:Directory% - The project directory\r%project:Name% - The project name\r%project:Version% - The project version')
				}
			},

			'properties': {
				'authors': {
					'description': nls.localize('project.json.authors', 'The author of the application'),
					'type': 'array',
					'items': {
						'type': 'string',
						'uniqueItems': true
					}
				},
				'bundleExclude': {
					'description':  nls.localize('project.json.bundleExclude', 'List of files to exclude from publish output (kpm bundle).'),
					'type': [ 'string', 'array' ],
					'items': {
						'type': 'string'
					},
					'default': ''
				},
				'code': {
					'description': nls.localize('project.json.code', 'Glob pattern to specify all the code files that needs to be compiled. (data type: string or array with glob pattern(s)). Example: [ \'Folder1\\*.cs\', \'Folder2\\*.cs\' ]'),
					'type': ['string', 'array'],
					'items': {
						'type': 'string'
					},
					'default': '**\\*.cs'
				},
				'commands': {
					'description': nls.localize('project.json.commands', 'Commands that are available for this application'),
					'type': 'object',
					'additionalProperties': {
						'type': 'string'
					}
				},
				'compilationOptions': { '$ref': '#/definitions/compilationOptions' },
				'configurations': {
					'type': 'object',
					'description': nls.localize('project.json.configurations', 'Configurations are named groups of compilation settings. There are 2 defaults built into the runtime namely \'Debug\' and \'Release\'.'),
					'additionalProperties': {
						'type': 'object',
						'properties': {
							'compilationOptions': { '$ref': '#/definitions/compilationOptions' }
						}
					}
				},
				'dependencies': { '$ref': '#/definitions/dependencies' },
				'description': {
					'description': nls.localize('project.json.description', 'The description of the application'),
					'type': 'string'
				},
				'exclude': {
					'description': nls.localize('project.json.exclude', 'Glob pattern to indicate all the code files to be excluded from compilation. (data type: string or array with glob pattern(s)).'),
					'type': ['string', 'array'],
					'items': {
						'type': 'string'
					},
					'default': ['bin/**/*.*', 'obj/**/*.*']
				},
				'frameworks': {
					'description': nls.localize('project.json.frameworks', 'Target frameworks that will be built, and dependencies that are specific to the configuration.'),
					'type': 'object',
					'additionalProperties': { '$ref': '#/definitions/configType' }
				},
				'preprocess': {
					'description': nls.localize('project.json.preprocess', 'Glob pattern to indicate all the code files to be preprocessed. (data type: string with glob pattern).'),
					'type': 'string',
					'default': 'Compiler\\Preprocess\\**\\*.cs'
				},
				'resources': {
					'description': nls.localize('project.json.resources', 'Glob pattern to indicate all the files that need to be compiled as resources.'),
					'type': ['string', 'array'],
					'items': {
						'type': 'string'
					},
					'default': 'Compiler\\Resources\\**\\*.cs'
				},
				'scripts': {
					'type': 'object',
					'description': nls.localize('project.json.scripts', 'Scripts to execute during the various stages.'),
					'properties': {
						'prepack': { '$ref': '#/definitions/script' },
						'postpack': { '$ref': '#/definitions/script' },

						'prebundle': { '$ref': '#/definitions/script' },
						'postbundle': { '$ref': '#/definitions/script' },

						'prerestore': { '$ref': '#/definitions/script' },
						'postrestore': { '$ref': '#/definitions/script' },
						'prepare': { '$ref': '#/definitions/script' }
					}
				},
				'shared': {
					'description': nls.localize('project.json.shared', 'Glob pattern to specify the code files to share with dependent projects. Example: [ \'Folder1\\*.cs\', \'Folder2\\*.cs\' ]'),
					'type': ['string', 'array'],
					'items': {
						'type': 'string'
					},
					'default': 'Compiler\\Shared\\**\\*.cs'
				},
				'version': {
					'description': nls.localize('project.json.version', 'The version of the application. Example: 1.2.0.0'),
					'type': 'string'
				},
				'webroot': {
					'description': nls.localize('project.json.webroot', 'Specifying the webroot property in the project.json file specifies the web server root (aka public folder). In visual studio, this folder will be used to root IIS. Static files should be put in here.'),
					'type': 'string'
				}
			}

		});
		this.addPreloadedFileSchema('http://json.schemastore.org/bower', {

			'title': nls.localize('bower.json.title', 'JSON schema for Bower configuration files'),
			'$schema': 'http://json-schema.org/draft-04/schema#',
			'id': 'http://json.schemastore.org/bower',

			'type': 'object',
			'required': ['name'],

			'patternProperties': {
				'^_': {
					'description': nls.localize('bower.json.invalidPatternName', 'Any property starting with _ is valid.'),
					'additionalProperties': true,
					'additionalItems': true
				}
			},

			'properties': {
				'name': {
					'description': nls.localize('bower.json.packagename', 'The name of your package.'),
					'type': 'string',
					'maxLength': 50
				},
				'description': {
					'description': nls.localize('bower.json.description', 'Help users identify and search for your package with a brief description.'),
					'type': 'string'
				},
				'version': {
					'description': nls.localize('bower.json.version', 'A semantic version number.'),
					'type': 'string'
				},
				'main': {
					'description': nls.localize('bower.json.main', 'The primary acting files necessary to use your package.'),
					'type': ['string', 'array']
				},
				'license': {
					'description': nls.localize('bower.json.license', 'SPDX license identifier or path/url to a license.'),
					'type': ['string', 'array'],
					'maxLength': 140
				},
				'ignore': {
					'description': nls.localize('bower.json.ignore', 'A list of files for Bower to ignore when installing your package.'),
					'type': ['string', 'array']
				},
				'keywords': {
					'description': nls.localize('bower.json.keywords', 'Used for search by keyword. Helps make your package easier to discover without people needing to know its name.'),
					'type': 'array',
					'items': {
						'type': 'string',
						'maxLength': 50
					}
				},
				'authors': {
					'description': nls.localize('bower.json.authors', 'A list of people that authored the contents of the package.'),
					'type': 'array',
					'items': {
						'type': ['string', 'object']
					}
				},
				'homepage': {
					'description': nls.localize('bower.json.homepage', 'URL to learn more about the package. Falls back to GitHub project if not specified and it\'s a GitHub endpoint.'),
					'type': 'string'
				},
				'repository': {
					'description': nls.localize('bower.json.repository', 'The repository in which the source code can be found.'),
					'type': 'object',
					'properties': {
						'type': {
							'type': 'string',
							'enum': ['git']
						},
						'url': {
							'type': 'string'
						}
					}
				},
				'dependencies': {
					'id': 'bower-packages',
					'description': nls.localize('bower.json.dependencies', 'Dependencies are specified with a simple hash of package name to a semver compatible identifier or URL.'),
					'type': 'object',
					'additionalProperties': {
						'id': 'bower-package',
						'type': 'string'
					}
				},
				'devDependencies': {
					'id': 'bower-packages',
					'description': nls.localize('bower.json.devDependencies', 'Dependencies that are only needed for development of the package, e.g., test framework or building documentation.'),
					'type': 'object',
					'additionalProperties': {
						'id': 'bower-package',
						'type': 'string'
					}
				},
				'resolutions': {
					'description': nls.localize('bower.json.resolutions', 'Dependency versions to automatically resolve with if conflicts occur between packages.'),
					'type': 'object'
				},
				'private': {
					'description': nls.localize('bower.json.private', 'If you set it to  true  it will refuse to publish it. This is a way to prevent accidental publication of private repositories.'),
					'type': 'boolean'
				},
				'exportsOverride': {
					'description': nls.localize('bower.json.exportsOverride', 'Used by grunt-bower-task to specify custom install locations.'),
					'type': 'object',
					'additionalProperties': {
						'type': 'object',
						'additionalProperties': {
							'type': 'string'
						}
					}
				},
				'moduleType': {
					'description': nls.localize('bower.json.moduleType', 'The types of modules this package exposes'),
					'type': 'array',
					'items': {
						'enum': ['amd', 'es6', 'globals', 'node', 'yui']
					}
				}
			}
		});
		this.addPreloadedFileSchema('http://json.schemastore.org/package', {
			'id': 'http://json.schemastore.org/package',
			'description': nls.localize('package.json.description', 'NPM configuration for this package.'),
			'type': 'object',
			'required': ['name', 'version'],
			'definitions': {
				'person': {
					'description': nls.localize('package.json.person', 'A person who has been involved in creating or maintaining this package'),
					'type': [ 'object', 'string' ],
					'required': [ 'name' ],
					'properties': {
						'name': {
							'type': 'string'
						},
						'url': {
							'type': 'string',
							'format': 'uri'
						},
						'email': {
							'type': 'string',
							'format': 'email'
						}
					}
				},
				'dependency': {
					'id': 'npm-packages',
					'description': nls.localize('package.json.dependency', 'Dependencies are specified with a simple hash of package name to version range. The version range is a string which has one or more space-separated descriptors. Dependencies can also be identified with a tarball or git URL.'),
					'type': 'object',
					'additionalProperties': {
						'type': 'string'
					}
				}
			},

			'patternProperties': {
				'^_': {
					'description': nls.localize('package.json.underscore', 'Any property starting with _ is valid.'),
					'additionalProperties': true,
					'additionalItems': true
				}
			},

			'properties': {
				'name': {
					'description': nls.localize('package.json.name', 'The name of the package.'),
					'type': 'string'
				},
				'version': {
					'description': nls.localize('package.json.version', 'Version must be parseable by node-semver, which is bundled with npm as a dependency.'),
					'type': 'string'
				},
				'description': {
					'description': nls.localize('package.json.descr', 'This helps people discover your package, as it\'s listed in \'npm search\'.'),
					'type': 'string'
				},
				'icon': {
					'description': nls.localize('package.json.icon', 'The relative path to the icon of the package.'),
					'type': 'string'
				},
				'keywords': {
					'description': nls.localize('package.json.keywords', 'This helps people discover your package as it\'s listed in \'npm search\'.'),
					'type': 'array'
				},
				'homepage': {
					'description': nls.localize('package.json.homepage', 'The url to the project homepage.'),
					'type': 'string'
				},
				'bugs': {
					'description': nls.localize('package.json.bugs', 'The url to your project\'s issue tracker and / or the email address to which issues should be reported. These are helpful for people who encounter issues with your package.'),
					'type': [ 'object', 'string' ],
					'properties': {
						'url': {
							'type': 'string',
							'description': nls.localize('package.json.bugs.url', 'The url to your project\'s issue tracker.'),
							'format': 'uri'
						},
						'email': {
							'type': 'string',
							'description': nls.localize('package.json.bugs.email', 'The email address to which issues should be reported.')
						}
					}
				},
				'license': {
					'type': 'string',
					'description': nls.localize('package.json.license', 'You should specify a license for your package so that people know how they are permitted to use it, and any restrictions you\'re placing on it.')
				},
				'licenses': {
					'description': nls.localize('package.json.licenses', 'You should specify a license for your package so that people know how they are permitted to use it, and any restrictions you\'re placing on it.'),
					'type': 'array',
					'items': {
						'type': 'object',
						'properties': {
							'type': {
								'type': 'string'
							},
							'url': {
								'type': 'string',
								'format': 'uri'
							}
						}
					}
				},
				'author': {
					'$ref': '#/definitions/person'
				},
				'contributors': {
					'description': nls.localize('package.json.contributors', 'A list of people who contributed to this package.'),
					'type': 'array',
					'items': {
						'$ref': '#/definitions/person'
					}
				},
				'maintainers': {
					'description': nls.localize('package.json.maintainers', 'A list of people who maintains this package.'),
					'type': 'array',
					'items': {
						'$ref': '#/definitions/person'
					}
				},
				'files': {
					'description': nls.localize('package.json.files', 'The \'files\' field is an array of files to include in your project. If you name a folder in the array, then it will also include the files inside that folder.'),
					'type': 'array',
					'items': {
						'type': 'string'
					}
				},
				'main': {
					'description': nls.localize('package.json.main', 'The main field is a module ID that is the primary entry point to your program.'),
					'type': 'string'
				},
				'bin': {
					'type': [ 'string', 'object' ],
					'additionalProperties': {
						'type': 'string'
					}
				},
				'man': {
					'type': [ 'array', 'string' ],
					'description': nls.localize('package.json.man', 'Specify either a single file or an array of filenames to put in place for the man program to find.'),
					'items': {
						'type': 'string'
					}
				},
				'directories': {
					'type': 'object',
					'properties': {
						'bin': {
							'description': nls.localize('package.json.directories.bin', 'If you specify a \'bin\' directory, then all the files in that folder will be used as the \'bin\' hash.'),
							'type': 'string'
						},
						'doc': {
							'description': nls.localize('package.json.directories.doc', 'Put markdown files in here. Eventually, these will be displayed nicely, maybe, someday.'),
							'type': 'string'
						},
						'example': {
							'description': nls.localize('package.json.directories.example', 'Put example scripts in here. Someday, it might be exposed in some clever way.'),
							'type': 'string'
						},
						'lib': {
							'description': nls.localize('package.json.directories.lib', 'Tell people where the bulk of your library is. Nothing special is done with the lib folder in any way, but it\'s useful meta info.'),
							'type': 'string'
						},
						'man': {
							'description': nls.localize('package.json.directories.man', 'A folder that is full of man pages. Sugar to generate a \'man\' array by walking the folder.'),
							'type': 'string'
						},
						'test': {
							'type': 'string'
						}
					}
				},
				'repository': {
					'description': nls.localize('package.json.repository', 'Specify the place where your code lives. This is helpful for people who want to contribute.'),
					'type': 'object',
					'properties': {
						'type': {
							'type': 'string'
						},
						'url': {
							'type': 'string'
						}
					}
				},
				'scripts': {
					'description': nls.localize('package.json.scripts', 'The \'scripts\' member is an object hash of script commands that are run at various times in the lifecycle of your package. The key is the lifecycle event, and the value is the command to run at that point.'),
					'type': 'object',
					'additionalProperties': {
						'type': 'string'
					}
				},
				'config': {
					'description': nls.localize('package.json.config', 'A \'config\' hash can be used to set configuration parameters used in package scripts that persist across upgrades.'),
					'type': 'object',
					'additionalProperties': true
				},
				'dependencies': {
					'$ref': '#/definitions/dependency'
				},
				'devDependencies': {
					'$ref': '#/definitions/dependency'
				},
				'bundleDependencies': {
					'type': 'array',
					'description': nls.localize('package.json.bundleDependencies', 'Array of package names that will be bundled when publishing the package.'),
					'items': {
						'type': 'string'
					}
				},
				'bundledDependencies': {
					'type': 'array',
					'description': nls.localize('package.json.bundledDependencies', 'Array of package names that will be bundled when publishing the package.'),
					'items': {
						'type': 'string'
					}
				},
				'optionalDependencies': {
					'$ref': '#/definitions/dependency'
				},
				'peerDependencies': {
					'$ref': '#/definitions/dependency'
				},
				'engines': {
					'type': 'object',
					'additionalProperties': {
						'type': 'string'
					}
				},
				'engineStrict': {
					'type': 'boolean'
				},
				'os': {
					'type': 'array',
					'items': {
						'type': 'string'
					}
				},
				'cpu': {
					'type': 'array',
					'items': {
						'type': 'string'
					}
				},
				'preferGlobal': {
					'type': 'boolean',
					'description': nls.localize('package.json.preferGlobal', 'If your package is primarily a command-line application that should be installed globally, then set this value to true to provide a warning if it is installed locally.')
				},
				'private': {
					'type': 'boolean',
					'description': nls.localize('package.json.private', 'If set to true, then npm will refuse to publish it.')
				},
				'publishConfig': {
					'type': 'object',
					'additionalProperties': true
				},
				'dist': {
					'type': 'object',
					'properties': {
						'shasum': {
							'type': 'string'
						},
						'tarball': {
							'type': 'string'
						}
					}
				},
				'readme': {
					'type': 'string'
				}
			}
		});
		this.addPreloadedFileSchema('http://json.schemastore.org/global', {
				'title': nls.localize('global.json.title', 'JSON schema for the ASP.NET global configuration files'),
				'type': 'object',
				'additionalProperties': true,
				'required': [ 'projects' ],

				'properties': {
					'projects': {
						'type': 'array',
						'description': nls.localize('global.json.projects', 'A list of project folders relative to this file.'),
						'items': {
							'type': 'string'
						}
					},
					'sources': {
						'type': 'array',
						'description': nls.localize('global.json.sources', 'A list of source folders relative to this file.'),
						'items': {
							'type': 'string'
						}
					},
					'sdk': {
						'type': 'object',
						'description': nls.localize('global.json.sdk', 'The runtime to use.'),
						'properties': {
							'version': {
								'type': 'string',
								'description': nls.localize('global.json.sdk.version', 'The runtime version to use.')
							},
							'runtime': {
								'type': 'string',
								'description': nls.localize('global.json.sdk.runtime', 'The runtime to use, e.g. coreclr'),
							},
							'architecture': {
								'type': 'string',
								'description': nls.localize('global.json.sdk.architecture', 'The runtime architecture to use, e.g. x64.')
							}
						}
					}
				}
			}

		);
		this.addPreloadedFileSchema('http://json.schemastore.org/tsconfig', {
			'title': nls.localize('tsconfig.json.title', "JSON schema for the TypeScript compiler's configuration file"),
			'$schema': 'http://json-schema.org/draft-04/schema#',

			'type': 'object',
			'default': { 'compilerOptions': { 'target': 'ES5', 'module': 'commonjs'} },
			'properties': {
				'compilerOptions': {
					'type': 'object',
					'description': nls.localize('tsconfig.json.compilerOptions', 'Instructs the TypeScript compiler how to compile .ts files'),
					'properties': {
						'charset': {
							'description': nls.localize('tsconfig.json.compilerOptions.charset', 'The character set of the input files'),
							'type': 'string'
						},
						'declaration': {
							'description': nls.localize('tsconfig.json.compilerOptions.declaration', 'Generates corresponding d.ts files.'),
							'type': 'boolean'
						},
						'diagnostics': {
							'description': nls.localize('tsconfig.json.compilerOptions.diagnostics', 'Show diagnostic information.'),
							'type': 'boolean'
						},
						'emitBOM': {
							'description': nls.localize('tsconfig.json.compilerOptions.emitBOM', 'Emit a UTF-8 Byte Order Mark (BOM) in the beginning of output files.'),
							'type': 'boolean'
						},
						'inlineSourceMap': {
							'description': nls.localize('tsconfig.json.compilerOptions.inlineSourceMap', 'Emit a single file with source maps instead of having a separate file.'),
							'type': 'boolean'
						},
						'inlineSources': {
							'description': nls.localize('tsconfig.json.compilerOptions.inlineSources', 'Emit the source alongside the sourcemaps within a single file; requires --inlineSourceMap to be set.'),
							'type': 'boolean'
						},
						'listFiles': {
							'description': nls.localize('tsconfig.json.compilerOptions.listFiles', 'Print names of files part of the compilation.'),
							'type': 'boolean'
						},
						'locale': {
							'description': nls.localize('tsconfig.json.compilerOptions.locale', 'The locale to use to show error messages, e.g. en-us.'),
							'type': 'string'
						},
						'mapRoot': {
							'description': nls.localize('tsconfig.json.compilerOptions.mapRoot', 'Specifies the location where debugger should locate map files instead of generated locations'),
							'type': 'string',
							'format': 'uri'
						},
						'module': {
							'description': nls.localize('tsconfig.json.compilerOptions.module', "Specify module code generation: 'CommonJS', 'Amd', 'System', or 'UMD'."),
							'enum': ['commonjs', 'amd', 'umd', 'system']
						},
						'newLine': {
							'description': nls.localize('tsconfig.json.compilerOptions.newLine', "Specifies the end of line sequence to be used when emitting files: 'CRLF' (dos) or 'LF' (unix).)"),
							'enum': [ 'CRLF', 'LF' ]
						},
						'noEmit': {
							'description': nls.localize('tsconfig.json.compilerOptions.noEmit', 'Do not emit output.'),
							'type': 'boolean'
						},
						'noEmitOnError': {
							'description': nls.localize('tsconfig.json.compilerOptions.noEmitOnError', 'Do not emit outputs if any type checking errors were reported.'),
							'type': 'boolean'
						},
						'noEmitHelpers': {
							'description': nls.localize('tsconfig.json.compilerOptions.noEmitHelpers', 'Do not generate custom helper functions like __extends in compiled output.'),
							'type': 'boolean'
						},
						'noImplicitAny': {
							'description': nls.localize('tsconfig.json.compilerOptions.noImplicitAny', "Warn on expressions and declarations with an implied 'any' type."),
							'type': 'boolean'
						},
						'noLib': {
							'description': nls.localize('tsconfig.json.compilerOptions.noLib', "Do not include the default library file (lib.d.ts)."),
							'type': 'boolean'
						},
						'noResolve': {
							'description': nls.localize('tsconfig.json.compilerOptions.noResolve', "Do not add triple-slash references or module import targets to the list of compiled files."),
							'type': 'boolean'
						},
						'out': {
							'description': nls.localize('tsconfig.json.compilerOptions.out', 'Concatenate and emit output to single file.'),
							'type': 'string',
							'format': 'uri'
						},
						'outDir': {
							'description': nls.localize('tsconfig.json.compilerOptions.outDir', 'Redirect output structure to the directory.'),
							'type': 'string',
							'format': 'uri'
						},
						'preserveConstEnums': {
							'description': nls.localize('tsconfig.json.compilerOptions.preserveConstEnums', 'Do not erase const enum declarations in generated code.'),
							'type': 'boolean'
						},
						'removeComments': {
							'description': nls.localize('tsconfig.json.compilerOptions.removeComments', 'Do not emit comments to output.'),
							'type': 'boolean'
						},
						'rootDir': {
							'description': nls.localize('tsconfig.json.compilerOptions.rootDir', 'Specifies the root directory of input files. Use to control the output directory structure with --outDir.'),
							'type': 'string'
						},
						'sourceMap': {
							'description': nls.localize('tsconfig.json.compilerOptions.sourceMap', "Generates corresponding '.map' file."),
							'type': 'boolean'
						},
						'sourceRoot': {
							'description': nls.localize('tsconfig.json.compilerOptions.sourceRoot', 'Specifies the location where debugger should locate TypeScript files instead of source locations.'),
							'type': 'string',
							'format': 'uri'
						},
						'suppressImplicitAnyIndexErrors': {
							'description': nls.localize('tsconfig.json.compilerOptions.suppressImplicitAnyIndexErrors', 'Suppress noImplicitAny errors for indexing objects lacking index signatures.'),
							'type': 'boolean'
						},
						'target': {
							'description': nls.localize('tsconfig.json.compilerOptions.target', "Specify ECMAScript target version:  'ES3' (default), 'ES5', or 'ES6' (experimental)."),
							'enum': ['ES3', 'ES5', 'ES6', 'es3', 'es5', 'es6'],
							'default': 'ES3'
						},
						'watch': {
							'description': nls.localize('tsconfig.json.compilerOptions.watch', "Watch input files."),
							"type": 'boolean'
						},
						'jsx': {
							'description': nls.localize('tsconfig.json.compilerOptions.jsx', "Enable the JSX option (requires TypeScript 1.6):  'preserve', 'react'."),
							'enum': ['react', 'preserve'],
							'default': 'react'
						},
						'emitDecoratorMetadata': {
							'description': nls.localize('tsconfig.json.compilerOptions.emitDecoratorMetadata', 'Emits meta data.for ES7 decorators.'),
							'type': 'boolean'
						},
						'isolatedModules': {
							'description': nls.localize('tsconfig.json.compilerOptions.isolatedModules', 'Supports transpiling single TS files into JS files.'),
							'type': 'boolean'
						},
						'experimentalDecorators': {
							'description': nls.localize('tsconfig.json.compilerOptions.experimentalDecorators', 'Enables experimental support for ES7 decorators.'),
							'type': 'boolean'
						},
						'experimentalAsyncFunctions': {
							'description': nls.localize('tsconfig.json.compilerOptions.experimentalAsynFunctions', 'Enables experimental support for async functions (requires TypeScript 1.6).'),
							'type': 'boolean'
						}
					}
				},
				'files': {
					'type': 'array',
					'description': nls.localize('tsconfig.json.files', "If no 'files' property is present in a tsconfig.json, the compiler defaults to including all files the containing directory and subdirectories. When a 'files' property is specified, only those files are included."),
					'items': {
						'type': 'string',
						'format': 'uri'
					}
				}
			}
		});

		this.addPreloadedFileSchema('http://opentools.azurewebsites.net/jsconfig', {
			'title': nls.localize('jsconfig.json.title', "JSON schema for the JavaScript configuration file"),
			'type': 'object',
			'default': { 'compilerOptions': { 'target': 'ES5' } },
			'properties': {
				'compilerOptions': {
					'type': 'object',
					'description': nls.localize('jsconfig.json.compilerOptions', 'Instructs the JavaScript language service how to validate .js files'),
					'properties': {
						'charset': {
							'description': nls.localize('jsconfig.json.compilerOptions.charset', 'The character set of the input files'),
							'type': 'string'
						},
						'diagnostics': {
							'description': nls.localize('jsconfig.json.compilerOptions.diagnostics', 'Show diagnostic information.'),
							'type': 'boolean'
						},
						'locale': {
							'description': nls.localize('jsconfig.json.compilerOptions.locale', 'The locale to use to show error messages, e.g. en-us.'),
							'type': 'string'
						},
						'mapRoot': {
							'description': nls.localize('jsconfig.json.compilerOptions.mapRoot', 'Specifies the location where debugger should locate map files instead of generated locations'),
							'type': 'string',
							'format': 'uri'
						},
						'module': {
							'description': nls.localize('jsconfig.json.compilerOptions.module', "Module code generation to resolve against: 'commonjs', 'amd', 'system', or 'umd'."),
							'enum': ['commonjs', 'amd', 'system', 'umd']
						},
						'noLib': {
							'description': nls.localize('jsconfig.json.compilerOptions.noLib', "Do not include the default library file (lib.d.ts)."),
							'type': 'boolean'
						},
						'target': {
							'description': nls.localize('jsconfig.json.compilerOptions.target', "Specify ECMAScript target version:  'ES3' (default), 'ES5', or 'ES6' (experimental)."),
							'enum': ['ES3', 'ES5', 'ES6', 'es3', 'es5', 'es6'],
							'default': 'ES3'
						},
						'experimentalDecorators': {
							'description': nls.localize('jsconfig.json.compilerOptions.decorators', "Enables experimental support for ES7 decorators."),
							'type': 'boolean'
						}
					}
				},
				'files': {
					'type': 'array',
					'description': nls.localize('jsconfig.json.files', "If no 'files' property is present in a jsconfig.json, the language service defaults to including all files the containing directory and subdirectories. When a 'files' property is specified, only those files are included."),
					'items': {
						'type': 'string',
						'format': 'uri'
					}
				},
				'exclude': {
					'type': 'array',
					'description': nls.localize('jsconfig.json.exclude', "List files and folders that should not be included. This property is not honored when the 'files' property is present."),
					'items': {
						'type': 'string',
						'format': 'uri'
					}
				}
			}
		});
	}

}

function toDisplayString(url:string) {
	try {
		var uri = URI.parse(url);
		if (uri.scheme === 'file') {
			return uri.fsPath;
		}
	} catch (e) {
		// ignore
	}
	return url;
}