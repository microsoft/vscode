/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Re-export from the workbench layer so both local and remote contributions
// can share the same bundler implementation.
export { SyncedCustomizationBundler } from '../../../../chat/browser/agentSessions/agentHost/syncedCustomizationBundler.js';
export { SYNCED_CUSTOMIZATION_SCHEME } from '../../../../../services/agentHost/common/agentHostFileSystemService.js';
