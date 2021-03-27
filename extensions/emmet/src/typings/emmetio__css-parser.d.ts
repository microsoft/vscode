/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

declare module '@emmetio/css-parser' {
	import { BufferStream, Stylesheet } from 'EmmetNode';

	function parseStylesheet(stream: BufferStream): Stylesheet;

	export default parseStylesheet;
}

