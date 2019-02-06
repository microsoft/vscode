/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { basename as resourceBasename } from 'vs/base/common/resources';
import { isLinux } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { localize } from 'vs/nls';
import { isParent } from 'vs/platform/files/common/files';
import { basename } from 'vs/base/common/paths';

export interface ILabelService {
	_serviceBrand: any;
	/**
	 * Gets the human readable label for a uri.
	 * If relative is passed returns a label relative to the workspace root that the uri belongs to.
	 * If noPrefix is passed does not tildify the label and also does not prepand the root name for relative labels in a multi root scenario.
	 */
	getUriLabel(resource: URI, options?: { relative?: boolean, noPrefix?: boolean }): string;
	getWorkspaceLabel(workspace: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | IWorkspace), options?: { verbose: boolean }): string;
	getHostLabel(): string;
	registerFormatter(formatter: ResourceLabelFormatter): IDisposable;
	onDidChangeFormatters: Event<void>;
}

export interface ResourceLabelFormatter {
	scheme: string;
	authority?: string;
	formatting: ResourceLabelFormatting;
}

export interface ResourceLabelFormatting {
	label: string; // myLabel:/${path}
	separator: '/' | '\\' | '';
	tildify?: boolean;
	normalizeDriveLetter?: boolean;
	workspaceSuffix?: string;
	authorityPrefix?: string;
}

const LABEL_SERVICE_ID = 'label';

export function getSimpleWorkspaceLabel(workspace: IWorkspaceIdentifier | URI, workspaceHome: string): string {
	if (isSingleFolderWorkspaceIdentifier(workspace)) {
		return resourceBasename(workspace);
	}
	// Workspace: Untitled
	if (isParent(workspace.configPath, workspaceHome, !isLinux /* ignore case */)) {
		return localize('untitledWorkspace', "Untitled (Workspace)");
	}

	const filename = basename(workspace.configPath);
	const workspaceName = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
	return localize('workspaceName', "{0} (Workspace)", workspaceName);
}


export const ILabelService = createDecorator<ILabelService>(LABEL_SERVICE_ID);
