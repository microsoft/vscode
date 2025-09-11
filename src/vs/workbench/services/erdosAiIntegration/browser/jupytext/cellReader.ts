/**
 * Read notebook cells from their text representation
 * Converted from src/jupytext/cell_reader.py
 */

import { newCodeCell, newMarkdownCell, newRawCell, CellNode } from './types.js';
import { SCRIPT_EXTENSIONS } from './languages.js';
import { 
    isActive, 
    isJsonMetadata, 
    rmdOptionsToMetadata, 
    textToMetadata 
} from './cellMetadata.js';
import { _JUPYTER_LANGUAGES_LOWER_AND_UPPER } from './languages.js';
import { isMagic, needExplicitMarker, uncommentMagic, unescapeCodeStart } from './magics.js';
import { pep8LinesBetweenCells } from './pep8.js';
import { StringParser } from './stringParser.js';

// Regex patterns (lines 30-32)
const _BLANK_LINE = /^\s*$/;
const _PY_INDENTED = /^\s/;

// Utility functions (lines 34-105)

export function uncomment(lines: string[], prefix: string = "#", suffix: string = ""): string[] {
    /**
     * Remove prefix and space, or only prefix, when possible
     */
    let result = [...lines];
    
    if (prefix) {
        const prefixAndSpace = prefix + " ";
        const lengthPrefix = prefix.length;
        const lengthPrefixAndSpace = prefixAndSpace.length;
        result = result.map(line => {
            if (line.startsWith(prefixAndSpace)) {
                return line.slice(lengthPrefixAndSpace);
            } else if (line.startsWith(prefix)) {
                return line.slice(lengthPrefix);
            } else {
                return line;
            }
        });
    }

    if (suffix) {
        const spaceAndSuffix = " " + suffix;
        const lengthSuffix = suffix.length;
        const lengthSpaceAndSuffix = spaceAndSuffix.length;
        result = result.map(line => {
            if (line.endsWith(spaceAndSuffix)) {
                return line.slice(0, -lengthSpaceAndSuffix);
            } else if (line.endsWith(suffix)) {
                return line.slice(0, -lengthSuffix);
            } else {
                return line;
            }
        });
    }

    return result;
}

export function paragraphIsFullyCommented(lines: string[], comment: string, mainLanguage: string): boolean {
    /**
     * Is the paragraph fully commented?
     */
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith(comment)) {
            if (line.slice(comment.length).trimStart().startsWith(comment)) {
                continue;
            }
            if (isMagic(line, mainLanguage)) {
                return false;
            }
            continue;
        }
        return i > 0 && _BLANK_LINE.test(line);
    }
    return true;
}

export function nextCodeIsIndented(lines: string[]): boolean {
    /**
     * Is the next unescaped line indented?
     */
    for (const line of lines) {
        if (_BLANK_LINE.test(line)) {
            continue;
        }
        return _PY_INDENTED.test(line);
    }
    return false;
}

export function countLinesToNextCell(
    cellEndMarker: number, 
    nextCellStart: number, 
    total: number, 
    explicitEoc: boolean
): number {
    /**
     * How many blank lines between end of cell marker and next cell?
     */
    if (cellEndMarker < total) {
        let linesToNextCell = nextCellStart - cellEndMarker;
        if (explicitEoc) {
            linesToNextCell -= 1;
        }
        if (nextCellStart >= total) {
            linesToNextCell += 1;
        }
        return linesToNextCell;
    }
    return 1;
}

export function lastTwoLinesBlank(source: string[]): boolean {
    /**
     * Are the two last lines blank, and not the third last one?
     */
    if (source.length < 3) {
        return false;
    }
    return (
        !_BLANK_LINE.test(source[source.length - 3]) &&
        _BLANK_LINE.test(source[source.length - 2]) &&
        _BLANK_LINE.test(source[source.length - 1])
    );
}

// Base class (lines 107-325)
export abstract class BaseCellReader {
    /**
     * A class that can read notebook cells from their text representation
     */
    defaultCommentMagics: boolean | null = null;
    linesToNextCell: number = 1;

    startCodeRe: RegExp | null = null;
    simpleStartCodeRe: RegExp | null = null;
    endCodeRe: RegExp | null = null;

    // How to make code inactive
    comment: string = "";
    commentSuffix: string = "";

    // Any specific prefix for lines in markdown cells (like in R spin format?)
    markdownPrefix: string | null = null;

    // Instance properties
    ext: string;
    defaultLanguage: string;
    commentMagics: boolean | null;
    useRuntools: boolean;
    formatVersion?: string;
    metadata: Record<string, any> | null = null;
    orgContent: string[] = [];
    content: string[] = [];
    explicitSoc: boolean | null = null;
    explicitEoc: boolean | null = null;
    cellType: string | null = null;
    language: string | null = null;
    cellMetadataJson: boolean = false;
    doxygenEquationMarkers: boolean = false;

    constructor(fmt: Record<string, any> = {}, defaultLanguage?: string) {
        /**
         * Create a cell reader with empty content
         */
        this.ext = fmt.extension || "";
        this.defaultLanguage = defaultLanguage || 
            SCRIPT_EXTENSIONS[this.ext]?.language || "python";
        this.commentMagics = fmt.comment_magics ?? this.defaultCommentMagics;
        this.useRuntools = fmt.use_runtools || false;
        this.formatVersion = fmt.format_version;
        this.cellMetadataJson = fmt.cell_metadata_json || false;
        this.doxygenEquationMarkers = fmt.doxygen_equation_markers || false;
    }

    read(lines: string[]): [CellNode, number] {
        /**
         * Read one cell from the given lines, and return the cell,
         * plus the position of the next cell
         */
        // Do we have an explicit code marker on the first line?
        this.metadataAndLanguageFromOptionLine(lines[0]);

        if (this.metadata && "language" in this.metadata) {
            this.language = this.metadata.language;
            delete this.metadata.language;
        }

        // Parse cell till its end and set content, lines_to_next_cell
        const posNextCell = this.findCellContent(lines);

        let newCell: (source: string, metadata: Record<string, any>) => CellNode;
        if (this.cellType === "code") {
            newCell = newCodeCell;
        } else if (this.cellType === "markdown") {
            newCell = newMarkdownCell;
        } else {
            newCell = newRawCell;
        }

        if (!this.metadata) {
            this.metadata = {};
        }

        let expectedBlankLines: number;
        if (this.ext === ".py") {
            expectedBlankLines = pep8LinesBetweenCells(
                this.orgContent || [""], lines.slice(posNextCell), this.ext
            );
        } else {
            expectedBlankLines = 1;
        }

        if (this.linesToNextCell !== expectedBlankLines) {
            this.metadata.lines_to_next_cell = this.linesToNextCell;
        }

        if (this.language) {
            this.metadata.language = this.language;
        }

        return [
            newCell(this.content.join("\n"), this.metadata),
            posNextCell,
        ];
    }

    metadataAndLanguageFromOptionLine(line: string): void {
        /**
         * Parse code options on the given line. When a start of a code cell
         * is found, self.metadata is set to a dictionary.
         */
        if (this.startCodeRe?.test(line)) {
            const matches = this.startCodeRe.exec(line);
            if (matches) {
                [this.language, this.metadata] = this.optionsToMetadata(matches[1] || matches[0]);
            }
        }
    }

    abstract optionsToMetadata(options: string): [string | null, Record<string, any>];

    abstract findCellEnd(lines: string[]): [number, number, boolean];

    findCellContent(lines: string[]): number {
        /**
         * Parse cell till its end and set content, lines_to_next_cell.
         * Return the position of next cell start
         */
        let [cellEndMarker, nextCellStart, explicitEoc] = this.findCellEnd(lines);
        this.explicitEoc = explicitEoc;

        // Metadata to dict
        let cellStart: number;
        if (this.metadata === null) {
            cellStart = 0;
            this.metadata = {};
        } else {
            cellStart = 1;
        }

        // Cell content
        let source = lines.slice(cellStart, cellEndMarker);
        this.orgContent = [...source];

        // Exactly two empty lines at the end of cell (caused by PEP8)?
        if (this.ext === ".py" && explicitEoc) {
            if (lastTwoLinesBlank(source)) {
                source = source.slice(0, -2);
                const linesToEndOfCellMarker = 2;
                
                const pep8Lines = pep8LinesBetweenCells(
                    source, lines.slice(cellEndMarker), this.ext
                );
                if (linesToEndOfCellMarker !== (pep8Lines === 1 ? 0 : 2)) {
                    this.metadata.lines_to_end_of_cell_marker = linesToEndOfCellMarker;
                }
            }
        }

        // Uncomment content
        this.explicitSoc = cellStart > 0;
        this.content = this.extractContent(source);

        // Is this an inactive cell?
        if (this.cellType === "code") {
            if (!isActive(".ipynb", this.metadata)) {
                if (this.metadata.active === "") {
                    delete this.metadata.active;
                }
                this.cellType = "raw";
            } else if ([".md", ".markdown"].includes(this.ext) && !this.language) {
                // Markdown files in version >= 1.3 represent code chunks with no language as Markdown cells
                if (!["1.0", "1.1"].includes(this.formatVersion || "")) {
                    this.cellType = "markdown";
                    this.explicitEoc = false;
                    cellEndMarker += 1;
                    this.content = lines.slice(0, cellEndMarker);
                } else {
                    // Previous versions mapped those to raw cells
                    this.cellType = "raw";
                }
            }
        }

        // Explicit end of cell marker?
        let adjustedNextCellStart = nextCellStart;
        if (nextCellStart + 1 < lines.length &&
            _BLANK_LINE.test(lines[nextCellStart]) &&
            !_BLANK_LINE.test(lines[nextCellStart + 1])) {
            adjustedNextCellStart += 1;
        } else if (explicitEoc &&
                   nextCellStart + 2 < lines.length &&
                   _BLANK_LINE.test(lines[nextCellStart]) &&
                   _BLANK_LINE.test(lines[nextCellStart + 1]) &&
                   !_BLANK_LINE.test(lines[nextCellStart + 2])) {
            adjustedNextCellStart += 2;
        }

        this.linesToNextCell = countLinesToNextCell(
            cellEndMarker, adjustedNextCellStart, lines.length, explicitEoc
        );

        return adjustedNextCellStart;
    }

    abstract uncommentCodeAndMagics(lines: string[]): string[];

    extractContent(lines: string[]): string[] {
        // Code cells with just a multiline string become Markdown cells
        if (this.ext === ".py" && !isActive(this.ext, this.metadata || {}, this.cellType === "code")) {
            const content = lines.join("\n").trim();
            const prefixes = this.ext !== ".py" ? [""] : ["", "r", "R"];
            
            for (const prefix of prefixes) {
                for (const tripleQuote of ['"""', "'''"]) {
                    const left = prefix + tripleQuote;
                    const right = tripleQuote;
                    if (content.startsWith(left) &&
                        content.endsWith(right) &&
                        content.length >= left.length + right.length) {
                        
                        let extractedContent = content.slice(left.length, -right.length);
                        let leftMarker = left;
                        let rightMarker = right;
                        
                        // Trim first/last line return
                        if (extractedContent.startsWith("\n")) {
                            extractedContent = extractedContent.slice(1);
                            leftMarker = left + "\n";
                        }
                        if (extractedContent.endsWith("\n")) {
                            extractedContent = extractedContent.slice(0, -1);
                            rightMarker = "\n" + right;
                        }

                        if (!prefix) {
                            if (leftMarker.length === rightMarker.length && leftMarker.length === 4) {
                                (this.metadata || {}).cell_marker = leftMarker.slice(0, 3);
                            }
                        } else if (leftMarker.slice(1).length === rightMarker.length && leftMarker.slice(1).length === 4) {
                            (this.metadata || {}).cell_marker = leftMarker.slice(0, 4);
                        } else {
                            (this.metadata || {}).cell_marker = leftMarker + "," + rightMarker;
                        }
                        return extractedContent.split('\n');
                    }
                }
            }
        }

        if (!isActive(this.ext, this.metadata || {}) || 
            (!("active" in (this.metadata || {})) && 
             this.language && 
             this.language !== this.defaultLanguage)) {
            return uncomment(
                lines, 
                this.comment || ([".r", ".R"].includes(this.ext) ? "#" : this.comment)
            );
        }

        return this.uncommentCodeAndMagics(lines);
    }
}

// Markdown cell reader (lines 327-496)
export class MarkdownCellReader extends BaseCellReader {
    /**
     * Read notebook cells from Markdown documents
     */
    override comment = "";
    override startCodeRe: RegExp;
    nonJupyterCodeRe: RegExp = /^```/;
    override endCodeRe: RegExp = /^```\s*$/;
    startRegionRe: RegExp = /^<!--\s*#(region|markdown|md|raw)(.*?)-->\s*$/;
    endRegionRe: RegExp | null = null;
    override defaultCommentMagics = false;
    
    splitAtHeading: boolean;
    inRegion: boolean = false;
    inRaw: boolean = false;

    constructor(fmt: Record<string, any> = {}, defaultLanguage?: string) {
        super(fmt, defaultLanguage);
        this.splitAtHeading = fmt.split_at_heading || false;
        
        // Create the start code regex
        const languagePattern = [..._JUPYTER_LANGUAGES_LOWER_AND_UPPER].join("|").replace(/\+/g, "\\+");
        this.startCodeRe = new RegExp("^```(\\`*)(\\\\s*)("+languagePattern+")($|\\\\s.*$)");
        
        if (["1.0", "1.1"].includes(this.formatVersion || "") && this.ext !== ".Rmd") {
            // Restore the pattern used in Markdown <= 1.1
            this.startCodeRe = /^```(.*)/;
            this.nonJupyterCodeRe = /^```\{/;
        }
    }

    override metadataAndLanguageFromOptionLine(line: string): void {
        const matchRegion = this.startRegionRe.exec(line);
        if (matchRegion) {
            this.inRegion = true;
            const groups = matchRegion;
            const regionName = groups[1];
            this.endRegionRe = new RegExp(`^<!--\\s*#end${regionName}\\s*-->\\s*$`);
            this.cellMetadataJson = this.cellMetadataJson || isJsonMetadata(groups[2] || "");
            const [title, metadata] = textToMetadata(groups[2] || "", true);
            if (regionName === "raw") {
                this.cellType = "raw";
            } else {
                this.cellType = "markdown";
            }
            this.metadata = metadata;
            if (title) {
                this.metadata.title = title;
            }
            if (["markdown", "md"].includes(regionName)) {
                this.metadata.region_name = regionName;
            }
        } else if (this.startCodeRe.test(line)) {
            const matches = this.startCodeRe.exec(line);
            if (matches) {
                [this.language, this.metadata] = this.optionsToMetadata(matches.slice(1));
            }
            // Cells with a .noeval attribute are markdown cells #347
            if (this.metadata?.get?.(".noeval") === null) {
                this.cellType = "markdown";
                this.metadata = {};
                this.language = null;
            }
        }
    }

    override optionsToMetadata(options: string[] | string): [string | null, Record<string, any>] {
        if (Array.isArray(options)) {
            this.endCodeRe = new RegExp("```" + (options[0] || ""));
            const joinedOptions = options.slice(1).join(" ");
            this.cellMetadataJson = this.cellMetadataJson || isJsonMetadata(joinedOptions);
            return textToMetadata(joinedOptions);
        } else {
            this.endCodeRe = /^```\s*$/;
            this.cellMetadataJson = this.cellMetadataJson || isJsonMetadata(options);
            return textToMetadata(options);
        }
    }

    override findCellEnd(lines: string[]): [number, number, boolean] {
        /**
         * Return position of end of cell marker, and position
         * of first line after cell
         */
        if (this.inRegion) {
            for (let i = 0; i < lines.length; i++) {
                if (this.endRegionRe?.test(lines[i])) {
                    return [i, i + 1, true];
                }
            }
        } else if (this.metadata === null) {
            // default markdown: (last) two consecutive blank lines, except when in code blocks
            this.cellType = "markdown";
            let prevBlank = 0;
            let inExplicitCodeBlock = false;
            let inIndentedCodeBlock = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                if (inExplicitCodeBlock && this.endCodeRe.test(line)) {
                    inExplicitCodeBlock = false;
                    continue;
                }

                if (prevBlank && 
                    line.startsWith("    ") && 
                    !_BLANK_LINE.test(line)) {
                    inIndentedCodeBlock = true;
                    prevBlank = 0;
                    continue;
                }

                if (inIndentedCodeBlock && 
                    !_BLANK_LINE.test(line) && 
                    !line.startsWith("    ")) {
                    inIndentedCodeBlock = false;
                }

                if (inIndentedCodeBlock || inExplicitCodeBlock) {
                    continue;
                }

                if (this.startRegionRe.test(line)) {
                    if (i > 1 && prevBlank) {
                        return [i - 1, i, false];
                    }
                    return [i, i, false];
                }

                if (this.startCodeRe.test(line)) {
                    if (line.startsWith("```{bibliography}")) {
                        inExplicitCodeBlock = true;
                        prevBlank = 0;
                        continue;
                    }

                    // Cells with a .noeval attribute are markdown cells #347
                    const matches = this.startCodeRe.exec(line);
                    if (matches) {
                        const [, metadata] = this.optionsToMetadata(matches.slice(1));
                        if (metadata[".noeval"] === null) {
                            inExplicitCodeBlock = true;
                            prevBlank = 0;
                            continue;
                        }
                    }

                    if (i > 1 && prevBlank) {
                        return [i - 1, i, false];
                    }
                    return [i, i, false];
                }

                if (this.nonJupyterCodeRe.test(line)) {
                    if (prevBlank >= 2) {
                        return [i - 2, i, true];
                    }
                    inExplicitCodeBlock = true;
                    prevBlank = 0;
                    continue;
                }

                if (this.splitAtHeading && line.startsWith("#") && prevBlank >= 1) {
                    return [i - 1, i, false];
                }

                if (_BLANK_LINE.test(line)) {
                    prevBlank += 1;
                } else if (prevBlank >= 2) {
                    return [i - 2, i, true];
                } else {
                    prevBlank = 0;
                }
            }
        } else {
            this.cellType = "code";
            const parser = new StringParser(this.language || this.defaultLanguage);
            for (let i = 0; i < lines.length; i++) {
                // skip cell header
                if (i === 0) {
                    continue;
                }

                if (parser.isQuoted()) {
                    parser.readLine(lines[i]);
                    continue;
                }

                parser.readLine(lines[i]);
                if (this.endCodeRe.test(lines[i])) {
                    return [i, i + 1, true];
                }
            }
        }

        // End not found
        return [lines.length, lines.length, false];
    }

    override uncommentCodeAndMagics(lines: string[]): string[] {
        if (this.cellType === "code" && this.commentMagics) {
            return uncommentMagic(lines, this.language || this.defaultLanguage);
        }
        if (this.cellType === "markdown" && this.doxygenEquationMarkers) {
            // Placeholder for doxygen processing - would need doxygen module
            return lines;
        }
        return lines;
    }
}

// R Markdown cell reader (lines 498-518)
export class RMarkdownCellReader extends MarkdownCellReader {
    /**
     * Read notebook cells from R Markdown notebooks
     */
    override comment = "";
    override startCodeRe = /^```{(.*?)}\s*$/;
    override nonJupyterCodeRe = /^```([^{]|\s*$)/;
    override defaultLanguage = "R";
    override defaultCommentMagics = true;

    override optionsToMetadata(options: string | string[]): [string | null, Record<string, any>] {
        const optionsStr = Array.isArray(options) ? options.join(" ") : options;
        return rmdOptionsToMetadata(optionsStr, this.useRuntools);
    }

    override uncommentCodeAndMagics(lines: string[]): string[] {
        if (this.cellType === "code" && 
            this.commentMagics && 
            isActive(this.ext, this.metadata || {})) {
            return uncommentMagic(lines, this.language || this.defaultLanguage);
        }
        return lines;
    }
}

// Script cell reader base (lines 521-558)
export abstract class ScriptCellReader extends BaseCellReader {
    /**
     * Read notebook cells from scripts
     * (common base for R and Python scripts)
     */

    override uncommentCodeAndMagics(lines: string[]): string[] {
        if (this.cellType === "code" || this.comment !== "#'") {
            if (this.commentMagics) {
                if (isActive(this.ext, this.metadata || {})) {
                    const result = uncommentMagic(
                        lines,
                        this.language || this.defaultLanguage,
                        this.explicitSoc || false
                    );
                    if (this.cellType === "code" && 
                        !this.explicitSoc && 
                        needExplicitMarker(lines, this.language || this.defaultLanguage)) {
                        (this.metadata || {}).comment_questions = false;
                    }
                    return result;
                } else {
                    return uncomment(lines);
                }
            }
        }

        if (this.defaultLanguage === "go" && this.language === null) {
            return lines.map(line => 
                line.replace(/^((\/\/\s*)*)(\/\/\s*gonb:%%)/, "$1%%")
            );
        }

        if (this.cellType === "code") {
            return unescapeCodeStart(
                lines, this.ext, this.language || this.defaultLanguage
            );
        }

        return uncomment(
            lines, 
            this.markdownPrefix || this.comment, 
            this.commentSuffix
        );
    }
}

// R Script cell reader (lines 560-622)
export class RScriptCellReader extends ScriptCellReader {
    /**
     * Read notebook cells from R scripts written according
     * to the knitr-spin syntax
     */
    override comment = "#'";
    override commentSuffix = "";
    override markdownPrefix = "#'";
    override defaultLanguage = "R";
    override startCodeRe = /^#\+(.*)\s*$/;
    override defaultCommentMagics = true;

    override optionsToMetadata(options: string): [string | null, Record<string, any>] {
        return rmdOptionsToMetadata("r " + options, this.useRuntools);
    }

    override findCellEnd(lines: string[]): [number, number, boolean] {
        /**
         * Return position of end of cell marker, and position
         * of first line after cell
         */
        if (this.metadata === null && lines[0].startsWith("#'")) {
            this.cellType = "markdown";
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].startsWith("#'")) {
                    if (_BLANK_LINE.test(lines[i])) {
                        return [i, i + 1, false];
                    }
                    return [i, i, false];
                }
            }
            return [lines.length, lines.length, false];
        }

        if (this.metadata && "cell_type" in this.metadata) {
            this.cellType = this.metadata.cell_type;
            delete this.metadata.cell_type;
        } else {
            this.cellType = "code";
        }

        const parser = new StringParser(this.language || this.defaultLanguage);
        for (let i = 0; i < lines.length; i++) {
            // skip cell header
            if (this.metadata !== null && i === 0) {
                continue;
            }

            if (parser.isQuoted()) {
                parser.readLine(lines[i]);
                continue;
            }

            parser.readLine(lines[i]);

            if (this.startCodeRe.test(lines[i]) || 
                (this.markdownPrefix && lines[i].startsWith(this.markdownPrefix))) {
                if (i > 0 && _BLANK_LINE.test(lines[i - 1])) {
                    if (i > 1 && _BLANK_LINE.test(lines[i - 2])) {
                        return [i - 2, i, false];
                    }
                    return [i - 1, i, false];
                }
                return [i, i, false];
            }

            if (_BLANK_LINE.test(lines[i])) {
                if (!nextCodeIsIndented(lines.slice(i))) {
                    if (i > 0) {
                        return [i, i + 1, false];
                    }
                    if (lines.length > 1 && !_BLANK_LINE.test(lines[1])) {
                        return [1, 1, false];
                    }
                    return [1, 2, false];
                }
            }
        }

        return [lines.length, lines.length, false];
    }
}

// Light script cell reader (lines 624-793)
export class LightScriptCellReader extends ScriptCellReader {
    /**
     * Read notebook cells from plain Python or Julia files. Cells
     * are identified by line breaks, unless they start with an
     * explicit marker '# +'
     */
    override defaultCommentMagics = true;
    cellMarkerStart: string | null = null;
    cellMarkerEnd: string | null = null;
    ignoreEndMarker = true;
    explicitEndMarkerRequired = false;

    constructor(fmt: Record<string, any> = {}, defaultLanguage?: string) {
        super(fmt, defaultLanguage);
        this.ext = this.ext || ".py";
        const script = SCRIPT_EXTENSIONS[this.ext];
        this.defaultLanguage = defaultLanguage || script.language;
        this.comment = script.comment;
        this.commentSuffix = script.comment_suffix || "";
        
        if (fmt && 
            fmt.format_name === "light" && 
            "cell_markers" in fmt && 
            fmt.cell_markers !== "+,-") {
            const markers = fmt.cell_markers.split(",", 2);
            this.cellMarkerStart = markers[0];
            this.cellMarkerEnd = markers[1];
            this.startCodeRe = new RegExp(
                "^" + this.escapeRegex(this.comment) + "\\s*" + 
                this.escapeRegex(this.cellMarkerStart || "") + "(.*)$"
            );
            this.endCodeRe = new RegExp(
                "^" + this.escapeRegex(this.comment) + "\\s*" + 
                this.escapeRegex(this.cellMarkerEnd || "") + "\\s*$"
            );
        } else {
            this.startCodeRe = new RegExp(
                "^" + this.escapeRegex(this.comment) + "\\s*\\+(.*)$"
            );
        }
    }

    protected escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    override metadataAndLanguageFromOptionLine(line: string): void {
        if (this.startCodeRe?.test(line)) {
            // Remove the OCAML suffix
            let processedLine = line;
            if (this.commentSuffix) {
                if (line.endsWith(" " + this.commentSuffix)) {
                    processedLine = line.slice(0, -(" " + this.commentSuffix).length);
                } else if (line.endsWith(this.commentSuffix)) {
                    processedLine = line.slice(0, -this.commentSuffix.length);
                }
            }

            const matches = this.startCodeRe.exec(processedLine);
            if (matches) {
                [this.language, this.metadata] = this.optionsToMetadata(matches[1] || "");
            }
            this.ignoreEndMarker = false;
            if (this.cellMarkerStart) {
                this.explicitEndMarkerRequired = true;
            }
        } else if (this.simpleStartCodeRe?.test(line)) {
            this.metadata = {};
            this.ignoreEndMarker = false;
        } else if (this.cellMarkerEnd && this.endCodeRe?.test(line)) {
            this.metadata = null;
            this.cellType = "code";
        }
    }

    override optionsToMetadata(options: string): [string | null, Record<string, any>] {
        this.cellMetadataJson = this.cellMetadataJson || isJsonMetadata(options);
        let [title, metadata] = textToMetadata(options, true);

        // Cell type
        for (const cellType of ["markdown", "raw", "md"]) {
            const code = `[${cellType}]`;
            if (title.includes(code)) {
                title = title.replace(code, "").trim();
                metadata.cell_type = cellType;
                if (cellType === "md") {
                    metadata.region_name = cellType;
                    metadata.cell_type = "markdown";
                }
                break;
            }
        }

        // Spyder has sub cells
        let cellDepth = 0;
        while (title.startsWith("%")) {
            cellDepth += 1;
            title = title.slice(1);
        }

        if (cellDepth) {
            metadata.cell_depth = cellDepth;
            title = title.trim();
        }

        if (title) {
            metadata.title = title;
        }

        return [null, metadata];
    }

    override findCellEnd(lines: string[]): [number, number, boolean] {
        /**
         * Return position of end of cell marker, and position of first line after cell
         */
        if (this.metadata === null && 
            !(this.cellMarkerEnd && this.endCodeRe?.test(lines[0])) &&
            paragraphIsFullyCommented(lines, this.comment, this.defaultLanguage)) {
            this.cellType = "markdown";
            for (let i = 0; i < lines.length; i++) {
                if (_BLANK_LINE.test(lines[i])) {
                    return [i, i + 1, false];
                }
            }
            return [lines.length, lines.length, false];
        }

        if (this.metadata === null) {
            this.endCodeRe = null;
        } else if (!this.cellMarkerEnd) {
            const endOfCell = this.metadata.endofcell || "-";
            this.endCodeRe = new RegExp(
                "^" + this.escapeRegex(this.comment) + " " + this.escapeRegex(endOfCell) + "\\s*$"
            );
        }

        return this.findRegionEnd(lines);
    }

    findRegionEnd(lines: string[]): [number, number, boolean] {
        /**
         * Find the end of the region started with start and end markers
         */
        if (this.metadata && "cell_type" in this.metadata) {
            this.cellType = this.metadata.cell_type;
            delete this.metadata.cell_type;
        } else {
            this.cellType = "code";
        }

        const parser = new StringParser(this.language || this.defaultLanguage);
        for (let i = 0; i < lines.length; i++) {
            // skip cell header
            if (this.metadata !== null && i === 0) {
                continue;
            }

            if (parser.isQuoted()) {
                parser.readLine(lines[i]);
                continue;
            }

            parser.readLine(lines[i]);
            
            // New code region
            // Simple code pattern in LightScripts must be preceded with a blank line
            if (this.startCodeRe?.test(lines[i]) || 
                (this.simpleStartCodeRe?.test(lines[i]) && 
                 (this.cellMarkerStart || i === 0 || _BLANK_LINE.test(lines[i - 1])))) {
                
                if (this.explicitEndMarkerRequired) {
                    // Metadata here was conditioned on finding an explicit end marker
                    // before the next start marker. So we dismiss it.
                    this.metadata = null;
                    this.language = null;
                }

                if (i > 0 && _BLANK_LINE.test(lines[i - 1])) {
                    if (i > 1 && _BLANK_LINE.test(lines[i - 2])) {
                        return [i - 2, i, false];
                    }
                    return [i - 1, i, false];
                }
                return [i, i, false];
            }

            if (!this.ignoreEndMarker && this.endCodeRe?.test(lines[i])) {
                return [i, i + 1, true];
            } else if (_BLANK_LINE.test(lines[i])) {
                if (!nextCodeIsIndented(lines.slice(i))) {
                    if (i > 0) {
                        return [i, i + 1, false];
                    }
                    if (lines.length > 1 && !_BLANK_LINE.test(lines[1])) {
                        return [1, 1, false];
                    }
                    return [1, 2, false];
                }
            }
        }

        return [lines.length, lines.length, false];
    }
}

// Double percent script cell reader (lines 796-887) - CRITICAL FOR VSCODE
export class DoublePercentScriptCellReader extends LightScriptCellReader {
    /**
     * Read notebook cells from Spyder/VScode scripts (#59)
     */
    override defaultCommentMagics = true;
    alternativeStartCodeRe: RegExp;
    override explicitSoc = true;

    constructor(fmt: Record<string, any>, defaultLanguage?: string) {
        super(fmt, defaultLanguage);
        const script = SCRIPT_EXTENSIONS[this.ext];
        this.defaultLanguage = defaultLanguage || script.language;
        this.comment = script.comment;
        this.commentSuffix = script.comment_suffix || "";
        this.startCodeRe = new RegExp(
            `^\\s*${this.escapeRegex(this.comment)}\\s*%%(%*)\\s(.*)$`
        );
        this.alternativeStartCodeRe = new RegExp(
            `^\\s*${this.escapeRegex(this.comment)}\\s*(%%|<codecell>|In\\[[0-9 ]*\\]:?)\\s*$`
        );
    }

    override metadataAndLanguageFromOptionLine(line: string): void {
        /**
         * Parse code options on the given line. When a start of a code cell
         * is found, self.metadata is set to a dictionary.
         */
        if (this.startCodeRe?.test(line)) {
            const uncommentedLine = uncomment([line], this.comment, this.commentSuffix)[0];
            const percentIndex = uncommentedLine.indexOf("%%");
            const options = uncommentedLine.slice(percentIndex + 2).trim();
            [this.language, this.metadata] = this.optionsToMetadata(options);
        } else {
            this.metadata = {};
        }
    }

    override findCellContent(lines: string[]): number {
        /**
         * Parse cell till its end and set content, lines_to_next_cell.
         * Return the position of next cell start
         */
        const [cellEndMarker, nextCellStart, explicitEoc] = this.findCellEnd(lines);

        // Metadata to dict
        let cellStart: number;
        if (this.startCodeRe?.test(lines[0]) || this.alternativeStartCodeRe?.test(lines[0])) {
            cellStart = 1;
        } else {
            cellStart = 0;
        }

        // Cell content
        const source = lines.slice(cellStart, cellEndMarker);
        this.orgContent = [...source];
        this.content = this.extractContent(source);

        this.linesToNextCell = countLinesToNextCell(
            cellEndMarker, nextCellStart, lines.length, explicitEoc
        );

        return nextCellStart;
    }

    override findCellEnd(lines: string[]): [number, number, boolean] {
        /**
         * Return position of end of cell marker, and position
         * of first line after cell
         */
        if (this.metadata && "cell_type" in this.metadata) {
            this.cellType = this.metadata.cell_type;
            delete this.metadata.cell_type;
        } else if (!isActive(".ipynb", this.metadata || {})) {
            if (this.metadata?.active === "") {
                delete this.metadata.active;
            }
            this.cellType = "raw";
            if (isActive(this.ext, this.metadata || {})) {
                this.comment = "";
            }
        } else {
            this.cellType = "code";
        }

        let nextCell = lines.length;
        const parser = new StringParser(this.language || this.defaultLanguage);
        
        for (let i = 0; i < lines.length; i++) {
            if (parser.isQuoted()) {
                parser.readLine(lines[i]);
                continue;
            }

            parser.readLine(lines[i]);
            if (i > 0 && (this.startCodeRe?.test(lines[i]) || 
                          this.alternativeStartCodeRe?.test(lines[i]))) {
                nextCell = i;
                break;
            }
        }

        if (lastTwoLinesBlank(lines.slice(0, nextCell))) {
            return [nextCell - 2, nextCell, false];
        }
        if (nextCell > 0 && _BLANK_LINE.test(lines[nextCell - 1])) {
            return [nextCell - 1, nextCell, false];
        }
        return [nextCell, nextCell, false];
    }
}

// Hydrogen cell reader (lines 889-892)
export class HydrogenCellReader extends DoublePercentScriptCellReader {
    /**
     * Read notebook cells from Hydrogen scripts (#59)
     */
    override defaultCommentMagics = false;
}

// Sphinx Gallery script cell reader (lines 895-1040)
export class SphinxGalleryScriptCellReader extends ScriptCellReader {
    /**
     * Read notebook cells from Sphinx Gallery scripts (#80)
     */
    override comment = "#";
    override defaultLanguage = "python";
    override defaultCommentMagics = true;
    twentyHash = /^#( |)#{19,}\s*$/;
    defaultMarkdownCellMarker = "#".repeat(79);
    markdownMarker: string | null = null;
    rst2md: boolean;

    constructor(fmt: Record<string, any> = {}, defaultLanguage: string = "python") {
        super(fmt, defaultLanguage);
        this.ext = ".py";
        this.rst2md = fmt.rst2md || false;
    }

    startOfNewMarkdownCell(line: string): string | null {
        /**
         * Does this line starts a new markdown cell?
         * Then, return the cell marker
         */
        for (const emptyMarkdownCell of ['""', "''"]) {
            if (line === emptyMarkdownCell) {
                return emptyMarkdownCell;
            }
        }

        for (const tripleQuote of ['"""', "'''"]) {
            if (line.startsWith(tripleQuote)) {
                return tripleQuote;
            }
        }

        if (this.twentyHash.test(line)) {
            return line;
        }

        return null;
    }

    override metadataAndLanguageFromOptionLine(line: string): void {
        this.markdownMarker = this.startOfNewMarkdownCell(line);
        if (this.markdownMarker) {
            this.cellType = "markdown";
            if (this.markdownMarker !== this.defaultMarkdownCellMarker) {
                this.metadata = { cell_marker: this.markdownMarker };
            } else {
                this.metadata = {};
            }
        } else {
            this.cellType = "code";
            this.metadata = {};
        }
    }

    override optionsToMetadata(options: string): [string | null, Record<string, any>] {
        // Sphinx Gallery doesn't use options in the same way
        return [null, {}];
    }

    override findCellEnd(lines: string[]): [number, number, boolean] {
        /**
         * Return position of end of cell, and position
         * of first line after cell, and whether there was an
         * explicit end of cell marker
         */
        if (this.cellType === "markdown") {
            // Empty cell "" or ''
            if (this.markdownMarker && this.markdownMarker.length <= 2) {
                if (lines.length === 1 || _BLANK_LINE.test(lines[1])) {
                    return [0, 2, true];
                }
                return [0, 1, true];
            }

            // Multi-line comment with triple quote
            if (this.markdownMarker && this.markdownMarker.length === 3) {
                for (let i = 0; i < lines.length; i++) {
                    if ((i > 0 || lines[i].trim() !== this.markdownMarker) && 
                        lines[i].trimEnd().endsWith(this.markdownMarker)) {
                        const explicitEndOfCellMarker = lines[i].trim() === this.markdownMarker;
                        const endOfCell = explicitEndOfCellMarker ? i : i + 1;
                        if (lines.length <= i + 1 || _BLANK_LINE.test(lines[i + 1])) {
                            return [endOfCell, i + 2, explicitEndOfCellMarker];
                        }
                        return [endOfCell, i + 1, explicitEndOfCellMarker];
                    }
                }
            } else {
                // 20 # or more
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].startsWith(this.comment)) {
                        if (_BLANK_LINE.test(lines[i])) {
                            return [i, i + 1, false];
                        }
                        return [i, i, false];
                    }
                }
            }
        } else if (this.cellType === "code") {
            const parser = new StringParser("python");
            for (let i = 0; i < lines.length; i++) {
                if (parser.isQuoted()) {
                    parser.readLine(lines[i]);
                    continue;
                }

                if (this.startOfNewMarkdownCell(lines[i])) {
                    if (i > 0 && _BLANK_LINE.test(lines[i - 1])) {
                        return [i - 1, i, false];
                    }
                    return [i, i, false];
                }
                parser.readLine(lines[i]);
            }
        }

        return [lines.length, lines.length, false];
    }

    override findCellContent(lines: string[]): number {
        /**
         * Parse cell till its end and set content, lines_to_next_cell.
         * Return the position of next cell start
         */
        const [cellEndMarker, nextCellStart, explicitEoc] = this.findCellEnd(lines);

        // Metadata to dict
        let cellStart = 0;
        if (this.cellType === "markdown") {
            if (this.markdownMarker && ['"""', "'''"].includes(this.markdownMarker)) {
                // Remove the triple quotes
                if (lines[0].trim() === this.markdownMarker) {
                    cellStart = 1;
                } else {
                    lines[0] = lines[0].slice(3);
                }
                if (!explicitEoc) {
                    const last = lines[cellEndMarker - 1];
                    const markerIndex = last.lastIndexOf(this.markdownMarker);
                    if (markerIndex >= 0) {
                        lines[cellEndMarker - 1] = last.slice(0, markerIndex);
                    }
                }
            }
            if (this.markdownMarker && this.twentyHash.test(this.markdownMarker)) {
                cellStart = 1;
            }
        }

        // Cell content
        let source = lines.slice(cellStart, cellEndMarker);
        this.orgContent = [...source];

        if (this.cellType === "code" && this.commentMagics) {
            source = uncommentMagic(source, this.language || this.defaultLanguage);
        }

        if (this.cellType === "markdown" && source.length > 0) {
            if (this.markdownMarker?.startsWith(this.comment)) {
                source = uncomment(source, this.comment);
            }
            if (this.rst2md) {
                // Placeholder for rst2md conversion - would need sphinx_gallery dependency
                console.warn("rst2md conversion not implemented in TypeScript version");
            }
        }

        this.content = source;

        this.linesToNextCell = countLinesToNextCell(
            cellEndMarker, nextCellStart, lines.length, explicitEoc
        );

        return nextCellStart;
    }
}
