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
import {IResourceService, ResourceEvents, IResourceChangedEvent} from 'vs/editor/common/services/resourceService';
import {IRequestService} from 'vs/platform/request/common/request';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ISchemaContributions} from 'vs/platform/jsonschemas/common/jsonContributionRegistry';
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
			this.unresolvedSchema = WinJS.TPromise.as(new UnresolvedSchema(unresolvedSchemaContent));
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
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.filePatternAssociationById = {};
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
				associations.forEach(schemaId => {
					var id = this.normalizeId(schemaId);
					fpa.addSchema(id);
				});
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

		for (var id in this.contributionSchemas) {
			this.schemasById[id] = this.contributionSchemas[id];
		}
		for (var pattern in this.contributionAssociations) {
			var fpa = this.getOrAddFilePatternAssociation(pattern);

			this.contributionAssociations[pattern].forEach(schemaId => {
				var id = this.normalizeId(schemaId);
				fpa.addSchema(id);
			});
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
		};

		var resolveExternalLink = (node: any, uri: string, linkPath: string): WinJS.Promise => {
			return this.getOrAddSchemaHandle(uri).getUnresolvedSchema().then(unresolvedSchema => {
				if (unresolvedSchema.errors.length) {
					var loc = linkPath ? uri + '#' + linkPath : uri;
					resolveErrors.push(nls.localize('json.schema.problemloadingref', 'Problems loading reference \'{0}\': {1}', loc, unresolvedSchema.errors[0]));
				}
				resolveLink(node, unresolvedSchema.schema, linkPath);
				return resolveRefs(node, unresolvedSchema.schema);
			});
		};

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
		};

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
			};
			return this.addSchemaHandle(combinedSchemaId, combinedSchema);
		}
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