/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { refineServiceDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export const IWorkbenchWorkspaceContextService = refineServiceDecorator<IWorkspaceContextService, IWorkbenchWorkspaceContextService>(IWorkspaceContextService);

/** The workspace context of a workbench window, which can also change its workbench scope independently of the window's workspace identity and folders. */
export interface IWorkbenchWorkspaceContextService extends IWorkspaceContextService {
	setWorkbenchScope(scope: URI | undefined): void;
	resetWorkbenchScope(): void;
}
