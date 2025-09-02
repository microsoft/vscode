/*
 * Copyright (C) 2025 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { FunctionHandler, CallContext } from '../common/functionTypes.js';

/**
 * Base class for function handlers that provides common utility methods
 * Eliminates code duplication across function handlers
 */
export abstract class BaseFunctionHandler extends FunctionHandler {

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
