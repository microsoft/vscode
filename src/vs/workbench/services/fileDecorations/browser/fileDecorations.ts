/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Color } from 'vs/base/common/color';
import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';

export const IFileDecorationsService = createDecorator<IFileDecorationsService>('IFileDecorationsService');

export interface IFileDecoration {
	readonly type: DecorationType;
	readonly message: string;
	readonly color: Color;
	readonly severity: Severity;
}

export abstract class DecorationType {
	readonly label: string;
	protected constructor(label: string) {
		this.label = label;
	}
	dispose(): void {
		//
	}
}

export interface IFileDecorationData {
	message: string;
	color: Color;
	severity: Severity;
}

export interface IFileDecorationsService {

	readonly _serviceBrand: any;

	readonly onDidChangeFileDecoration: Event<URI[]>;

	registerDecorationType(label: string): DecorationType;

	setFileDecorations(type: DecorationType, target: URI, data: IFileDecorationData[]): void;

	unsetFileDecorations(type: DecorationType, target: URI): void;

	getDecorations(uri: URI, includeChildren: boolean): IFileDecoration[];

	getTopDecoration(uri: URI, includeChildren: boolean): IFileDecoration;
}
