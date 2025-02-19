/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/824

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
		 * Decodes the content from a `Uint8Array` to a `string` using
		 * the same encoding logic that is used when opening text documents.
		 *
		 * This method will respect the user configured file encoding,
		 * whether encodings are guessed and BOMs (byte order marks).
		 *
		 * @param uri The URI that represents the file. This information
		 * is used to figure out the encoding related configuration for the file.
		 * @param content The content to decode as a `Uint8Array`.
		 * @returns A thenable that resolves to the decoded `string`.
		 */
		export function decode(uri: Uri | undefined, content: Uint8Array): Thenable<string>;

		/**
		 * Encodes the content of a string to a `Uint8Array` using
		 * the same encoding logic that is used when saving text documents.
		 *
		 * This method will respect the user configured file encoding.
		 *
		 *@param uri The URI that represents the file. This information
		 * is used to figure out the encoding related configuration for the file.
		 * @param content The content to decode as a `string`.
		 * @returns A thenable that resolves to the encoded `Uint8Array`.
		 */
		export function encode(uri: Uri | undefined, content: string): Thenable<Uint8Array>;
	}
}
