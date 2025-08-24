/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

// Main orchestrator
export { FunctionCallOrchestrator } from './functionCallOrchestrator.js';

// Core function call components
export { FunctionCallHandler } from './functionCallHandler.js';
export { FunctionCallBuffer, type FunctionCallData } from './functionCallBuffer.js';
export { MessageIdManager } from '../conversation/messageIdManager.js';

// Infrastructure components
export { InfrastructureRegistry } from './infrastructureRegistry.js';
export { FileSystemUtils } from './fileSystemUtils.js';
export { SettingsUtils } from './settingsUtils.js';
export { DocumentManager } from '../document/documentManager.js';
export { ImageProcessingManager } from './imageProcessingManager.js';


export { ConversationUtilities } from './conversationUtilities.js';
export { RMarkdownParser } from './rMarkdownParser.js';
export { OutputLimiter } from './outputLimiter.js';

export { 
	GrepSearchHandler, 
	SearchForFileHandler, 
	ListDirectoryHandler,
	type GrepSearchArgs,
	type SearchForFileArgs,
	type ListDirectoryArgs
} from './searchOperations.js';

export { 
	ImageHandler,
	type ViewImageArgs
} from './miscOperations.js';

export { 
	ReadFileHandler,
	type ReadFileArgs
} from './fileOperations.js';

// Core types
export {
	type FunctionCall,
	type FunctionResult,
	type FunctionCallArgs,
	type CallContext,
	type NormalizedFunctionCall,
	type SuccessResult,
	type ErrorResult,
	type FunctionCallOutput,
	type DocumentInfo,
	type MatchOptions,
	type MatchResult,

	type DirectoryEntry,
	type SearchResult,
	FunctionHandler
} from './types.js';