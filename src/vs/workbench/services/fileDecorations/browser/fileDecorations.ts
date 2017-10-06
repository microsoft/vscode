/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';

export const IFileDecorationsService = createDecorator<IFileDecorationsService>('IFileDecorationsService');

export interface IFileDecoration {
	readonly type: DecorationType;
	readonly message: string;
	readonly color: ColorIdentifier;
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
	color: ColorIdentifier;
	severity: Severity;
}

export interface IFileDecorationsService {

	readonly _serviceBrand: any;

	readonly onDidChangeFileDecoration: Event<URI[]>;

	registerDecorationType(label: string): DecorationType;

	setFileDecoration(type: DecorationType, target: URI, data: IFileDecorationData): void;

	unsetFileDecoration(type: DecorationType, target: URI): void;

	getDecorations(uri: URI, includeChildren: boolean): IFileDecoration[];

	getTopDecoration(uri: URI, includeChildren: boolean): IFileDecoration;
}
