/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
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

export interface ICustomEditorOutlineProviderService {
	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<void>;

	hasProvider(viewType: string): boolean;
	getProviderViewTypes(): string[];
	provideOutline(viewType: string, token: CancellationToken): Promise<ICustomEditorOutlineItemDto[] | undefined>;
	revealItem(viewType: string, itemId: string): void;
	getActiveItemId(viewType: string): string | undefined;

	onDidChangeOutline(viewType: string): Event<void>;
	onDidChangeActiveItem(viewType: string): Event<string | undefined>;

	registerProvider(viewType: string): IDisposable;
	unregisterProvider(viewType: string): void;
	fireDidChangeOutline(viewType: string): void;
	fireDidChangeActiveItem(viewType: string, itemId: string | undefined): void;
}
