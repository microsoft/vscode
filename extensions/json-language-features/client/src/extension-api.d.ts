/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Uri, TextDocument, Disposable } from 'vscode';

/**
 * This interface describes the shape for the json language features extension
 * API. It includes functions to register schema association providers and
 * providers for custom uri schemas whose are used to request json schemas. To
 * acquire this API use the default mechanics, e.g:
 *
 * ```ts
 * // get json language features extension API
 * const api = await vscode.extensions.getExtension<JsonApi>('vscode.json-language-features').activate();
 * ```
 */
export interface JsonApi {
	/**
	 * Register a provider to associate a json schema with a requested
	 * `TextDocument`.
	 *
	 * @param provider The schema association provider.
	 * @return A disposable that unregisters the provider.
	 */
	registerSchemaAssociationProvider(provider: SchemaAssociationProvider): Disposable;

	/**
	 * Notify the language server that the schema association has changed for a
	 * given uri, or multiple uris.
	 *
	 * @param uri The uri of the document whose schema association has changed.
	 * @return `true` if any of the provided document uris were registered.
	 */
	schemaAssociationChanged(uri: Uri | Uri[]): boolean;

	/**
	 * Register a provider to handle json schema requests for a specific uri
	 * schema.
	 *
	 * @param schema The uri schema to register for.
	 * @param provider The provider to handle the schema request.
	 * @return A disposable that unregisters the provider.
	 */
	registerUriSchemaProvider(schema: string, provider: UriSchemaProvider): Disposable;

	/**
	 * Notify the language server that the content of a specific schema, or
	 * multiple schemas has changed.
	 *
	 * @param uri The uri of the schema whose content has changed.
	 * @return `true` if any of the provided schema uris were registered.
	 */
	schemaContentChanged(uri: Uri | Uri[]): boolean;
}

export interface SchemaAssociationProvider {
	/**
	 * Provide a `Uri` to a schema that should be used for the given `TextDocument`.
	 *
	 * @param document The document for which the schema association is requested.
	 */
	provideSchemaAssociation(document: TextDocument): Uri | null | undefined;

	/**
	 * Optional dispose function which is invoked when the json language
	 * features are deactivated.
	 */
	dispose?(): any;
}

export interface UriSchemaProvider {
	/**
	 * Provide the content of the schema for the given uri.
	 *
	 * @param uri The uri of the schema to provide.
	 */
	provideSchemaContent(uri: Uri): string;

	/**
	 * Optional dispose function which is invoked when the json language
	 * features are deactivated.
	 */
	dispose?(): any
}
