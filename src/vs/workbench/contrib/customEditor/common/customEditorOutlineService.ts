/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ICustomEditorOutlineProviderService = createDecorator<ICustomEditorOutlineProviderService>('customEditorOutlineProviderService');

export interface ICustomEditorOutlineItemDto {
	readonly id: string;
	readonly label: string;
	readonly detail?: string;
	readonly tooltip?: string;
	readonly icon?: ThemeIcon;
	readonly contextValue?: string;
	readonly children?: ICustomEditorOutlineItemDto[];
}

export interface ICustomEditorOutlineProvider {
	provideOutline(resource: URI, webviewHandle: string, token: CancellationToken): Promise<ICustomEditorOutlineItemDto[] | undefined>;
	revealItem(resource: URI, webviewHandle: string, itemId: string): void;
}

export interface ICustomEditorOutlineProviderService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	hasProvider(viewType: string): boolean;
	provideOutline(viewType: string, resource: URI, webviewHandle: string, token: CancellationToken): Promise<ICustomEditorOutlineItemDto[] | undefined>;
	revealItem(viewType: string, resource: URI, webviewHandle: string, itemId: string): void;
	getActiveItemId(viewType: string, webviewHandle: string): string | undefined;

	onDidChangeOutline(viewType: string, webviewHandle: string): Event<void>;
	onDidChangeActiveItem(viewType: string, webviewHandle: string): Event<string | undefined>;

	registerProvider(viewType: string, provider: ICustomEditorOutlineProvider): IDisposable;
	retainEditor(viewType: string, webviewHandle: string): IDisposable;
	fireDidChangeOutline(viewType: string, webviewHandle: string): void;
	fireDidChangeActiveItem(viewType: string, webviewHandle: string, itemId: string | undefined): void;
}
