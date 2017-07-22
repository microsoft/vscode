/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IJSONSchema } from 'vs/base/common/jsonSchema';
import platform = require('vs/platform/registry/common/platform');
import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable } from 'vs/base/common/lifecycle';

export const Extensions = {
	JSONContribution: 'base.contributions.json'
};

export interface ISchemaContributions {
	schemas?: { [id: string]: IJSONSchema };
}

export interface IJSONContributionRegistry {

	/**
	 * Register a schema to the registry.
	 */
	registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema): void;

	/**
	 * Get all schemas
	 */
	getSchemaContributions(): ISchemaContributions;

	/**
	 * Adds a change listener
	 */
	addRegistryChangedListener(callback: (e: IJSONContributionRegistryEvent) => void): IDisposable;

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
	private schemasById: { [id: string]: IJSONSchema };
	private eventEmitter: EventEmitter;

	constructor() {
		this.schemasById = {};
		this.eventEmitter = new EventEmitter();
	}

	public addRegistryChangedListener(callback: (e: IJSONContributionRegistryEvent) => void): IDisposable {
		return this.eventEmitter.addListener('registryChanged', callback);
	}

	public registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema): void {
		this.schemasById[normalizeId(uri)] = unresolvedSchemaContent;
		this.eventEmitter.emit('registryChanged', {});
	}

	public getSchemaContributions(): ISchemaContributions {
		return {
			schemas: this.schemasById,
		};
	}

}

const jsonContributionRegistry = new JSONContributionRegistry();
platform.Registry.add(Extensions.JSONContribution, jsonContributionRegistry);