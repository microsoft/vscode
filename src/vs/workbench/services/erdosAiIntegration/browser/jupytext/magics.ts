/**
 * Escape Jupyter magics when converting to other formats
 * Converted from src/jupytext/magics.py
 */

import { _COMMENT, SCRIPT_EXTENSIONS, usualLanguageName } from './languages.js';
import { StringParser } from './stringParser.js';

// Utility function (lines 9-11)
function getComment(ext: string): string {
    return escapeRegex(SCRIPT_EXTENSIONS[ext]?.comment || "#");
}

// Magic regex patterns (lines 14-71)
const _MAGIC_RE: Record<string, RegExp> = {};
const _MAGIC_FORCE_ESC_RE: Record<string, RegExp> = {};
const _MAGIC_NOT_ESC_RE: Record<string, RegExp> = {};

// Initialize magic patterns for all script extensions
for (const ext in SCRIPT_EXTENSIONS) {
    const language = SCRIPT_EXTENSIONS[ext].language;
    const comment = getComment(ext);
    
    _MAGIC_RE[language] = new RegExp(
        `^\\s*(${comment} |${comment})*(%|%%|%%%)[a-zA-Z]`
    );
    _MAGIC_FORCE_ESC_RE[language] = new RegExp(
        `^\\s*(${comment} |${comment})*(%|%%|%%%)[a-zA-Z](.*)${comment}\\s*escape`
    );
    _MAGIC_NOT_ESC_RE[language] = new RegExp(
        `^\\s*(${comment} |${comment})*(%|%%|%%%)[a-zA-Z](.*)${comment}\\s*noescape`
    );
}

const _LINE_CONTINUATION_RE = /.*\\\s*$/;

// Rust magics start with single ':' #351 (lines 34-37)
_MAGIC_RE["rust"] = /^(\/\/ |\/\/)*:[a-zA-Z]/;
_MAGIC_FORCE_ESC_RE["rust"] = /^(\/\/ |\/\/)*:[a-zA-Z](.*)\/\/\s*escape/;
_MAGIC_NOT_ESC_RE["rust"] = /^(\/\/ |\/\/)*:[a-zA-Z](.*)\/\/\s*noescape/;

// C# magics start with '#!' (lines 39-42)
_MAGIC_RE["csharp"] = /^(\/\/ |\/\/)*#![a-zA-Z]/;
_MAGIC_FORCE_ESC_RE["csharp"] = /^(\/\/ |\/\/)*#![a-zA-Z](.*)\/\/\s*escape/;
_MAGIC_NOT_ESC_RE["csharp"] = /^(\/\/ |\/\/)*#![a-zA-Z](.*)\/\/\s*noescape/;

// Go magics might start with % or ! or !* (lines 44-46)
_MAGIC_RE["go"] = /^(\/\/ |\/\/)*(!|!\*|%|%%|%%%)[a-zA-Z]/;

// Commands starting with a question or exclamation mark have to be escaped (line 49)
const _PYTHON_HELP_OR_BASH_CMD = /^\s*(# |#)*\s*(\?|!)\s*[A-Za-z\.\~\$\\\/\{\}]/;

// A bash command not followed by an equal sign or a parenthesis is a magic command (lines 52-62)
const bashCommands = [
    // posix
    "cat", "cd", "cp", "mv", "rm", "rmdir", "mkdir",
    // windows
    "copy", "ddir", "echo", "ls", "ldir", "mkdir", "ren", "rmdir"
];
const _PYTHON_MAGIC_CMD = new RegExp(
    `^(# |#)*(${bashCommands.join("|")})($|\\s$|\\s[^=,])`
);

// Python help commands end with ? (line 64)
const _IPYTHON_MAGIC_HELP = /^\s*(# )*[^\s]*\?\s*$/;

// Python magic assignments (lines 66-68)
const _PYTHON_MAGIC_ASSIGN = /^(# |#)*\s*([a-zA-Z_][a-zA-Z_$0-9]*)\s*=\s*(%|%%|%%%|!)[a-zA-Z](.*)/;

// Script languages (line 70)
const _SCRIPT_LANGUAGES = Object.values(SCRIPT_EXTENSIONS).map(ext => ext.language);

// Core functions (lines 73-167)

export function isMagic(
    line: string, 
    language: string, 
    globalEscapeFlag: boolean = true, 
    explicitlyCode: boolean = false
): boolean {
    /**
     * Is the current line a (possibly escaped) Jupyter magic, and should it be commented?
     */
    language = usualLanguageName(language);
    
    if (["octave", "matlab", "sas", "logtalk"].includes(language) || 
        !_SCRIPT_LANGUAGES.includes(language)) {
        return false;
    }
    
    if (_MAGIC_FORCE_ESC_RE[language]?.test(line)) {
        return true;
    }
    
    if (!globalEscapeFlag || _MAGIC_NOT_ESC_RE[language]?.test(line)) {
        return false;
    }
    
    if (_MAGIC_RE[language]?.test(line)) {
        return true;
    }
    
    if (language !== "python") {
        return false;
    }
    
    if (_PYTHON_HELP_OR_BASH_CMD.test(line)) {
        return true;
    }
    
    if (_PYTHON_MAGIC_ASSIGN.test(line)) {
        return true;
    }
    
    if (explicitlyCode && _IPYTHON_MAGIC_HELP.test(line)) {
        return true;
    }
    
    return _PYTHON_MAGIC_CMD.test(line);
}

export function needExplicitMarker(
    source: string[], 
    language: string = "python", 
    globalEscapeFlag: boolean = true, 
    explicitlyCode: boolean = true
): boolean {
    /**
     * Does this code needs an explicit cell marker?
     */
    if (language !== "python" || !globalEscapeFlag || !explicitlyCode) {
        return false;
    }

    const parser = new StringParser(language);
    for (const line of source) {
        if (!parser.isQuoted() && 
            isMagic(line, language, globalEscapeFlag, explicitlyCode)) {
            if (!isMagic(line, language, globalEscapeFlag, false)) {
                return true;
            }
        }
        parser.readLine(line);
    }
    return false;
}

export function commentMagic(
    source: string[], 
    language: string = "python", 
    globalEscapeFlag: boolean = true, 
    explicitlyCode: boolean = true
): string[] {
    /**
     * Escape Jupyter magics with '# '
     */
    const parser = new StringParser(language);
    let nextIsMagic = false;
    
    for (let pos = 0; pos < source.length; pos++) {
        const line = source[pos];
        if (!parser.isQuoted() && 
            (nextIsMagic || isMagic(line, language, globalEscapeFlag, explicitlyCode))) {
            
            let unindented: string;
            let indent: string;
            
            if (nextIsMagic) {
                // this is the continuation line of a magic command on the previous line,
                // so we don't want to indent the comment
                unindented = line;
                indent = "";
            } else {
                unindented = line.trimStart();
                indent = line.slice(0, line.length - unindented.length);
            }
            
            source[pos] = indent + _COMMENT[language] + " " + unindented;
            nextIsMagic = language === "python" && _LINE_CONTINUATION_RE.test(line);
        }
        parser.readLine(line);
    }
    return source;
}

function unesc(line: string, language: string): string {
    /**
     * Uncomment once a commented line
     */
    const comment = _COMMENT[language];
    const unindented = line.trimStart();
    const indent = line.slice(0, line.length - unindented.length);
    
    if (unindented.startsWith(comment + " ")) {
        return indent + unindented.slice(comment.length + 1);
    }
    if (unindented.startsWith(comment)) {
        return indent + unindented.slice(comment.length);
    }
    return line;
}

export function uncommentMagic(
    source: string[], 
    language: string = "python", 
    globalEscapeFlag: boolean = true, 
    explicitlyCode: boolean = true
): string[] {
    /**
     * Unescape Jupyter magics
     */
    const parser = new StringParser(language);
    let nextIsMagic = false;
    
    for (let pos = 0; pos < source.length; pos++) {
        const line = source[pos];
        if (!parser.isQuoted() && 
            (nextIsMagic || isMagic(line, language, globalEscapeFlag, explicitlyCode))) {
            source[pos] = unesc(line, language);
            nextIsMagic = language === "python" && _LINE_CONTINUATION_RE.test(line);
        }
        parser.readLine(line);
    }
    return source;
}

// Code start patterns (lines 170-181)
const _ESCAPED_CODE_START: Record<string, RegExp> = {
    ".Rmd": /^(# |#)*```{.*}/,
    ".md": /^(# |#)*```/,
    ".markdown": /^(# |#)*```/
};

// Add patterns for script extensions
for (const ext in SCRIPT_EXTENSIONS) {
    const comment = getComment(ext);
    _ESCAPED_CODE_START[ext] = new RegExp(
        `^(${comment} |${comment})*(${comment}|${comment} )\\+`
    );
}

export function isEscapedCodeStart(line: string, ext: string): boolean {
    /**
     * Is the current line a possibly commented code start marker?
     */
    return _ESCAPED_CODE_START[ext]?.test(line) || false;
}

export function escapeCodeStart(
    source: string[], 
    ext: string, 
    language: string | null = "python"
): string[] {
    /**
     * Escape code start with '# '
     */
    const parser = new StringParser(language);
    
    for (let pos = 0; pos < source.length; pos++) {
        const line = source[pos];
        if (!parser.isQuoted() && isEscapedCodeStart(line, ext)) {
            const comment = SCRIPT_EXTENSIONS[ext]?.comment || "#";
            source[pos] = comment + " " + line;
        }
        parser.readLine(line);
    }
    return source;
}

export function unescapeCodeStart(
    source: string[], 
    ext: string, 
    language: string = "python"
): string[] {
    /**
     * Unescape code start
     */
    const parser = new StringParser(language);
    
    for (let pos = 0; pos < source.length; pos++) {
        const line = source[pos];
        if (!parser.isQuoted() && isEscapedCodeStart(line, ext)) {
            const unescaped = unesc(line, language);
            // don't remove comment char if we break the code start...
            if (isEscapedCodeStart(unescaped, ext)) {
                source[pos] = unescaped;
            }
        }
        parser.readLine(line);
    }
    return source;
}

// Utility function for regex escaping
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

