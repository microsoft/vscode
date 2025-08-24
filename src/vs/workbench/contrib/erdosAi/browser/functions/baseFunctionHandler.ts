/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionHandler, CallContext } from './types.js';
import { CommonUtils } from '../utils/commonUtils.js';

/**
 * Base class for function handlers that provides common utility methods
 * Eliminates code duplication across function handlers
 */
export abstract class BaseFunctionHandler extends FunctionHandler {
    
    /**
     * Get the basename (filename without directory) from a path
     * Uses CommonUtils for consistency across the codebase
     */
    protected getBasename(filePath: string): string {
        return CommonUtils.getBasename(filePath);
    }

    /**
     * Get file extension from a path
     * Uses CommonUtils for consistency across the codebase
     */
    protected getFileExtension(path: string, context: CallContext): string {
        return CommonUtils.getFileExtension(path);
    }

    /**
     * Apply output text limiting with consistent parameters
     * Replaces duplicated limitOutputText methods across handlers
     */
    protected limitOutputText(
        lines: string[], 
        context: CallContext, 
        maxTotalChars: number = 10000, 
        maxLines: number = 50, 
        maxLineLength: number = 200
    ): string[] {
        if (context.outputLimiter) {
            // Use the proper output limiter if available
            return context.outputLimiter.limitOutputText(lines, maxTotalChars, maxLines, maxLineLength);
        }

        // Fallback implementation for when output limiter is not available
        let totalChars = 0;
        const limitedLines: string[] = [];

        for (let i = 0; i < lines.length && i < maxLines; i++) {
            let line = lines[i];
            
            // Truncate line if too long
            if (line.length > maxLineLength) {
                line = line.substring(0, maxLineLength) + '...';
            }
            
            // Check if adding this line would exceed total character limit
            if (totalChars + line.length > maxTotalChars) {
                if (limitedLines.length > 0) {
                    limitedLines.push('... (output truncated)');
                }
                break;
            }
            
            limitedLines.push(line);
            totalChars += line.length;
        }

        // Add truncation message if we hit the line limit
        if (lines.length > maxLines) {
            limitedLines.push(`... (${lines.length - maxLines} more lines truncated)`);
        }

        return limitedLines;
    }

    /**
     * Check if file exists using context utilities
     * Provides consistent file existence checking
     */
    protected async fileExists(path: string, context: CallContext): Promise<boolean> {
        return await context.fileSystemUtils.fileExists(path);
    }

    /**
     * Join file paths using context utilities
     * Provides consistent path joining
     */
    protected joinPath(dir: string, file: string): string {
        return `${dir}/${file}`.replace(/\/+/g, '/');
    }

    /**
     * Get current working directory using context utilities
     * Provides consistent working directory access
     */
    protected async getCurrentWorkingDirectory(context: CallContext): Promise<string> {
        return await context.fileSystemUtils.getCurrentWorkingDirectory();
    }

    /**
     * Normalize path using context utilities
     * Provides consistent path normalization
     */
    protected normalizePath(filePath: string, context: CallContext): string {
        return context.fileSystemUtils.normalizePath(filePath);
    }

    /**
     * Get directory name from path using context utilities
     * Provides consistent directory name extraction
     */
    protected getDirname(filePath: string, context: CallContext): string {
        return context.fileSystemUtils.getDirname(filePath);
    }

    /**
     * Format file size in human readable format
     * Uses CommonUtils for consistency across the codebase
     */
    protected formatFileSize(sizeInBytes: number): string {
        return CommonUtils.formatFileSize(sizeInBytes);
    }

    /**
     * Validate path security using context utilities
     * Provides consistent path security validation
     */
    protected async validatePathSecurity(
        filePath: string, 
        context: CallContext, 
        allowedBaseDir?: string
    ): Promise<{ isValid: boolean; errorMessage?: string; }> {
        return await context.fileSystemUtils.validatePathSecurity(filePath, allowedBaseDir);
    }
}
