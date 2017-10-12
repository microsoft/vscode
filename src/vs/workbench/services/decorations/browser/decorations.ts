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
import { IDisposable } from 'vs/base/common/lifecycle';

export const IResourceDecorationsService = createDecorator<IResourceDecorationsService>('IFileDecorationsService');

export interface IResourceDecorationData {
	readonly severity: Severity;
	readonly color?: ColorIdentifier;
	readonly letter?: string;
	readonly tooltip?: string;
}

export interface IResourceDecoration {
	readonly _decoBrand: undefined;
	readonly severity: Severity;
	readonly letter?: string;
	readonly tooltip?: string;
	readonly labelClassName?: string;
	readonly badgeClassName?: string;
}

export interface IDecorationsProvider {
	readonly label: string;
	readonly onDidChange: Event<URI[]>;
	provideDecorations(uri: URI): IResourceDecorationData | Thenable<IResourceDecorationData>;
}

export interface IResourceDecorationChangeEvent {
	affectsResource(uri: URI): boolean;
}

export interface IResourceDecorationsService {

	readonly _serviceBrand: any;

	readonly onDidChangeDecorations: Event<IResourceDecorationChangeEvent>;

	registerDecortionsProvider(provider: IDecorationsProvider): IDisposable;

	getTopDecoration(uri: URI, includeChildren: boolean): IResourceDecoration;
}
