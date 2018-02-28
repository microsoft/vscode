/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocumentIdentifier } from 'vscode-languageserver-types';
import { RequestType, TextDocumentRegistrationOptions, StaticRegistrationOptions } from 'vscode-languageserver-protocol';

// ---- capabilities

export interface FoldingProviderClientCapabilities {
	/**
	 * The text document client capabilities
	 */
	textDocument?: {
		/**
		 * Capabilities specific to the foldingProvider
		 */
		foldingProvider?: {
			/**
			 * Whether implementation supports dynamic registration. If this is set to `true`
			 * the client supports the new `(FoldingProviderOptions & TextDocumentRegistrationOptions & StaticRegistrationOptions)`
			 * return value for the corresponding server capability as well.
			 */
			dynamicRegistration?: boolean;
		};
	};
}

export interface FoldingProviderOptions {
}

export interface FoldingProviderServerCapabilities {
	/**
	 * The server provides folding provider support.
	 */
	foldingProvider?: FoldingProviderOptions | (FoldingProviderOptions & TextDocumentRegistrationOptions & StaticRegistrationOptions);
}

export interface FoldingRangeList {
	/**
	 * The folding ranges.
	 */
	ranges: FoldingRange[];
}

export enum FoldingRangeType {
	/**
	 * Folding range for a comment
	 */
	Comment = 'comment',
	/**
	 * Folding range for a imports or includes
	 */
	Imports = 'imports',
	/**
	 * Folding range for a region (e.g. `#region`)
	 */
	Region = 'region'
}

export interface FoldingRange {

	/**
	 * The start line number
	 */
	startLine: number;

	/**
	 * The end line number
	 */
	endLine: number;

	/**
	 * The actual color value for this folding range.
	 */
	type?: FoldingRangeType | string;
}

export interface FoldingRangeRequestParam {
	/**
	 * The text document.
	 */
	textDocument: TextDocumentIdentifier;
}

export namespace FoldingRangesRequest {
	export const type: RequestType<FoldingRangeRequestParam, FoldingRangeList | null, any, any> = new RequestType('textDocument/foldingRanges');
}
