/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface EndpointPreset {
	id: string;
	label: string;
	description: string;
	body: unknown;
}

export interface EndpointDef {
	id: string;
	label: string;
	path: string;
	productKey: string;
	description: string;
	presets: EndpointPreset[];
}

declare const endpoints: EndpointDef[];
export = endpoints;
