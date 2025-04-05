/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { getCompressedContent, IJSONSchema } from '../../../base/common/jsonSchema.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import * as platform from '../../registry/common/platform.js';

export const Extensions = {
	JSONContribution: 'base.contributions.json'
};

export interface ISchemaContributions {
	schemas: { [id: string]: IJSONSchema };
}

export interface IJSONContributionRegistry {

	readonly onDidChangeSchema: Event<string>;
	readonly onDidChangeSchemaAssociations: Event<void>;

	/**
	 * Register a schema to the registry.
	 */
	registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema, store?: DisposableStore): void;

	registerSchemaAssociation(uri: string, glob: string): IDisposable;

	/**
	 * Notifies all listeners that the content of the given schema has changed.
	 * @param uri The id of the schema
	 */
	notifySchemaChanged(uri: string): void;

	/**
	 * Get all schemas
	 */
	getSchemaContributions(): ISchemaContributions;

	getSchemaAssociations(): { [uri: string]: string[] };

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

	private readonly schemasById: { [id: string]: IJSONSchema } = {};
	private readonly schemaAssociations: { [uri: string]: string[] } = {};

	private readonly _onDidChangeSchema = new Emitter<string>();
	readonly onDidChangeSchema: Event<string> = this._onDidChangeSchema.event;

	private readonly _onDidChangeSchemaAssociations = new Emitter<void>();
	readonly onDidChangeSchemaAssociations: Event<void> = this._onDidChangeSchemaAssociations.event;

	public registerSchema(uri: string, unresolvedSchemaContent: IJSONSchema, store?: DisposableStore): void {
		const normalizedUri = normalizeId(uri);
		this.schemasById[normalizedUri] = unresolvedSchemaContent;
		this._onDidChangeSchema.fire(uri);

		if (store) {
			store.add(toDisposable(() => {
				delete this.schemasById[normalizedUri];
				this._onDidChangeSchema.fire(uri);
			}));
		}
	}

	public registerSchemaAssociation(uri: string, glob: string): IDisposable {
		const normalizedUri = normalizeId(uri);
		if (!this.schemaAssociations[normalizedUri]) {
			this.schemaAssociations[normalizedUri] = [];
		}
		if (!this.schemaAssociations[normalizedUri].includes(glob)) {
			this.schemaAssociations[normalizedUri].push(glob);
			this._onDidChangeSchemaAssociations.fire();
		}

		return toDisposable(() => {
			const associations = this.schemaAssociations[normalizedUri];
			if (associations) {
				const index = associations.indexOf(glob);
				if (index !== -1) {
					associations.splice(index, 1);
					if (associations.length === 0) {
						delete this.schemaAssociations[normalizedUri];
					}
					this._onDidChangeSchemaAssociations.fire();
				}
			}
		});
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

	public getSchemaAssociations(): { [uri: string]: string[] } {
		return this.schemaAssociations;
	}

}

const jsonContributionRegistry = new JSONContributionRegistry();
platform.Registry.add(Extensions.JSONContribution, jsonContributionRegistry);
