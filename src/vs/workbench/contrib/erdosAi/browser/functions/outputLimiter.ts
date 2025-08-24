/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

/**
 * Output Limiter for Erdos AI function handlers
 * Provides smart text truncation and output limiting
 */
export class OutputLimiter {

    /**
     * Limit output text with smart truncation
     */
    limitOutputText(
        outputText: string[] | string,
        maxTotalChars: number = 10000,
        maxLines: number = 50,
        maxLineLength: number = 200
    ): string[] {
        let lines: string[];
        if (typeof outputText === 'string') {
            lines = outputText.split('\n');
        } else {
            lines = [...outputText]; // Make a copy
        }

        const totalLength = lines.reduce((sum, line) => sum + line.length, 0);

        if (totalLength > maxTotalChars) {
            if (lines.length > maxLines) {
                const totalLines = lines.length;
                const linesPerSide = Math.floor((maxLines - 1) / 2); // -1 to account for truncation message

                const startLines = lines.slice(0, linesPerSide);
                const endLines = lines.slice(totalLines - linesPerSide);

                const truncationMsg = `... (${totalLines - 2 * linesPerSide} lines truncated) ...`;
                lines = [...startLines, truncationMsg, ...endLines];
            }

            const currentTotal = lines.reduce((sum, line) => sum + line.length, 0);
            if (currentTotal > maxTotalChars) {
                lines = lines.map(line => {
                    if (line.length > maxLineLength) {
                        return line.substring(0, maxLineLength - 3) + '...';
                    }
                    return line;
                });
            }
        }

        return lines;
    }

    /**
     * Apply file-specific output limiting
     */
    limitFileContent(fileContent: string): string {
        const fileLines = fileContent.split('\n');

        let headerEnd = 1;
        for (let i = 0; i < fileLines.length; i++) {
            if (fileLines[i] === '' && i > 0) {
                headerEnd = i;
                break;
            }
        }

        if (headerEnd < fileLines.length) {
            const headerPart = fileLines.slice(0, headerEnd + 1);
            const contentPart = fileLines.slice(headerEnd + 1);

            const limitedContent = this.limitOutputText(contentPart, 50000, 250, 200);

            // Recombine header and limited content
            return [...headerPart, ...limitedContent].join('\n');
        } else {
            const limitedLines = this.limitOutputText(fileLines, 50000, 250, 200);
            return limitedLines.join('\n');
        }
    }

    /**
     * Apply console/terminal output limiting
     * Uses more restrictive limits for console output
     */
    limitConsoleOutput(output: string): string {
        const lines = output.split('\n');
        // More restrictive limits for console output
        const limitedLines = this.limitOutputText(lines, 8000, 40, 150);
        return limitedLines.join('\n');
    }

    /**
     * Apply search result limiting
     * Handles grep_search and similar search outputs
     */
    limitSearchResults(results: string, maxMatches: number = 50): string {
        const lines = results.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length <= maxMatches) {
            return results;
        }

        const limitedLines = lines.slice(0, maxMatches);
        const truncationMessage = `\n...[Results truncated. Showing first ${maxMatches} matches out of ${lines.length} total matches. Please refine your search to see more specific results.]`;
        
        return limitedLines.join('\n') + truncationMessage;
    }

    /**
     * Trim leading lines to prevent client overwhelm
     */
    trimLeadingLines(text: string, maxLines: number): string {
        const lines = text.split('\n');
        
        if (lines.length <= maxLines) {
            return text;
        }

        // Keep the last maxLines lines
        const trimmedLines = lines.slice(-maxLines);
        
        // Add a truncation notice at the beginning
        const truncationNotice = `[... ${lines.length - maxLines} earlier lines truncated ...]`;
        
        return [truncationNotice, ...trimmedLines].join('\n');
    }

    /**
     * Smart text truncation that preserves readability
     * Tries to break at word boundaries when possible
     */
    smartTruncate(text: string, maxLength: number, suffix: string = '...'): string {
        if (text.length <= maxLength) {
            return text;
        }

        const truncateAt = maxLength - suffix.length;
        
        // Try to find a good break point (space, punctuation)
        const breakPoint = this.findGoodBreakPoint(text, truncateAt);
        
        if (breakPoint > truncateAt * 0.8) { // Only use break point if it's not too far back
            return text.substring(0, breakPoint).trim() + suffix;
        } else {
            return text.substring(0, truncateAt).trim() + suffix;
        }
    }

    /**
     * Find a good break point for text truncation
     */
    private findGoodBreakPoint(text: string, maxLength: number): number {
        // Look for space, comma, period, semicolon, etc.
        const breakChars = [' ', ',', '.', ';', ':', '!', '?', ')', ']', '}', '\n', '\t'];
        
        for (let i = maxLength; i >= maxLength * 0.8; i--) {
            if (breakChars.includes(text[i])) {
                return i;
            }
        }
        
        return maxLength;
    }

    /**
     * Limit output with context preservation
     * Preserves important context like file headers, error messages, etc.
     */
    limitWithContextPreservation(content: string, options: {
        maxTotalChars?: number;
        maxLines?: number;
        maxLineLength?: number;
        preserveHeaders?: boolean;
        preserveErrors?: boolean;
    } = {}): string {
        const {
            maxTotalChars = 10000,
            maxLines = 50,
            maxLineLength = 200,
            preserveHeaders = true,
            preserveErrors = true
        } = options;

        const lines = content.split('\n');
        const importantLines: number[] = [];

        // Identify important lines to preserve
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (preserveHeaders && this.isHeaderLine(line)) {
                importantLines.push(i);
            }
            
            if (preserveErrors && this.isErrorLine(line)) {
                importantLines.push(i);
            }
        }

        // If content is already within limits, return as-is
        const totalLength = lines.reduce((sum, line) => sum + line.length, 0);
        if (totalLength <= maxTotalChars && lines.length <= maxLines) {
            return content;
        }

        // Apply truncation while preserving important lines
        let resultLines: string[] = [];
        const preserveSet = new Set(importantLines);

        if (lines.length > maxLines) {
            // Preserve important lines and distribute remaining space between start and end
            const importantLinesArray = [...preserveSet].sort((a, b) => a - b);
            const remainingSlots = maxLines - importantLinesArray.length - 1; // -1 for truncation message
            const slotsPerSide = Math.floor(remainingSlots / 2);

            // Add start lines
            let startCount = 0;
            for (let i = 0; i < lines.length && startCount < slotsPerSide; i++) {
                if (!preserveSet.has(i)) {
                    resultLines.push(lines[i]);
                    startCount++;
                } else {
                    resultLines.push(lines[i]);
                }
            }

            // Add important lines not yet included
            for (const lineIndex of importantLinesArray) {
                if (lineIndex >= slotsPerSide && lineIndex < lines.length - slotsPerSide) {
                    if (!resultLines.includes(lines[lineIndex])) {
                        resultLines.push(lines[lineIndex]);
                    }
                }
            }

            // Add truncation message
            const skippedLines = lines.length - resultLines.length - slotsPerSide;
            if (skippedLines > 0) {
                resultLines.push(`... (${skippedLines} lines truncated) ...`);
            }

            // Add end lines
            const endStartIndex = Math.max(0, lines.length - slotsPerSide);
            for (let i = endStartIndex; i < lines.length; i++) {
                if (!preserveSet.has(i) || !resultLines.includes(lines[i])) {
                    resultLines.push(lines[i]);
                }
            }
        } else {
            resultLines = [...lines];
        }

        // Apply line length limits
        resultLines = resultLines.map(line => {
            if (line.length > maxLineLength) {
                return this.smartTruncate(line, maxLineLength);
            }
            return line;
        });

        return resultLines.join('\n');
    }

    /**
     * Check if a line is a header line
     */
    private isHeaderLine(line: string): boolean {
        // Common header patterns
        return /^(File:|Lines|Directory:|Results:|Error:|Warning:|Note:)/.test(line.trim()) ||
               /^#{1,6}\s/.test(line.trim()) || // Markdown headers
               /^[-=]{3,}$/.test(line.trim()); // Underline headers
    }

    /**
     * Check if a line is an error line
     */
    private isErrorLine(line: string): boolean {
        const lowerLine = line.toLowerCase();
        return lowerLine.includes('error') ||
               lowerLine.includes('warning') ||
               lowerLine.includes('exception') ||
               lowerLine.includes('failed') ||
               lowerLine.includes('cannot') ||
               /^\s*at\s+/.test(line); // Stack trace lines
    }

    /**
     * Get appropriate limits based on content type
     */
    getLimitsForContentType(contentType: 'file' | 'console' | 'terminal' | 'search' | 'image' | 'general'): {
        maxTotalChars: number;
        maxLines: number;
        maxLineLength: number;
    } {
        switch (contentType) {
            case 'file':
                return { maxTotalChars: 50000, maxLines: 250, maxLineLength: 200 };
            case 'console':
            case 'terminal':
                return { maxTotalChars: 8000, maxLines: 40, maxLineLength: 150 };
            case 'search':
                return { maxTotalChars: 15000, maxLines: 100, maxLineLength: 180 };
            case 'image':
                return { maxTotalChars: 5000, maxLines: 20, maxLineLength: 100 };
            case 'general':
            default:
                return { maxTotalChars: 10000, maxLines: 50, maxLineLength: 200 };
        }
    }

    /**
     * Apply content-type specific limiting
     */
    limitByContentType(content: string, contentType: 'file' | 'console' | 'terminal' | 'search' | 'image' | 'general'): string {
        const limits = this.getLimitsForContentType(contentType);
        
        if (contentType === 'file') {
            return this.limitFileContent(content);
        } else if (contentType === 'console' || contentType === 'terminal') {
            return this.limitConsoleOutput(content);
        } else if (contentType === 'search') {
            return this.limitSearchResults(content);
        } else {
            const lines = content.split('\n');
            const limitedLines = this.limitOutputText(lines, limits.maxTotalChars, limits.maxLines, limits.maxLineLength);
            return limitedLines.join('\n');
        }
    }
}



