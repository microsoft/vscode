/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import type { Event, Extension } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';

export const IExtensionsService = createServiceIdentifier<IExtensionsService>('IExtensionsService');

export interface IExtensionsService {
	readonly _serviceBrand: undefined;

	getExtension<T = any>(extensionId: string, includeDifferentExtensionHosts?: boolean): Extension<T> | undefined;
	allAcrossExtensionHosts: readonly Extension<void>[];
	all: readonly Extension<void>[];
	onDidChange: Event<void>;
}
