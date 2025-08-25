/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================
// This file now serves as a compatibility layer, re-exporting all the
// functionality from the organized separate files.

// Storage service tokens and utilities
export {
	IChatEditingStorageServiceV2,
	IChatEditingMigrationServiceV2,
	StorageUtils
} from './chatEditingSessionV2StorageUtils.js';

// Storage providers
export {
	FileStorageProvider,
	MemoryStorageProvider,
	VSCodeStorageProvider
} from './chatEditingSessionV2StorageProviders.js';

// Operation log manager
export {
	OperationLogManager
} from './chatEditingSessionV2OperationLog.js';

// Main storage service
export {
	ChatEditingStorageService
} from './chatEditingSessionV2StorageService.js';

// Migration service
export {
	ChatEditingMigrationService
} from './chatEditingSessionV2Migration.js';

// Service factory functions
export {
	createChatEditingStorageService,
	createChatEditingMigrationService
} from './chatEditingSessionV2ServiceFactory.js';
