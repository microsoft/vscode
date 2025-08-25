/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import {
	IChatEditingStorageService
} from './chatEditingSessionV2.js';
import { FileStorageProvider, MemoryStorageProvider } from './chatEditingSessionV2StorageProviders.js';
import { ChatEditingStorageService } from './chatEditingSessionV2StorageService.js';
import { ChatEditingMigrationService } from './chatEditingSessionV2Migration.js';

// ============================================================================
// SERVICE FACTORY FUNCTIONS
// ============================================================================

/**
 * Factory function for creating storage service instances.
 */
export function createChatEditingStorageService(
	fileService: IFileService,
	storageService: IStorageService,
	logService: ILogService
): ChatEditingStorageService {
	// Create a default base URI for chat editing storage
	const baseUri = URI.parse('file:///chatEditing/v2');
	const storageProvider = new FileStorageProvider(fileService, logService, baseUri);
	return new ChatEditingStorageService(storageProvider, logService);
}

/**
 * Factory function for creating migration service instances.
 */
export function createChatEditingMigrationService(
	storageService: IChatEditingStorageService,
	logService: ILogService
): ChatEditingMigrationService {
	// Create a basic memory storage provider for legacy data
	const legacyStorageProvider = new MemoryStorageProvider();
	return new ChatEditingMigrationService(storageService, legacyStorageProvider, logService);
}

// ============================================================================
// SERVICE REGISTRATION WITH DEPENDENCY INJECTION
// ============================================================================

// Note: Service registration setup is prepared but not activated for basic storage implementation.
// The V2 services can be instantiated directly or through a factory pattern when needed.
// Proper VS Code service registration would require additional imports and configuration:

// Example service registration (commented out for basic implementation):
/*
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';

class ChatEditingStorageServiceWithDI extends ChatEditingStorageService {
	constructor(
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService
	) {
		const storageProvider = new FileStorageProvider(fileService, logService, {});
		super(storageProvider, logService);
	}
}

registerSingleton(IChatEditingStorageService, ChatEditingStorageServiceWithDI, InstantiationType.Delayed);
*/
