/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import URI from 'vs/base/common/uri';
import Event from 'vs/base/common/event';
import { ColorIdentifier } from 'vs/platform/theme/common/colorRegistry';
import { IDisposable } from 'vs/base/common/lifecycle';

export const IDecorationsService = createDecorator<IDecorationsService>('IFileDecorationsService');

export interface IDecorationData {
	readonly weight?: number;
	readonly color?: ColorIdentifier;
	readonly letter?: string;
	readonly tooltip?: string;
	readonly bubble?: boolean;
	readonly source?: string;
}

export interface IDecoration {
	readonly tooltip: string;
	readonly labelClassName: string;
	readonly badgeClassName: string;
	update(source?: string, data?: IDecorationData): IDecoration;
}

export interface IDecorationsProvider {
	readonly label: string;
	readonly onDidChange: Event<URI[]>;
	provideDecorations(uri: URI): IDecorationData | Thenable<IDecorationData>;
}

export interface IResourceDecorationChangeEvent {
	affectsResource(uri: URI): boolean;
}

export interface IDecorationsService {

	readonly _serviceBrand: any;

	readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent>;

	registerDecorationsProvider(provider: IDecorationsProvider): IDisposable;

	getDecoration(uri: URI, includeChildren: boolean, overwrite?: IDecorationData): IDecoration;
}
