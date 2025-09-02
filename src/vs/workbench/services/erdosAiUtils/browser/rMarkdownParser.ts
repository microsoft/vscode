/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ICommonUtils } from '../common/commonUtils.js';
import { RMarkdownChunk, IRMarkdownParser } from '../common/rMarkdownParser.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class RMarkdownParser extends Disposable implements IRMarkdownParser {
    readonly _serviceBrand: undefined;

    constructor(
        @ICommonUtils private readonly commonUtils: ICommonUtils
    ) {
        super();
    }

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
                currentChunkStart = i + 1;
                currentChunkLines = [];
                currentChunkLabel = null;
                currentChunkLanguage = 'r';

                const match = line.match(chunkStartPattern);
                if (match && match[1]) {
                    const chunkOptions = match[1];
                    currentChunkOptions = chunkOptions;

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
                    end_line: i + 1,
                    code: currentChunkLines.join('\n'),
                    language: currentChunkLanguage,
                    options: currentChunkOptions
                });

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
                end_line: fileLines.length,
                code: currentChunkLines.join('\n'),
                language: currentChunkLanguage,
                options: currentChunkOptions
            });
        }

        return chunks;
    }

    extractCodeByDocumentType(fileContent: string, documentType: string): string {
        if (documentType === 'r_source') {
            return fileContent;
        } else if (documentType === 'r_markdown' || documentType === 'quarto_markdown') {
            return this.extractCodeWithDelimiters(
                fileContent,
                /^\s*[`]{3}{\s*[Rr](?:}|[\s,].*})\s*$/m,
                /^\s*[`]{3}\s*$/m
            );
        } else if (documentType === 'sweave') {
            return this.extractCodeWithDelimiters(
                fileContent,
                /^\s*<<.*>>=\s*$/m,
                /^\s*@\s*$/m
            );
        } else if (documentType === 'cpp') {
            return this.extractCodeWithDelimiters(
                fileContent,
                /^\s*\/\*{3,}\s*[rR]\s*$/m,
                /^\s*\*+\//m
            );
        }

        return fileContent;
    }

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

    isRMarkdownFile(filename: string): boolean {
        const extension = this.getFileExtension(filename).toLowerCase();
        return ['.rmd', '.qmd'].includes(extension);
    }

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

    private getFileExtension(filename: string): string {
        return this.commonUtils.getFileExtension(filename);
    }

    hasRMarkdownChunks(content: string): boolean {
        return /^```\{[rR]/.test(content) || /^```[rR]\s*$/.test(content);
    }

    extractExecutableRCode(fileContent: string[], filename: string): string[] {
        const fileExt = this.getFileExtension(filename).toLowerCase();
        
        if (['.rmd', '.qmd'].includes(fileExt)) {
            const codeContent = this.extractRCodeFromRmd(fileContent);
            
            if (codeContent.length === 0) {
                return fileContent;
            } else {
                return codeContent;
            }
        } else {
            return fileContent;
        }
    }

    parseChunkOptions(optionsString: string): { [key: string]: string } {
        const options: { [key: string]: string } = {};
        
        const cleanOptions = optionsString.replace(/^[rR]\s*/, '');
        
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

    getChunksByLanguage(chunks: RMarkdownChunk[], language: string): RMarkdownChunk[] {
        return chunks.filter(chunk => chunk.language.toLowerCase() === language.toLowerCase());
    }

    getChunkByLabel(chunks: RMarkdownChunk[], label: string): RMarkdownChunk | undefined {
        return chunks.find(chunk => chunk.label === label);
    }

    combineRChunkCode(chunks: RMarkdownChunk[]): string {
        const rChunks = this.getChunksByLanguage(chunks, 'r');
        return rChunks.map(chunk => chunk.code).join('\n\n');
    }
}
