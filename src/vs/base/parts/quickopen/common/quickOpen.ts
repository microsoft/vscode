/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ResolvedKeybinding } from 'vs/base/common/keyCodes';

export interface IQuickNavigateConfiguration {
	keybindings: ResolvedKeybinding[];
}

export interface IAutoFocus {

	/**
	 * The index of the element to focus in the result list.
	 */
	autoFocusIndex?: number;

	/**
	 * If set to true, will automatically select the first entry from the result list.
	 */
	autoFocusFirstEntry?: boolean;

	/**
	 * If set to true, will automatically select the second entry from the result list.
	 */
	autoFocusSecondEntry?: boolean;

	/**
	 * If set to true, will automatically select the last entry from the result list.
	 */
	autoFocusLastEntry?: boolean;

	/**
	 * If set to true, will automatically select any entry whose label starts with the search
	 * value. Since some entries to the top might match the query but not on the prefix, this
	 * allows to select the most accurate match (matching the prefix) while still showing other
	 * elements.
	 */
	autoFocusPrefixMatch?: string;
}

export enum Mode {
	PREVIEW,
	OPEN,
	OPEN_IN_BACKGROUND
}

export interface IEntryRunContext {
	event: any;
	keymods: number[];
	quickNavigateConfiguration: IQuickNavigateConfiguration;
}

export interface IDataSource<T> {
	getId(entry: T): string;
	getLabel(entry: T): string;
}

/**
 * See vs/base/parts/tree/browser/tree.ts - IRenderer
 */
export interface IRenderer<T> {
	getHeight(entry: T): number;
	getTemplateId(entry: T): string;
	renderTemplate(templateId: string, container: HTMLElement): any;
	renderElement(entry: T, templateId: string, templateData: any): void;
	disposeTemplate(templateId: string, templateData: any): void;
}

export interface IFilter<T> {
	isVisible(entry: T): boolean;
}

export interface IAccessiblityProvider<T> {
	getAriaLabel(entry: T): string;
}

export interface IRunner<T> {
	run(entry: T, mode: Mode, context: IEntryRunContext): boolean;
}

export interface IModel<T> {
	entries: T[];
	dataSource: IDataSource<T>;
	renderer: IRenderer<T>;
	runner: IRunner<T>;
	filter?: IFilter<T>;
	accessibilityProvider?: IAccessiblityProvider<T>;
}