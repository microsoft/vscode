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
}
