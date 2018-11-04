/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

declare module '@emmetio/math-expression' {
	import { BufferStream } from 'EmmetNode';

	function index(stream: BufferStream, backward: boolean): number;

	export default index;
}

