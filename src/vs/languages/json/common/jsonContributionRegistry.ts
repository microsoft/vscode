/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import {IJSONSchema} from 'vs/base/common/jsonSchema';
import platform = require('vs/platform/platform');
import {IPluginDescription} from 'vs/platform/plugins/common/plugins';
import {PluginsRegistry} from 'vs/platform/plugins/common/pluginsRegistry';
import {IEventEmitter, EventEmitter} from 'vs/base/common/eventEmitter';
import {IDisposable} from 'vs/base/common/lifecycle';

export var Extensions = {
	JSONContribution: 'base.contributions.json'
};

export interface ISchemaContributions {
	schemas?: { [id:string]: IJSONSchema };
	schemaAssociations?: { [pattern:string]: string[] };
}

export interface IJSONContributionRegistry {

	/**
	 * Register a schema to the registry.
	 */
	registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema): void;

	/**
	 * Register a schema association
	 */
	addSchemaFileAssociation(pattern: string, uri:string): void;

	/**
	 * Get all schemas
	 */
	getSchemaContributions() : ISchemaContributions;

	/**
	 * Adds a change listener
	 */
	addRegistryChangedListener(callback: (e: IJSONContributionRegistryEvent) => void) : IDisposable;

}

export interface IJSONContributionRegistryEvent {

}

function normalizeId(id: string) {
	if (id.length > 0 && id.charAt(id.length - 1) === '#') {
		return id.substring(0, id.length - 1);
	}
	return id;
}



class JSONContributionRegistry implements IJSONContributionRegistry {
	private schemasById: { [id:string]:IJSONSchema };
	private schemaAssociations: { [pattern:string]:string[] };
	private eventEmitter: IEventEmitter;

	constructor() {
		this.schemasById = {};
		this.schemaAssociations = {};
		this.eventEmitter = new EventEmitter();
	}

	public addRegistryChangedListener(callback: (e: IJSONContributionRegistryEvent) => void) : IDisposable {
		return this.eventEmitter.addListener2('registryChanged', callback);
	}

	public registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema): void {
		this.schemasById[normalizeId(uri)] = unresolvedSchemaContent;
		this.eventEmitter.emit('registryChanged', {});
	}

	public addSchemaFileAssociation(pattern: string, uri:string): void {
		var uris = this.schemaAssociations[pattern];
		if(!uris) {
			uris = [];
			this.schemaAssociations[pattern] = uris;
		}
		uris.push(uri);
		this.eventEmitter.emit('registryChanged', {});
	}

	public getSchemaContributions() : ISchemaContributions {
		return {
			schemas: this.schemasById,
			schemaAssociations: this.schemaAssociations
		}
	}

}

var jsonContributionRegistry = new JSONContributionRegistry();
platform.Registry.add(Extensions.JSONContribution, jsonContributionRegistry);
