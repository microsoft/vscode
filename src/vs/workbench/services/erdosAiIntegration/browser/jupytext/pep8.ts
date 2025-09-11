/**
 * Determine how many blank lines should be inserted between two cells
 * Converted from src/jupytext/pep8.py
 */

import { StringParser } from './stringParser.js';

// Utility functions (lines 5-87)

function nextInstructionIsFunctionOrClass(lines: string[]): boolean {
    /**
     * Is the first non-empty, non-commented line of the cell either a function or a class?
     */
    const parser = new StringParser("python");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (parser.isQuoted()) {
            parser.readLine(line);
            continue;
        }
        parser.readLine(line);
        
        if (!line.trim()) { // empty line
            if (i > 0 && !lines[i - 1].trim()) {
                return false;
            }
            continue;
        }
        
        if (line.startsWith("def ") ||
            line.startsWith("async ") ||
            line.startsWith("class ")) {
            return true;
        }
        
        if (line.startsWith("#") || 
            line.startsWith("@") || 
            line.startsWith(" ") || 
            line.startsWith(")")) {
            continue;
        }
        
        return false;
    }

    return false;
}

function cellEndsWithFunctionOrClass(lines: string[]): boolean {
    /**
     * Does the last line of the cell belong to an indented code?
     */
    const nonQuotedLines: string[] = [];
    const parser = new StringParser("python");
    
    for (const line of lines) {
        if (!parser.isQuoted()) {
            nonQuotedLines.push(line);
        }
        parser.readLine(line);
    }

    // find the first line, starting from the bottom, that is not indented
    const reversedLines = [...nonQuotedLines].reverse();
    for (let i = 0; i < reversedLines.length; i++) {
        const line = reversedLines[i];
        
        if (!line.trim()) {
            // two blank lines? we won't need to insert more blank lines below this cell
            if (i > 0 && !reversedLines[i - 1].trim()) {
                return false;
            }
            continue;
        }
        
        if (line.startsWith("#") || 
            line.startsWith(" ") || 
            line.startsWith(")")) {
            continue;
        }
        
        if (line.startsWith("def ") ||
            line.startsWith("async ") ||
            line.startsWith("class ")) {
            return true;
        }
        
        return false;
    }

    return false;
}

function cellEndsWithCode(lines: string[]): boolean {
    /**
     * Is the last line of the cell a line with code?
     */
    if (lines.length === 0) {
        return false;
    }
    
    if (!lines[lines.length - 1].trim()) {
        return false;
    }
    
    if (lines[lines.length - 1].startsWith("#")) {
        return false;
    }
    
    return true;
}

function cellHasCode(lines: string[]): boolean {
    /**
     * Is there any code in this cell?
     */
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const strippedLine = line.trim();
        
        if (strippedLine.startsWith("#")) {
            continue;
        }

        // Two consecutive blank lines?
        if (!strippedLine) {
            if (i > 0 && !lines[i - 1].trim()) {
                return false;
            }
            continue;
        }

        return true;
    }

    return false;
}

// Main function (lines 89-103)

export function pep8LinesBetweenCells(
    prevLines: string[], 
    nextLines: string[], 
    ext: string
): number {
    /**
     * How many blank lines should be added between the two python paragraphs to make them pep8?
     */
    if (nextLines.length === 0) {
        return 1;
    }
    
    if (prevLines.length === 0) {
        return 0;
    }
    
    if (ext !== ".py") {
        return 1;
    }
    
    if (cellEndsWithFunctionOrClass(prevLines)) {
        return cellHasCode(nextLines) ? 2 : 1;
    }
    
    if (cellEndsWithCode(prevLines) && nextInstructionIsFunctionOrClass(nextLines)) {
        return 2;
    }
    
    return 1;
}

