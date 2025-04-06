/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/241449

	export interface TextDocument {

		/**
		 * The file encoding of this document that will be used when the document is saved.
		 *
		 * Use the {@link workspace.onDidChangeTextDocument onDidChangeTextDocument}-event to
		 * get notified when the document encoding changes.
		 *
		 * Note that the possible encoding values are currently defined as any of the following:
		 * 'utf8', 'utf8bom', 'utf16le', 'utf16be', 'windows1252', 'iso88591', 'iso88593',
		 * 'iso885915', 'macroman', 'cp437', 'windows1256', 'iso88596', 'windows1257',
		 * 'iso88594', 'iso885914', 'windows1250', 'iso88592', 'cp852', 'windows1251',
		 * 'cp866', 'cp1125', 'iso88595', 'koi8r', 'koi8u', 'iso885913', 'windows1253',
		 * 'iso88597', 'windows1255', 'iso88598', 'iso885910', 'iso885916', 'windows1254',
		 * 'iso88599', 'windows1258', 'gbk', 'gb18030', 'cp950', 'big5hkscs', 'shiftjis',
		 * 'eucjp', 'euckr', 'windows874', 'iso885911', 'koi8ru', 'koi8t', 'gb2312',
		 * 'cp865', 'cp850'.
		 */
		readonly encoding: string;
	}

	export namespace workspace {

		/**
		 * Opens a document. Will return early if this document is already open. Otherwise
		 * the document is loaded and the {@link workspace.onDidOpenTextDocument didOpen}-event fires.
		 *
		 * The document is denoted by an {@link Uri}. Depending on the {@link Uri.scheme scheme} the
		 * following rules apply:
		 * * `file`-scheme: Open a file on disk (`openTextDocument(Uri.file(path))`). Will be rejected if the file
		 * does not exist or cannot be loaded.
		 * * `untitled`-scheme: Open a blank untitled file with associated path (`openTextDocument(Uri.file(path).with({ scheme: 'untitled' }))`).
		 * The language will be derived from the file name.
		 * * For all other schemes contributed {@link TextDocumentContentProvider text document content providers} and
		 * {@link FileSystemProvider file system providers} are consulted.
		 *
		 * *Note* that the lifecycle of the returned document is owned by the editor and not by the extension. That means an
		 * {@linkcode workspace.onDidCloseTextDocument onDidClose}-event can occur at any time after opening it.
		 *
		 * @throws This method will throw an error when an existing text document with the provided uri is dirty.
		 *
		 * @param uri Identifies the resource to open.
		 * @param options Options to control how the document will be opened.
		 * @returns A promise that resolves to a {@link TextDocument document}.
		 */
		export function openTextDocument(uri: Uri, options?: {
			/**
			 * The {@link TextDocument.encoding encoding} of the document to use
			 * for decoding the underlying buffer to text. If omitted, the encoding
			 * will be guessed based on the file content and/or the editor settings
			 * unless the document is already opened.
			 *
			 * See {@link TextDocument.encoding} for more information about valid
			 * values for encoding.
			 *
			 * *Note* that opening a text document that was already opened with a
			 * different encoding has the potential of changing the text contents of
			 * the text document. Specifically, when the encoding results in a
			 * different set of characters than the previous encoding.
			 *
			 * *Note* that if you open a document with an encoding that does not
			 * support decoding the underlying bytes, content may be replaced with
			 * substitution characters as appropriate.
			 */
			encoding?: string;
		}): Thenable<TextDocument>;

		/**
		 * A short-hand for `openTextDocument(Uri.file(path))`.
		 *
		 * @see {@link workspace.openTextDocument}
		 * @param path A path of a file on disk.
		 * @param options Options to control how the document will be opened.
		 * @returns A promise that resolves to a {@link TextDocument document}.
		 */
		export function openTextDocument(path: string, options?: {
			/**
			 * The {@link TextDocument.encoding encoding} of the document to use
			 * for decoding the underlying buffer to text. If omitted, the encoding
			 * will be guessed based on the file content and/or the editor settings
			 * unless the document is already opened.
			 *
			 * See {@link TextDocument.encoding} for more information about valid
			 * values for encoding.
			 *
			 * *Note* that opening a text document that was already opened with a
			 * different encoding has the potential of changing the text contents of
			 * the text document. Specifically, when the encoding results in a
			 * different set of characters than the previous encoding.
			 *
			 * *Note* that if you open a document with an encoding that does not
			 * support decoding the underlying bytes, content may be replaced with
			 * substitution characters as appropriate.
			 */
			encoding?: string;
		}): Thenable<TextDocument>;

		/**
		 * Opens an untitled text document. The editor will prompt the user for a file
		 * path when the document is to be saved. The `options` parameter allows to
		 * specify the *language*, *encoding* and/or the *content* of the document.
		 *
		 * @param options Options to control how the document will be created.
		 * @returns A promise that resolves to a {@link TextDocument document}.
		 */
		export function openTextDocument(options?: {
			/**
			 * The {@link TextDocument.languageId language} of the document.
			 */
			language?: string;
			/**
			 * The initial contents of the document.
			 */
			content?: string;
			/**
			 * The {@link TextDocument.encoding encoding} of the document.
			 */
			encoding?: string;
		}): Thenable<TextDocument>;

		/**
		 * Decodes the content from a `Uint8Array` to a `string`. You MUST
		 * provide the entire content at once to ensure that the encoding
		 * can properly apply. Do not use this method to decode content
		 * in chunks, as that may lead to incorrect results.
		 *
		 * If no encoding is provided, will try to pick an encoding based
		 * on user settings and the content of the buffer (for example
		 * byte order marks).
		 *
		 * *Note* that if you decode content that is unsupported by the
		 * encoding, the result may contain substitution characters as
		 * appropriate.
		 *
		 * @throws This method will throw an error when the content is binary.
		 *
		 * @param content The content to decode as a `Uint8Array`.
		 * @param uri The URI that represents the file. This information
		 * is used to figure out the encoding related configuration for the file.
		 * @param options Allows to explicitly pick the encoding to use. See {@link TextDocument.encoding}
		 * for more information about valid values for encoding.
		 * @returns A thenable that resolves to the decoded `string`.
		 */
		export function decode(content: Uint8Array, uri: Uri | undefined, options?: { encoding: string }): Thenable<string>;

		/**
		 * Encodes the content of a `string` to a `Uint8Array`.
		 *
		 * If no encoding is provided, will try to pick an encoding based
		 * on user settings.
		 *
		 * @param content The content to decode as a `string`.
		 * @param uri The URI that represents the file. This information
		 * is used to figure out the encoding related configuration for the file.
		 * @param options Allows to explicitly pick the encoding to use. See {@link TextDocument.encoding}
		 * for more information about valid values for encoding.
		 * @returns A thenable that resolves to the encoded `Uint8Array`.
		 */
		export function encode(content: string, uri: Uri | undefined, options?: { encoding: string }): Thenable<Uint8Array>;
	}
}
