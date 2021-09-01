/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';

export const ILabelService = createDecorator<ILabelService>('labelService');

export interface ILabelService {

	readonly _serviceBrand: undefined;

	/**
	 * Gets the human readable label for a uri.
	 * If `relative` is passed returns a label relative to the workspace root that the uri belongs to.
	 * If `noPrefix` is passed does not tildify the label and also does not prepand the root name for relative labels in a multi root scenario.
	 * If `separator` is passed, will use that over the defined path separator of the formatter.
	 */
	getUriLabel(resource: URI, options?: { relative?: boolean, noPrefix?: boolean, endWithSeparator?: boolean, separator?: '/' | '\\' }): string;
	getUriBasenameLabel(resource: URI): string;
	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | IWorkspace), options?: { verbose: boolean }): string;
	getHostLabel(scheme: string, authority?: string): string;
	getHostTooltip(scheme: string, authority?: string): string | undefined;
	getSeparator(scheme: string, authority?: string): '/' | '\\';

	registerFormatter(formatter: ResourceLabelFormatter): IDisposable;
	onDidChangeFormatters: Event<IFormatterChangeEvent>;
}

export interface IFormatterChangeEvent {
	scheme: string;
}

export interface ResourceLabelFormatter {
	scheme: string;
	authority?: string;
	priority?: boolean;
	formatting: ResourceLabelFormatting;
}

export interface ResourceLabelFormatting {
	label: string; // myLabel:/${path}
	separator: '/' | '\\' | '';
	tildify?: boolean;
	normalizeDriveLetter?: boolean;
	workspaceSuffix?: string;
	workspaceTooltip?: string;
	authorityPrefix?: string;
	stripPathStartingSeparator?: boolean;
}
