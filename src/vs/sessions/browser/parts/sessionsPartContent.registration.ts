/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SessionsPartContentRegistry } from '../../../workbench/browser/parts/sessions/sessionsPartContent.js';
import { SessionsGridContent } from '../../../workbench/contrib/sessions/browser/parts/sessionsGridContent.js';

// The Agents window shows its sessions as a grid of session views in the Sessions part.
SessionsPartContentRegistry.register({ id: SessionsGridContent.ID, ctor: SessionsGridContent });
