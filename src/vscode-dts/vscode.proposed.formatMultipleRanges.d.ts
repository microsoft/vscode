/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/158776

	/**
	 * Metadata about a registered {@linkcode DocumentRangeFormattingEditProvider}.
	 */
	export interface DocumentRangeFormattingEditProviderMetadata {
		/**
		 * `true` if the range formatting provider supports formatting multiple ranges at once.
		 */
		readonly canFormatMultipleRanges?: boolean;
	}

	export interface FormattingOptions2 {

		/**
		 * The list of multiple ranges to format at once, if the provider supports it.
		 */
		// TODO@API should this all ranges or all except for the first range?
		// TODO@API needs a name that is more descriptive
		ranges?: Range[];

		[key: string]: boolean | number | string | undefined | object;
	}

	export interface DocumentRangeFormattingEditProvider {
		provideDocumentRangeFormattingEdits(document: TextDocument, range: Range, options: FormattingOptions & FormattingOptions2, token: CancellationToken): ProviderResult<TextEdit[]>;
	}

	export namespace languages {
		/**
		 *
		 * @param metadata Metadata about the provider.
		 */
		export function registerDocumentRangeFormattingEditProvider(selector: DocumentSelector, provider: DocumentRangeFormattingEditProvider, metadata?: DocumentRangeFormattingEditProviderMetadata): Disposable;
	}
}
