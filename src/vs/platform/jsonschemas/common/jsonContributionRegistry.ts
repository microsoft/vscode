/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { getCompressedContent, IJSONSchema } from '../../../base/common/jsonSchema.js';
import * as platform from '../../registry/common/platform.js';

export const Extensions = {
	JSONContribution: 'base.contributions.json'
};

export interface ISchemaContributions {
	schemas: { [id: string]: IJSONSchema };
}

export interface IJSONContributionRegistry {

	readonly onDidChangeSchema: Event<string>;

	/**
	 * Register a schema to the registry.
	 */
	registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema): void;


	/**
	 * Notifies all listeners that the content of the given schema has changed.
	 * @param uri The id of the schema
	 */
	notifySchemaChanged(uri: string): void;

	/**
	 * Get all schemas
	 */
	getSchemaContributions(): ISchemaContributions;

	/**
	 * Gets the (compressed) content of the schema with the given schema ID (if any)
	 * @param uri The id of the schema
	 */
	getSchemaContent(uri: string): string | undefined;

	/**
	 * Returns true if there's a schema that matches the given schema ID
	 * @param uri The id of the schema
	 */
	hasSchemaContent(uri: string): boolean;
}



function normalizeId(id: string) {
	if (id.length > 0 && id.charAt(id.length - 1) === '#') {
		return id.substring(0, id.length - 1);
	}
	return id;
}



class JSONContributionRegistry implements IJSONContributionRegistry {

	private schemasById: { [id: string]: IJSONSchema };

	private readonly _onDidChangeSchema = new Emitter<string>();
	readonly onDidChangeSchema: Event<string> = this._onDidChangeSchema.event;

	constructor() {
		this.schemasById = {};
	}

	public registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema): void {
		this.schemasById[normalizeId(uri)] = unresolvedSchemaContent;
		this._onDidChangeSchema.fire(uri);
	}

	public notifySchemaChanged(uri: string): void {
		this._onDidChangeSchema.fire(uri);
	}

	public getSchemaContributions(): ISchemaContributions {
		return {
			schemas: this.schemasById,
		};
	}

	public getSchemaContent(uri: string): string | undefined {
		const schema = this.schemasById[uri];
		return schema ? getCompressedContent(schema) : undefined;
	}

	public hasSchemaContent(uri: string): boolean {
		return !!this.schemasById[uri];
	}

}

const jsonContributionRegistry = new JSONContributionRegistry();
platform.Registry.add(Extensions.JSONContribution, jsonContributionRegistry);
