/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Severity from 'vs/base/common/severity';
import Event from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IMarkerService = createDecorator<IMarkerService>('markerService');

export interface IMarkerService {
	_serviceBrand: any;

	getStatistics(): MarkerStatistics;

	changeOne(owner: string, resource: URI, markers: IMarkerData[]): void;

	changeAll(owner: string, data: IResourceMarker[]): void;

	remove(owner: string, resources: URI[]): void;

	read(filter?: { owner?: string; resource?: URI; take?: number; }): IMarker[];

	onMarkerChanged: Event<URI[]>;
}

/**
 * A structure defining a problem/warning/etc.
 */
export interface IMarkerData {
	code?: string;
	severity: Severity;
	message: string;
	source?: string;
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
}

export interface IResourceMarker {
	resource: URI;
	marker: IMarkerData;
}

export interface IMarker {
	owner: string;
	resource: URI;
	severity: Severity;
	code?: string;
	message: string;
	source?: string;
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
}

export interface MarkerStatistics {
	errors: number;
	warnings: number;
	infos: number;
	unknowns: number;
}

export namespace IMarkerData {
	const emptyString = '';
	export function makeKey(markerData: IMarkerData): string {
		let result: string[] = [emptyString];
		if (markerData.source) {
			result.push(markerData.source.replace('¦', '\¦'));
		} else {
			result.push(emptyString);
		}
		if (markerData.code) {
			result.push(markerData.code.replace('¦', '\¦'));
		} else {
			result.push(emptyString);
		}
		if (markerData.severity !== void 0 && markerData.severity !== null) {
			result.push(Severity.toString(markerData.severity));
		} else {
			result.push(emptyString);
		}
		if (markerData.message) {
			result.push(markerData.message.replace('¦', '\¦'));
		} else {
			result.push(emptyString);
		}
		if (markerData.startLineNumber !== void 0 && markerData.startLineNumber !== null) {
			result.push(markerData.startLineNumber.toString());
		} else {
			result.push(emptyString);
		}
		if (markerData.startColumn !== void 0 && markerData.startColumn !== null) {
			result.push(markerData.startColumn.toString());
		} else {
			result.push(emptyString);
		}
		if (markerData.endLineNumber !== void 0 && markerData.endLineNumber !== null) {
			result.push(markerData.endLineNumber.toString());
		} else {
			result.push(emptyString);
		}
		if (markerData.endColumn !== void 0 && markerData.endColumn !== null) {
			result.push(markerData.endColumn.toString());
		} else {
			result.push(emptyString);
		}
		result.push(emptyString);
		return result.join('¦');
	}
}
