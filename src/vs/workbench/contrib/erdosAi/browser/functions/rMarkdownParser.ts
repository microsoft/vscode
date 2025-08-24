/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { CommonUtils } from '../utils/commonUtils.js';

/**
 * Interface for R Markdown code chunks
 */
export interface RMarkdownChunk {
    label?: string;
    start_line: number;
    end_line: number;
    code: string;
    language: string;
    options?: string;
}

/**
 * R Markdown Parser for Erdos AI function handlers
 * Provides R Markdown code chunk extraction
 */
export class RMarkdownParser {

    /**
     * Extract R code from R Markdown content
     */
    extractRCodeFromRmd(fileLines: string[]): string[] {
        const codeLines: string[] = [];
        let inRChunk = false;

        for (const line of fileLines) {
            if (/^```\{r/.test(line) || /^```r\s*$/.test(line)) {
                inRChunk = true;
                continue;
            }

            if (/^```\s*$/.test(line)) {
                inRChunk = false;
                continue;
            }

            if (inRChunk) {
                codeLines.push(line);
            }
        }

        return codeLines;
    }

    /**
     * Extract R Markdown code chunks with metadata
     */
    extractRmdCodeChunks(fileLines: string[]): RMarkdownChunk[] {
        const chunks: RMarkdownChunk[] = [];
        let inChunk = false;
        let currentChunkStart: number | null = null;
        let currentChunkLines: string[] = [];
        let currentChunkLabel: string | null = null;
        let currentChunkLanguage = 'r';
        let currentChunkOptions = '';

        const chunkStartPattern = /^\s*```+\s*\{([rR].*)\}\s*$/;
        const chunkEndPattern = /^\s*```+\s*$/;

        for (let i = 0; i < fileLines.length; i++) {
            const line = fileLines[i];

            if (!inChunk && chunkStartPattern.test(line)) {
                inChunk = true;
                currentChunkStart = i + 1; // 1-indexed
                currentChunkLines = [];
                currentChunkLabel = null;
                currentChunkLanguage = 'r';

                const match = line.match(chunkStartPattern);
                if (match && match[1]) {
                    const chunkOptions = match[1];
                    currentChunkOptions = chunkOptions;

                    // Extract language (first part before space or comma)
                    const languageMatch = chunkOptions.match(/^([rR])/);
                    if (languageMatch) {
                        currentChunkLanguage = languageMatch[1].toLowerCase();
                    }

                    const labelPattern = /.*label\s*=\s*["']?([^,"']+)["']?.*/;
                    if (labelPattern.test(chunkOptions)) {
                        const labelMatch = chunkOptions.match(labelPattern);
                        if (labelMatch && labelMatch[1]) {
                            currentChunkLabel = labelMatch[1].trim();
                        }
                    }

                    // Alternative: check if there's a chunk name right after r/R
                    if (!currentChunkLabel) {
                        const nameMatch = chunkOptions.match(/^[rR]\s+([a-zA-Z_][a-zA-Z0-9_-]*)/);
                        if (nameMatch && nameMatch[1]) {
                            currentChunkLabel = nameMatch[1];
                        }
                    }
                }
            } else if (inChunk && !chunkEndPattern.test(line)) {
                currentChunkLines.push(line);
            } else if (inChunk && chunkEndPattern.test(line)) {
                chunks.push({
                    label: currentChunkLabel || undefined,
                    start_line: currentChunkStart!,
                    end_line: i + 1, // 1-indexed
                    code: currentChunkLines.join('\n'),
                    language: currentChunkLanguage,
                    options: currentChunkOptions
                });

                // Reset state
                inChunk = false;
                currentChunkStart = null;
                currentChunkLines = [];
                currentChunkLabel = null;
            }
        }

        if (inChunk && currentChunkStart !== null) {
            chunks.push({
                label: currentChunkLabel || undefined,
                start_line: currentChunkStart,
                end_line: fileLines.length, // 1-indexed
                code: currentChunkLines.join('\n'),
                language: currentChunkLanguage,
                options: currentChunkOptions
            });
        }

        return chunks;
    }

    /**
     * Extract code from content based on document type
     */
    extractCodeByDocumentType(fileContent: string, documentType: string): string {
        if (documentType === 'r_source') {
            return fileContent;
        } else if (documentType === 'r_markdown' || documentType === 'quarto_markdown') {
            return this.extractCodeWithDelimiters(
                fileContent,
                /^\s*[`]{3}{\s*[Rr](?:}|[\s,].*})\s*$/m,  // Start pattern
                /^\s*[`]{3}\s*$/m                          // End pattern
            );
        } else if (documentType === 'sweave') {
            return this.extractCodeWithDelimiters(
                fileContent,
                /^\s*<<.*>>=\s*$/m,                        // Start pattern
                /^\s*@\s*$/m                               // End pattern
            );
        } else if (documentType === 'cpp') {
            return this.extractCodeWithDelimiters(
                fileContent,
                /^\s*\/\*{3,}\s*[rR]\s*$/m,               // Start pattern
                /^\s*\*+\//m                               // End pattern
            );
        }

        return fileContent; // Default: return as-is
    }

    /**
     * Extract code between start and end delimiters
     * Helper method that implements the core extraction logic
     */
    private extractCodeWithDelimiters(content: string, startPattern: RegExp, endPattern: RegExp): string {
        const lines = content.split('\n');
        const codeLines: string[] = [];
        let inCodeBlock = false;

        for (const line of lines) {
            if (!inCodeBlock && startPattern.test(line)) {
                inCodeBlock = true;
                continue;
            }

            if (inCodeBlock && endPattern.test(line)) {
                inCodeBlock = false;
                continue;
            }

            if (inCodeBlock) {
                codeLines.push(line);
            }
        }

        return codeLines.join('\n');
    }

    /**
     * Check if file is R Markdown or Quarto
     */
    isRMarkdownFile(filename: string): boolean {
        const extension = this.getFileExtension(filename).toLowerCase();
        return ['.rmd', '.qmd'].includes(extension);
    }

    /**
     * Check if file is Sweave
     */
    isSweaveFile(filename: string): boolean {
        const extension = this.getFileExtension(filename).toLowerCase();
        return ['.rnw', '.snw'].includes(extension);
    }

    /**
     * Determine document type from filename
     */
    getDocumentType(filename: string): string {
        const extension = this.getFileExtension(filename).toLowerCase();
        
        switch (extension) {
            case '.r':
                return 'r_source';
            case '.rmd':
                return 'r_markdown';
            case '.qmd':
                return 'quarto_markdown';
            case '.rnw':
            case '.snw':
                return 'sweave';
            case '.cpp':
            case '.c':
            case '.cc':
            case '.cxx':
                return 'cpp';
            default:
                return 'unknown';
        }
    }

    /**
     * Get file extension from filename using CommonUtils
     */
    private getFileExtension(filename: string): string {
        return CommonUtils.getFileExtension(filename);
    }

    /**
     * Check if content contains R Markdown code chunks
     */
    hasRMarkdownChunks(content: string): boolean {
        return /^```\{[rR]/.test(content) || /^```[rR]\s*$/.test(content);
    }

    /**
     * Extract R code from file content for execution
     * Widget functionality removed - kept for future use
     */
    extractExecutableRCode(fileContent: string[], filename: string): string[] {
        const fileExt = this.getFileExtension(filename).toLowerCase();
        
        if (['.rmd', '.qmd'].includes(fileExt)) {
            const codeContent = this.extractRCodeFromRmd(fileContent);
            
            // If no R code chunks were found (e.g., line range doesn't include ``` markers),
            if (codeContent.length === 0) {
                return fileContent;
            } else {
                return codeContent;
            }
        } else {
            return fileContent;
        }
    }

    /**
     * Parse chunk options from R Markdown chunk header
     */
    parseChunkOptions(optionsString: string): { [key: string]: string } {
        const options: { [key: string]: string } = {};
        
        // Remove the initial 'r' or 'R'
        const cleanOptions = optionsString.replace(/^[rR]\s*/, '');
        
        // Split by commas but respect quotes
        const optionPairs = this.splitChunkOptions(cleanOptions);
        
        for (const pair of optionPairs) {
            const equalIndex = pair.indexOf('=');
            if (equalIndex !== -1) {
                const key = pair.substring(0, equalIndex).trim();
                const value = pair.substring(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
                options[key] = value;
            }
        }
        
        return options;
    }

    /**
     * Split chunk options respecting quotes
     */
    private splitChunkOptions(optionsString: string): string[] {
        const options: string[] = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = '';
        
        for (let i = 0; i < optionsString.length; i++) {
            const char = optionsString[i];
            
            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (inQuotes && char === quoteChar) {
                inQuotes = false;
                quoteChar = '';
                current += char;
            } else if (!inQuotes && char === ',') {
                if (current.trim()) {
                    options.push(current.trim());
                }
                current = '';
            } else {
                current += char;
            }
        }
        
        if (current.trim()) {
            options.push(current.trim());
        }
        
        return options;
    }

    /**
     * Get chunks for a specific language
     */
    getChunksByLanguage(chunks: RMarkdownChunk[], language: string): RMarkdownChunk[] {
        return chunks.filter(chunk => chunk.language.toLowerCase() === language.toLowerCase());
    }

    /**
     * Get chunk by label
     */
    getChunkByLabel(chunks: RMarkdownChunk[], label: string): RMarkdownChunk | undefined {
        return chunks.find(chunk => chunk.label === label);
    }

    /**
     * Combine all code from R chunks
     */
    combineRChunkCode(chunks: RMarkdownChunk[]): string {
        const rChunks = this.getChunksByLanguage(chunks, 'r');
        return rChunks.map(chunk => chunk.code).join('\n\n');
    }
}



