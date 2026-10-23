/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DiffEditorCommandsService, IDiffEditorCommandsService } from './diffEditorCommandsService.js';

// Registered only in the main workbench window. The Agents window contributes its own
// implementation (SessionsDiffEditorCommandsService) so it never imports this file.
registerSingleton(IDiffEditorCommandsService, DiffEditorCommandsService, InstantiationType.Delayed);
