/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IOutputLimiter } from '../common/outputLimiter.js';

export class OutputLimiter extends Disposable implements IOutputLimiter {
    readonly _serviceBrand: undefined;

    constructor() {
        super();
    }

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
            lines = [...outputText];
        }

        const totalLength = lines.reduce((sum, line) => sum + line.length, 0);

        if (totalLength > maxTotalChars) {
            if (lines.length > maxLines) {
                const totalLines = lines.length;
                const linesPerSide = Math.floor((maxLines - 1) / 2);

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

            return [...headerPart, ...limitedContent].join('\n');
        } else {
            const limitedLines = this.limitOutputText(fileLines, 50000, 250, 200);
            return limitedLines.join('\n');
        }
    }

    limitConsoleOutput(output: string): string {
        const lines = output.split('\n');
        const limitedLines = this.limitOutputText(lines, 8000, 40, 150);
        return limitedLines.join('\n');
    }

    limitSearchResults(results: string, maxMatches: number = 50): string {
        const lines = results.split('\n').filter(line => line.trim() !== '');
        
        if (lines.length <= maxMatches) {
            return results;
        }

        const limitedLines = lines.slice(0, maxMatches);
        const truncationMessage = `\n...[Results truncated. Showing first ${maxMatches} matches out of ${lines.length} total matches. Please refine your search to see more specific results.]`;
        
        return limitedLines.join('\n') + truncationMessage;
    }



    smartTruncate(text: string, maxLength: number, suffix: string = '...'): string {
        if (text.length <= maxLength) {
            return text;
        }

        const truncateAt = maxLength - suffix.length;
        
        const breakPoint = this.findGoodBreakPoint(text, truncateAt);
        
        if (breakPoint > truncateAt * 0.8) {
            return text.substring(0, breakPoint).trim() + suffix;
        } else {
            return text.substring(0, truncateAt).trim() + suffix;
        }
    }

    private findGoodBreakPoint(text: string, maxLength: number): number {
        const breakChars = [' ', ',', '.', ';', ':', '!', '?', ')', ']', '}', '\n', '\t'];
        
        for (let i = maxLength; i >= maxLength * 0.8; i--) {
            if (breakChars.includes(text[i])) {
                return i;
            }
        }
        
        return maxLength;
    }

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
