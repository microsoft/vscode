/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

declare module '@emmetio/html-matcher' {
	import { BufferStream, HtmlNode } from 'EmmetNode';

	function parse(stream: BufferStream): HtmlNode;

	export default parse;
}

