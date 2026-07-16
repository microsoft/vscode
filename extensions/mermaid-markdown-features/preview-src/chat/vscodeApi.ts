/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface VsCodeApi {
	getState(): any;
	setState(state: any): void;
	postMessage(message: any): void;
}
