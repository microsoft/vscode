/**
 * Convert between text notebook metadata and jupyter cell metadata.
 * 
 * Standard cell metadata are documented here:
 * See also https://ipython.org/ipython-doc/3/notebook/nbformat.html#cell-metadata
 * Converted from src/jupytext/cell_metadata.py
 */

import { _JUPYTER_LANGUAGES } from './languages.js';

// Map R Markdown's "echo", "results" and "include" to "hide_input" and "hide_output", that are understood by the
// `runtools` extension for Jupyter notebook, and by nbconvert (use the `hide_input_output.tpl` template).
// See http://jupyter-contrib-nbextensions.readthedocs.io/en/latest/nbextensions/runtools/readme.html
const _RMARKDOWN_TO_RUNTOOLS_OPTION_MAP: [string[], [string, boolean][]][] = [
    [["include", "FALSE"], [["hide_input", true], ["hide_output", true]]],
    [["echo", "FALSE"], [["hide_input", true]]],
    [["results", "'hide'"], [["hide_output", true]]],
    [["results", '"hide"'], [["hide_output", true]]],
];

// Alternatively, Jupytext can also map the Jupyter Book options to R Markdown
const _RMARKDOWN_TO_JUPYTER_BOOK_MAP: [string[], string][] = [
    [["include", "FALSE"], "remove_cell"],
    [["echo", "FALSE"], "remove_input"],
    [["results", "'hide'"], "remove_output"],
    [["results", '"hide"'], "remove_output"],
];

export const _JUPYTEXT_CELL_METADATA = [
    // Pre-jupytext metadata
    "skipline",
    "noskipline",
    // Jupytext metadata
    "cell_marker",
    "lines_to_next_cell",
    "lines_to_end_of_cell_marker",
];

export const _IGNORE_CELL_METADATA = [
    // Frequent cell metadata that should not enter the text representation
    // (these metadata are preserved in the paired Jupyter notebook).
    "autoscroll",
    "collapsed",
    "scrolled",
    "trusted",
    "execution",
    "ExecuteTime",
    ..._JUPYTEXT_CELL_METADATA
].map(name => `-${name}`).join(",");

// In R Markdown we might have options without a value
const _IS_IDENTIFIER = /^[a-zA-Z_\.]+[a-zA-Z0-9_\.]*$/;
const _IS_VALID_METADATA_KEY = /^[a-zA-Z0-9_\.-]+$/;

// Error classes (lines 65-71)
export class RLogicalValueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RLogicalValueError';
    }
}

export class RMarkdownOptionParsingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RMarkdownOptionParsingError';
    }
}

function _pyLogicalValues(rbool: string): boolean {
    if (rbool === "TRUE" || rbool === "T") {
        return true;
    }
    if (rbool === "FALSE" || rbool === "F") {
        return false;
    }
    throw new RLogicalValueError(`Invalid R logical value: ${rbool}`);
}

export function metadataToRmdOptions(
    language: string | null, 
    metadata: Record<string, any>, 
    useRuntools: boolean = false
): string {
    /**
     * Convert language and metadata information to their rmd representation
     */
    let options = (language || "R").toLowerCase();
    
    if ("name" in metadata) {
        options += " " + metadata.name + ",";
        delete metadata.name;
    }
    
    if (useRuntools) {
        for (const [rmdOption, jupyterOptions] of _RMARKDOWN_TO_RUNTOOLS_OPTION_MAP) {
            if (jupyterOptions.every(([optName, optValue]) => metadata[optName] === optValue)) {
                options += ` ${rmdOption[0]}=${rmdOption[1] === "FALSE" ? "FALSE" : rmdOption[1]},`;
                for (const [optName] of jupyterOptions) {
                    delete metadata[optName];
                }
            }
        }
    } else {
        for (const [rmdOption, tag] of _RMARKDOWN_TO_JUPYTER_BOOK_MAP) {
            if (metadata.tags?.includes(tag)) {
                options += ` ${rmdOption[0]}=${rmdOption[1] === "FALSE" ? "FALSE" : rmdOption[1]},`;
                metadata.tags = metadata.tags.filter((t: string) => t !== tag);
                if (metadata.tags.length === 0) {
                    delete metadata.tags;
                }
            }
        }
    }
    
    for (const optName in metadata) {
        const optValue = metadata[optName];
        const trimmedOptName = optName.trim();
        
        if (trimmedOptName === "active") {
            options += ` ${trimmedOptName}="${String(optValue)}",`;
        } else if (typeof optValue === 'boolean') {
            options += ` ${trimmedOptName}=${optValue ? "TRUE" : "FALSE"},`;
        } else if (Array.isArray(optValue)) {
            const rList = `c(${optValue.map(v => `"${String(v)}"`).join(", ")})`;
            options += ` ${trimmedOptName}=${rList},`;
        } else if (typeof optValue === 'string') {
            if (optValue.startsWith("#R_CODE#")) {
                options += ` ${trimmedOptName}=${optValue.slice(8)},`;
            } else if (!optValue.includes('"')) {
                options += ` ${trimmedOptName}="${optValue}",`;
            } else {
                options += ` ${trimmedOptName}='${optValue}',`;
            }
        } else {
            options += ` ${trimmedOptName}=${String(optValue)},`;
        }
    }
    
    if (!language) {
        options = options.slice(2);
    }
    
    return options.replace(/,$/, '').trim();
}

export function updateMetadataFromRmdOptions(
    name: string, 
    value: string, 
    metadata: Record<string, any>, 
    useRuntools: boolean = false
): boolean {
    /**
     * Map the R Markdown cell visibility options to the Jupyter ones
     */
    if (useRuntools) {
        for (const [rmdOption, jupyterOptions] of _RMARKDOWN_TO_RUNTOOLS_OPTION_MAP) {
            if (name === rmdOption[0] && value === rmdOption[1]) {
                for (const [optName, optValue] of jupyterOptions) {
                    metadata[optName] = optValue;
                }
                return true;
            }
        }
    } else {
        for (const [rmdOption, tag] of _RMARKDOWN_TO_JUPYTER_BOOK_MAP) {
            if (name === rmdOption[0] && value === rmdOption[1]) {
                if (!metadata.tags) {
                    metadata.tags = [];
                }
                metadata.tags.push(tag);
                return true;
            }
        }
    }
    return false;
}

export class ParsingContext {
    /**
     * Class for determining where to split rmd options
     */
    parenthesisCount = 0;
    curlyBracketCount = 0;
    squareBracketCount = 0;
    inSingleQuote = false;
    inDoubleQuote = false;
    line: string;

    constructor(line: string) {
        this.line = line;
    }

    inGlobalExpression(): boolean {
        /**
         * Currently inside an expression
         */
        return (
            this.parenthesisCount === 0 &&
            this.curlyBracketCount === 0 &&
            this.squareBracketCount === 0 &&
            !this.inSingleQuote &&
            !this.inDoubleQuote
        );
    }

    countSpecialChars(char: string, prevChar: string): void {
        /**
         * Update parenthesis counters
         */
        if (char === "(") {
            this.parenthesisCount += 1;
        } else if (char === ")") {
            this.parenthesisCount -= 1;
            if (this.parenthesisCount < 0) {
                throw new RMarkdownOptionParsingError(
                    `Option line "${this.line}" has too many closing parentheses`
                );
            }
        } else if (char === "{") {
            this.curlyBracketCount += 1;
        } else if (char === "}") {
            this.curlyBracketCount -= 1;
            if (this.curlyBracketCount < 0) {
                throw new RMarkdownOptionParsingError(
                    `Option line "${this.line}" has too many closing curly brackets`
                );
            }
        } else if (char === "[") {
            this.squareBracketCount += 1;
        } else if (char === "]") {
            this.squareBracketCount -= 1;
            if (this.squareBracketCount < 0) {
                throw new RMarkdownOptionParsingError(
                    `Option line "${this.line}" has too many closing square brackets`
                );
            }
        } else if (char === "'" && prevChar !== "\\" && !this.inDoubleQuote) {
            this.inSingleQuote = !this.inSingleQuote;
        } else if (char === '"' && prevChar !== "\\" && !this.inSingleQuote) {
            this.inDoubleQuote = !this.inDoubleQuote;
        }
    }
}

export function parseRmdOptions(line: string): [string, string][] {
    /**
     * Given a R markdown option line, returns a list of pairs name,value
     */
    const parsingContext = new ParsingContext(line);
    const result: [string, string][] = [];
    let prevChar = "";
    let name = "";
    let value = "";

    for (const char of "," + line + ",") {
        if (parsingContext.inGlobalExpression()) {
            if (char === ",") {
                if (name !== "" || value !== "") {
                    if (result.length > 0 && name === "") {
                        throw new RMarkdownOptionParsingError(
                            `Option line "${line}" has no name for option value ${value}`
                        );
                    }
                    result.push([name.trim(), value.trim()]);
                    name = "";
                    value = "";
                }
            } else if (char === "=") {
                if (name === "") {
                    name = value;
                    value = "";
                } else {
                    value += char;
                }
            } else {
                parsingContext.countSpecialChars(char, prevChar);
                value += char;
            }
        } else {
            parsingContext.countSpecialChars(char, prevChar);
            value += char;
        }
        prevChar = char;
    }

    if (!parsingContext.inGlobalExpression()) {
        throw new RMarkdownOptionParsingError(
            `Option line "${line}" is not properly terminated`
        );
    }

    return result;
}

export function rmdOptionsToMetadata(
    options: string, 
    useRuntools: boolean = false
): [string, Record<string, any>] {
    /**
     * Parse rmd options and return a metadata dictionary
     */
    let optionsParts = options.split(/\s|,/, 2);
    
    // Special case Wolfram Language, which sadly has a space in the language name.
    if (optionsParts.length >= 2 && optionsParts[0] === "wolfram" && optionsParts[1] === "language") {
        optionsParts = ["wolfram language"];
        if (options.length > "wolfram language".length) {
            optionsParts.push(options.slice("wolfram language".length + 1));
        }
    }
    
    let language: string;
    let chunkOptions: [string, string][];
    
    if (optionsParts.length === 1) {
        language = optionsParts[0];
        chunkOptions = [];
    } else {
        language = optionsParts[0].replace(/[ ,]+$/, '');
        const others = optionsParts[1].replace(/^[ ,]+/, '');
        chunkOptions = parseRmdOptions(others);
    }

    language = language === "r" ? "R" : language;
    const metadata: Record<string, any> = {};
    
    for (let i = 0; i < chunkOptions.length; i++) {
        const [name, value] = chunkOptions[i];
        if (i === 0 && name === "") {
            metadata.name = value;
            continue;
        }
        if (updateMetadataFromRmdOptions(name, value, metadata, useRuntools)) {
            continue;
        }
        try {
            metadata[name] = _pyLogicalValues(value);
            continue;
        } catch (error) {
            if (error instanceof RLogicalValueError) {
                metadata[name] = value;
            } else {
                throw error;
            }
        }
    }

    for (const name in metadata) {
        tryEvalMetadata(metadata, name);
    }

    if ("eval" in metadata && !isActive(".Rmd", metadata)) {
        delete metadata.eval;
    }

    return [metadata.language || language, metadata];
}

export function tryEvalMetadata(metadata: Record<string, any>, name: string): void {
    /**
     * Evaluate the metadata to a python object, if possible
     */
    const value = metadata[name];
    if (typeof value !== 'string') {
        return;
    }
    
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
        metadata[name] = value.slice(1, -1);
        return;
    }
    
    let processedValue = value;
    if (value.startsWith("c(") && value.endsWith(")")) {
        processedValue = "[" + value.slice(2, -1) + "]";
    } else if (value.startsWith("list(") && value.endsWith(")")) {
        processedValue = "[" + value.slice(5, -1) + "]";
    }
    
    try {
        // Simple literal evaluation - only handles basic JSON-like structures
        metadata[name] = JSON.parse(processedValue);
    } catch (error) {
        if (name !== "name") {
            metadata[name] = "#R_CODE#" + value;
        }
    }
}

export function isActive(ext: string, metadata: Record<string, any>, defaultValue: boolean = true): boolean {
    /**
     * Is the cell active for the given file extension?
     */
    if (metadata.run_control?.frozen === true) {
        return ext === ".ipynb";
    }
    
    for (const tag of metadata.tags || []) {
        if (tag.startsWith("active-")) {
            return tag.split("-").includes(ext.replace(".", ""));
        }
    }
    
    if (!("active" in metadata)) {
        return defaultValue;
    }
    
    return metadata.active.split(/[.,]/).includes(ext.replace(".", ""));
}

export function metadataToDoublePercentOptions(
    metadata: Record<string, any>, 
    plainJson: boolean
): string {
    /**
     * Metadata to double percent lines
     */
    const text: string[] = [];
    
    if ("title" in metadata) {
        text.push(metadata.title);
        delete metadata.title;
    }
    
    if ("cell_depth" in metadata) {
        text.unshift("%".repeat(metadata.cell_depth));
        delete metadata.cell_depth;
    }
    
    if ("cell_type" in metadata) {
        const regionName = metadata.region_name || metadata.cell_type;
        text.push(`[${regionName}]`);
        delete metadata.region_name;
        delete metadata.cell_type;
    }
    
    return metadataToText(text.join(" "), metadata, plainJson);
}

export function incorrectlyEncodedMetadata(text: string): Record<string, any> {
    /**
     * Encode a text that Jupytext cannot parse as a cell metadata
     */
    return { incorrectly_encoded_metadata: text };
}

export function isIdentifier(text: string): boolean {
    return _IS_IDENTIFIER.test(text);
}

export function isValidMetadataKey(text: string): boolean {
    /**
     * Can this text be a proper key?
     */
    return _IS_VALID_METADATA_KEY.test(text);
}

export function isJupyterLanguage(language: string): boolean {
    /**
     * Is this a jupyter language?
     */
    for (const lang of _JUPYTER_LANGUAGES) {
        if (language.toLowerCase() === lang.toLowerCase()) {
            return true;
        }
    }
    return false;
}

export function parseKeyEqualValue(text: string): Record<string, any> {
    /**
     * Parse a string of the form 'key1=value1 key2=value2'
     */
    // Empty metadata?
    text = text.trim();
    if (!text) {
        return {};
    }

    const lastSpacePos = text.lastIndexOf(" ");

    // Just an identifier?
    if (!text.startsWith("--") && isIdentifier(text.slice(lastSpacePos + 1))) {
        const key = text.slice(lastSpacePos + 1);
        const result: Record<string, any> = { [key]: null };
        if (lastSpacePos > 0) {
            Object.assign(result, parseKeyEqualValue(text.slice(0, lastSpacePos)));
        }
        return result;
    }

    // Iterate on the '=' signs, starting from the right
    let equalSignPos: number | undefined = undefined;
    while (true) {
        equalSignPos = text.lastIndexOf("=", equalSignPos === undefined ? undefined : equalSignPos - 1);
        if (equalSignPos < 0) {
            return incorrectlyEncodedMetadata(text);
        }

        // Do we have an identifier on the left of the equal sign?
        const prevWhitespace = text.slice(0, equalSignPos).trimEnd().lastIndexOf(" ");
        const key = text.slice(prevWhitespace + 1, equalSignPos).trim();
        if (!isValidMetadataKey(key)) {
            continue;
        }

        try {
            const value = relaxJsonLoads(text.slice(equalSignPos + 1));
            
            // Combine with remaining metadata
            const metadata = prevWhitespace > 0 ? parseKeyEqualValue(text.slice(0, prevWhitespace)) : {};
            
            // Append our value
            metadata[key] = value;
            
            // And return
            return metadata;
        } catch (error) {
            // try with a longer expression
            continue;
        }
    }
}

export function relaxJsonLoads(text: string, catchErrors: boolean = false): any {
    /**
     * Parse a JSON string or similar
     */
    text = text.trim();
    try {
        return JSON.parse(text);
    } catch (error) {
        // JSON parsing failed
    }

    if (!catchErrors) {
        // Simple literal evaluation for basic cases
        try {
            return JSON.parse(text);
        } catch (error) {
            // Try some simple transformations
            if (text === "true" || text === "True") return true;
            if (text === "false" || text === "False") return false;
            if (text === "null" || text === "None") return null;
            if (/^-?\d+$/.test(text)) return parseInt(text, 10);
            if (/^-?\d*\.\d+$/.test(text)) return parseFloat(text);
            throw new SyntaxError(`Cannot parse: ${text}`);
        }
    }

    try {
        // Try some simple transformations
        if (text === "true" || text === "True") return true;
        if (text === "false" || text === "False") return false;
        if (text === "null" || text === "None") return null;
        if (/^-?\d+$/.test(text)) return parseInt(text, 10);
        if (/^-?\d*\.\d+$/.test(text)) return parseFloat(text);
        return JSON.parse(text);
    } catch (error) {
        // All parsing failed
    }

    return incorrectlyEncodedMetadata(text);
}

export function isJsonMetadata(text: string): boolean {
    /**
     * Is this a JSON metadata?
     */
    const firstCurlyBracket = text.indexOf("{");
    if (firstCurlyBracket < 0) {
        return false;
    }

    const firstEqualSign = text.indexOf("=");
    if (firstEqualSign < 0) {
        return true;
    }

    return firstCurlyBracket < firstEqualSign;
}

export function textToMetadata(text: string, allowTitle: boolean = false): [string, Record<string, any>] {
    /**
     * Parse the language/cell title and associated metadata
     */
    // Parse the language or cell title = everything before the last blank space before { or =
    text = text.trim();
    const firstCurlyBracket = text.indexOf("{");
    const firstEqualSign = text.indexOf("=");

    if (firstCurlyBracket < 0 || (firstEqualSign >= 0 && firstEqualSign < firstCurlyBracket)) {
        // this is a key=value metadata line
        // case one = the options may be preceded with a language
        if (!allowTitle) {
            if (isJupyterLanguage(text)) {
                return [text, {}];
            }
            if (!text.includes(" ")) {
                return ["", parseKeyEqualValue(text)];
            }
            const spaceIndex = text.indexOf(" ");
            const language = text.slice(0, spaceIndex);
            const options = text.slice(spaceIndex + 1);
            if (isJupyterLanguage(language)) {
                return [language, parseKeyEqualValue(options)];
            }
            return ["", parseKeyEqualValue(text)];
        }

        // case two = a title may be before the options
        // we split the title into words
        let words: string[];
        if (firstEqualSign >= 0) {
            words = text.slice(0, firstEqualSign).split(" ");
            // last word is the key before the equal sign!
            while (words.length > 0 && !words[words.length - 1]) {
                words.pop();
            }
            if (words.length > 0) {
                words.pop();
            }
        } else {
            words = text.split(" ");
        }

        // and we remove words on the right that are attributes (they start with '.')
        while (words.length > 0 && (!words[words.length - 1].trim() || words[words.length - 1].startsWith("."))) {
            words.pop();
        }

        const title = words.join(" ");
        return [title, parseKeyEqualValue(text.slice(title.length))];
    }

    // json metadata line
    return [
        text.slice(0, firstCurlyBracket).trim(),
        relaxJsonLoads(text.slice(firstCurlyBracket), true),
    ];
}

export function metadataToText(
    languageOrTitle: string | null, 
    metadata: Record<string, any> = {}, 
    plainJson: boolean = false
): string {
    /**
     * Write the cell metadata in the format key=value
     */
    // Filter out jupytext-specific metadata
    const filteredMetadata: Record<string, any> = {};
    for (const key in metadata) {
        if (!_JUPYTEXT_CELL_METADATA.includes(key)) {
            filteredMetadata[key] = metadata[key];
        }
    }
    
    const text: string[] = [];
    if (languageOrTitle) {
        text.push(languageOrTitle);
    }
    
    if (languageOrTitle === null) {
        if ("title" in filteredMetadata && 
            !filteredMetadata.title.includes("{") && 
            !filteredMetadata.title.includes("=")) {
            text.push(filteredMetadata.title);
            delete filteredMetadata.title;
        }
    }

    if (plainJson) {
        if (Object.keys(filteredMetadata).length > 0) {
            text.push(JSON.stringify(filteredMetadata));
        }
    } else {
        for (const key in filteredMetadata) {
            if (key === "incorrectly_encoded_metadata") {
                text.push(filteredMetadata[key]);
            } else if (filteredMetadata[key] === null) {
                text.push(key);
            } else {
                text.push(`${key}=${JSON.stringify(filteredMetadata[key])}`);
            }
        }
    }
    
    return text.join(" ");
}
