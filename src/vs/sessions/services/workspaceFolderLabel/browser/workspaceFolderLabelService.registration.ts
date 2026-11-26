/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkspaceFolderLabelService } from '../../../../workbench/services/workspaces/common/workspaceFolderLabelService.js';
import { SessionsWorkspaceFolderLabelService } from '../../../../workbench/contrib/sessions/browser/sessionsWorkspaceFolderLabelService.js';

registerSingleton(IWorkspaceFolderLabelService, SessionsWorkspaceFolderLabelService, InstantiationType.Delayed);
