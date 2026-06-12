/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A single enterprise-managed marketplace entry, preserving the marketplace
 * name (used as `displayLabel`) and the original `source` discriminator.
 */
export type IExtraKnownMarketplaceEntry =
	| { readonly name: string; readonly source: { readonly source: 'github'; readonly repo: string; readonly ref?: string } }
	| { readonly name: string; readonly source: { readonly source: 'git'; readonly url: string; readonly ref?: string } };
