/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
function noop(value:string): string {
	return value;
}

(<any>noop).Renderer = function() {
	// No-op
};

const mock:any = {
	marked: noop
};
export = mock;