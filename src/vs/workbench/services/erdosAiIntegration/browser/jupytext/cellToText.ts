/**
 * Export notebook cells as text
 * Converted from src/jupytext/cell_to_text.py
 */

import { CellNode } from './types.js';
import { 
    _IGNORE_CELL_METADATA,
    isActive,
    metadataToDoublePercentOptions,
    metadataToRmdOptions,
    metadataToText 
} from './cellMetadata.js';
import { LightScriptCellReader, MarkdownCellReader, RMarkdownCellReader } from './cellReader.js';
import { SCRIPT_EXTENSIONS, cellLanguage, commentLines, sameLanguage } from './languages.js';
import { commentMagic, escapeCodeStart, needExplicitMarker } from './magics.js';
import { filterMetadata } from './metadataFilter.js';
import { pep8LinesBetweenCells } from './pep8.js';

// Utility functions (lines 22-46)

export function cellSource(cell: CellNode): string[] {
    /**
     * Return the source of the current cell, as an array of lines
     */
    // Handle the case where source is an array (notebook format)
    // Convert to string first, just like Python would receive it
    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
    
    if (source === "") {
        return [""];
    }
    if (source.endsWith("\n")) {
        // Use splitlines() equivalent + [""] to match Python behavior exactly
        return [...source.split('\n').slice(0, -1), ""];
    }
    // Use splitlines() equivalent (split without final empty string)
    return source.split('\n').filter((line, index, array) => 
        index < array.length - 1 || line !== ""
    );
}

export function threeBackticksOrMore(lines: string[]): string {
    /**
     * Return a string with enough backticks to encapsulate the given code cell in Markdown
     * cf. https://github.com/mwouts/jupytext/issues/712
     */
    let codeCellDelimiter = "```";
    for (const line of lines) {
        if (!line.startsWith(codeCellDelimiter)) {
            continue;
        }
        for (const char of line.slice(codeCellDelimiter.length)) {
            if (char !== "`") {
                break;
            }
            codeCellDelimiter += "`";
        }
        codeCellDelimiter += "`";
    }
    return codeCellDelimiter;
}

// Base class (lines 48-208)
export abstract class BaseCellExporter {
    /**
     * A class that represent a notebook cell as text
     */
    defaultCommentMagics: boolean | null = null;
    parseCellLanguage: boolean = true;

    // Instance properties
    fmt: Record<string, any>;
    ext: string;
    cellType: string;
    source: string[];
    unfilteredMetadata: Record<string, any>;
    metadata: Record<string, any>;
    language: string | null;
    defaultLanguage: string;
    comment: string;
    commentSuffix: string;
    commentMagics: boolean | null;
    cellMetadataJson: boolean;
    useRuntools: boolean;
    doxygenEquationMarkers: boolean;
    linesToNextCell: number | null;
    linesToEndOfCellMarker: number | null;

    constructor(
        cell: CellNode, 
        defaultLanguage: string, 
        fmt: Record<string, any> = {}, 
        unsupportedKeys?: string[]
    ) {
        this.fmt = fmt;
        this.ext = this.fmt.extension || "";
        this.cellType = cell.cell_type;
        this.source = cellSource(cell);
        this.unfilteredMetadata = cell.metadata;
        this.metadata = filterMetadata(
            cell.metadata,
            this.fmt.cell_metadata_filter,
            _IGNORE_CELL_METADATA,
            unsupportedKeys ? new Set(unsupportedKeys) : undefined
        );

        if (this.parseCellLanguage) {
            const customCellMagics = (this.fmt.custom_cell_magics || "").split(",");
            const [language, magicArgs] = cellLanguage(
                this.source, defaultLanguage, customCellMagics
            );
            this.language = language;
            if (magicArgs) {
                this.metadata.magic_args = magicArgs;
            }
        } else {
            this.language = null;
        }

        if (this.language && !this.ext.endsWith(".Rmd")) {
            this.metadata.language = this.language;
        }

        this.language = this.language || cell.metadata.language || defaultLanguage;
        this.defaultLanguage = defaultLanguage;
        this.comment = SCRIPT_EXTENSIONS[this.ext]?.comment || "#";
        this.commentSuffix = SCRIPT_EXTENSIONS[this.ext]?.comment_suffix || "";
        this.commentMagics = this.fmt.comment_magics ?? this.defaultCommentMagics;
        this.cellMetadataJson = this.fmt.cell_metadata_json || false;
        this.useRuntools = this.fmt.use_runtools || false;
        this.doxygenEquationMarkers = this.fmt.doxygen_equation_markers || false;

        // how many blank lines before next cell
        this.linesToNextCell = cell.metadata.lines_to_next_cell || null;
        this.linesToEndOfCellMarker = cell.metadata.lines_to_end_of_cell_marker || null;

        if (cell.cell_type === "raw" &&
            !("active" in this.metadata) &&
            !(this.metadata.tags || []).some((tag: string) => tag.startsWith("active-"))) {
            this.metadata.active = "";
        }
    }

    isCode(): boolean {
        /**
         * Is this cell a code cell?
         */
        if (this.cellType === "code") {
            return true;
        }
        if (this.cellType === "raw" && 
            ("active" in this.metadata || 
             (this.metadata.tags || []).some((tag: string) => tag.startsWith("active-")))) {
            return true;
        }
        return false;
    }

    useTripleQuotes(): boolean {
        /**
         * Should this markdown cell use triple quote?
         */
        if (!("cell_marker" in this.unfilteredMetadata)) {
            return false;
        }
        const cellMarker = this.unfilteredMetadata.cell_marker;
        if (['"""', "'''"].includes(cellMarker)) {
            return true;
        }
        if (!cellMarker.includes(",")) {
            return false;
        }
        const [left, right] = cellMarker.split(",");
        return left.slice(0, 3) === right.slice(-3) && ['"""', "'''"].includes(left.slice(0, 3));
    }

    cellToText(): string[] {
        /**
         * Return the text representation for the cell
         */
        // Trigger cell marker in case we are using multiline quotes
        if (this.cellType !== "code" && 
            Object.keys(this.metadata).length === 0 && 
            this.useTripleQuotes()) {
            this.metadata.cell_type = this.cellType;
        }

        // Go notebooks have '%%' or '%% -' magic commands that need to be escaped
        if (this.defaultLanguage === "go" && this.language === "go") {
            this.source = this.source.map(line =>
                line.replace(/^(\/\/\s*)*(%%\s*$|%%\s+-.*$)/, "$1//gonb:$2")
            );
        }

        if (this.isCode()) {
            return this.codeToText();
        }

        const source = [...this.source];
        if (!this.comment) {
            escapeCodeStart(source, this.ext, null);
        }
        return this.markdownToText(source);
    }

    markdownToText(source: string[]): string[] {
        /**
         * Escape the given source, for a markdown cell
         */
        const cellMarkers = this.unfilteredMetadata.cell_marker || this.fmt.cell_markers;
        if (cellMarkers) {
            let left: string, right: string;
            if (cellMarkers.includes(",")) {
                [left, right] = cellMarkers.split(",", 2);
            } else {
                left = cellMarkers + "\n";
                let processedMarkers = cellMarkers;
                if (cellMarkers.startsWith("r") || cellMarkers.startsWith("R")) {
                    processedMarkers = cellMarkers.slice(1);
                }
                right = "\n" + processedMarkers;
            }

            if ((left.slice(0, 3) === right.slice(-3) ||
                 (["r", "R"].includes(left.slice(0, 1)) && left.slice(1, 4) === right.slice(-3))) &&
                ['"""', "'''"].includes(right.slice(-3))) {
                
                // Markdown cells that contain a backslash should be encoded as raw strings
                if (!["r", "R"].includes(left.slice(0, 1)) &&
                    source.join("\n").includes("\\") &&
                    this.fmt.format_name === "percent") {
                    left = "r" + left;
                }

                const processedSource = [...source];
                processedSource[0] = left + processedSource[0];
                processedSource[processedSource.length - 1] = processedSource[processedSource.length - 1] + right;
                return processedSource;
            }
        }

        if (this.comment &&
            this.comment !== "#'" &&
            isActive(this.ext, this.metadata) &&
            !["percent", "hydrogen"].includes(this.fmt.format_name)) {
            const processedSource = [...source];
            commentMagic(
                processedSource,
                this.language || this.defaultLanguage,
                this.commentMagics ?? undefined,
                this.cellType === "code"
            );
            return commentLines(processedSource, this.comment, this.commentSuffix);
        }

        return commentLines(source, this.comment, this.commentSuffix);
    }

    abstract codeToText(): string[];

    removeEocMarker(text: string[], nextText: string[]): string[] {
        /**
         * Remove end-of-cell marker when possible
         */
        return text;
    }
}

// Markdown cell exporter (lines 210-270)
export class MarkdownCellExporter extends BaseCellExporter {
    /**
     * A class that represent a notebook cell as Markdown
     */
    override defaultCommentMagics = false;
    cellReader = MarkdownCellReader;

    constructor(cell: CellNode, defaultLanguage: string, fmt: Record<string, any> = {}, unsupportedKeys?: string[]) {
        super(cell, defaultLanguage, fmt, unsupportedKeys);
        this.comment = "";
    }

    htmlComment(metadata: Record<string, any>, code: string = "region"): string[] {
        /**
         * Protect a Markdown or Raw cell with HTML comments
         */
        let regionStart: string;
        if (metadata && Object.keys(metadata).length > 0) {
            const parts = [
                "<!-- #" + code,
                metadataToText(null, metadata, this.cellMetadataJson),
                "-->"
            ];
            regionStart = parts.join(" ");
        } else {
            regionStart = `<!-- #${code} -->`;
        }

        return [regionStart, ...this.source, `<!-- #end${code} -->`];
    }

    override cellToText(): string[] {
        /**
         * Return the text representation of a cell
         */
        if (this.cellType === "markdown") {
            if (this.doxygenEquationMarkers && this.cellType === "markdown") {
                // Placeholder for doxygen processing - would need doxygen module
                // this.source = markdownToDoxygen(this.source.join('\n')).split('\n');
            }

            // Is an explicit region required?
            let protect: boolean;
            if (Object.keys(this.metadata).length > 0) {
                protect = true;
            } else {
                // Would the text be parsed to a shorter cell/a cell with a different type?
                const reader = new this.cellReader(this.fmt);
                const [cell, pos] = reader.read(this.source);
                protect = pos < this.source.length || cell.cell_type !== this.cellType;
            }
            
            if (protect) {
                const regionName = this.metadata.region_name || "region";
                delete this.metadata.region_name;
                return this.htmlComment(this.metadata, regionName);
            }
            return this.source;
        }

        return this.codeToText();
    }

    codeToText(): string[] {
        /**
         * Return the text representation of a code cell
         */
        const source = [...this.source];
        commentMagic(source, this.language || this.defaultLanguage, this.commentMagics ?? undefined);

        if (this.metadata.active === "") {
            delete this.metadata.active;
        }

        this.language = this.metadata.language || this.language;
        delete this.metadata.language;
        
        if (this.cellType === "raw" && !isActive(this.ext, this.metadata, false)) {
            return this.htmlComment(this.metadata, "raw");
        }

        const options = metadataToText(this.language, this.metadata);
        const codeCellDelimiter = threeBackticksOrMore(this.source);
        return [codeCellDelimiter + options, ...source, codeCellDelimiter];
    }
}

// R Markdown cell exporter (lines 272-301)
export class RMarkdownCellExporter extends MarkdownCellExporter {
    /**
     * A class that represent a notebook cell as R Markdown
     */
    override defaultCommentMagics = true;
    override cellReader = RMarkdownCellReader;

    constructor(cell: CellNode, defaultLanguage: string, fmt: Record<string, any> = {}, unsupportedKeys?: string[]) {
        super(cell, defaultLanguage, fmt, unsupportedKeys);
        this.ext = ".Rmd";
        this.comment = "";
    }

    override codeToText(): string[] {
        /**
         * Return the text representation of a code cell
         */
        const active = isActive(this.ext, this.metadata);
        const source = [...this.source];

        if (active) {
            commentMagic(source, this.language || this.defaultLanguage, this.commentMagics ?? undefined);
        }

        const lines: string[] = [];
        if (!isActive(this.ext, this.metadata)) {
            this.metadata.eval = false;
        }
        const options = metadataToRmdOptions(
            this.language, this.metadata, this.useRuntools
        );
        lines.push(`\`\`\`{${options}}`);
        lines.push(...source);
        lines.push("```");
        return lines;
    }
}

// Utility function (lines 303-313)
export function endofcellMarker(source: string[], comment: string): string {
    /**
     * Issues #31 #38: does the cell contain a blank line? In that case
     * we add an end-of-cell marker
     */
    let endofcell = "-";
    while (true) {
        const endofcellRe = new RegExp(`^${escapeRegex(comment)}( )${escapeRegex(endofcell)}\\s*$`);
        if (source.some(line => endofcellRe.test(line))) {
            endofcell = endofcell + "-";
        } else {
            return endofcell;
        }
    }
}

// Light script cell exporter (lines 315-446)
export class LightScriptCellExporter extends BaseCellExporter {
    /**
     * A class that represent a notebook cell as a Python or Julia script
     */
    override defaultCommentMagics = true;
    useCellMarkers = true;
    cellMarkerStart: string | null = null;
    cellMarkerEnd: string | null = null;

    constructor(cell: CellNode, defaultLanguage: string, fmt: Record<string, any> = {}, unsupportedKeys?: string[]) {
        super(cell, defaultLanguage, fmt, unsupportedKeys);
        
        if ("cell_markers" in this.fmt) {
            if (!this.fmt.cell_markers.includes(",")) {
                console.warn(
                    `Ignored cell markers '${this.fmt.cell_markers}' as it does not match the expected 'start,end' pattern`
                );
                delete this.fmt.cell_markers;
            } else if (this.fmt.cell_markers !== "+,-") {
                [this.cellMarkerStart, this.cellMarkerEnd] = this.fmt.cell_markers.split(",", 2);
            }
        }
        
        for (const key of ["endofcell"]) {
            if (key in this.unfilteredMetadata) {
                this.metadata[key] = this.unfilteredMetadata[key];
            }
        }
    }

    override isCode(): boolean {
        // Treat markdown cells with metadata as code cells (#66)
        if ((this.cellType === "markdown" && Object.keys(this.metadata).length > 0) || 
            this.useTripleQuotes()) {
            if (isActive(this.ext, this.metadata)) {
                this.metadata.cell_type = this.cellType;
                this.source = this.markdownToText(this.source);
                this.cellType = "code";
                this.unfilteredMetadata = { ...this.unfilteredMetadata };
                delete this.unfilteredMetadata.cell_marker;
            }
            return true;
        }
        return super.isCode();
    }

    codeToText(): string[] {
        /**
         * Return the text representation of a code cell
         */
        const active = isActive(
            this.ext, this.metadata, sameLanguage(this.language || "", this.defaultLanguage)
        );
        let source = [...this.source];
        escapeCodeStart(source, this.ext, this.language || "");
        const commentQuestions = this.metadata.comment_questions !== false;
        delete this.metadata.comment_questions;

        if (active) {
            commentMagic(source, this.language || this.defaultLanguage, this.commentMagics ?? undefined, commentQuestions);
        } else {
            source = this.markdownToText(source);
        }

        if ((active &&
             commentQuestions &&
             needExplicitMarker(this.source, this.language || this.defaultLanguage, this.commentMagics ?? undefined)) ||
            this.explicitStartMarker(source)) {
            this.metadata.endofcell = this.cellMarkerEnd || endofcellMarker(source, this.comment);
        }

        if (Object.keys(this.metadata).length === 0 || !this.useCellMarkers) {
            return source;
        }

        const lines: string[] = [];
        const endofcell = this.metadata.endofcell;
        if (endofcell === "-" || this.cellMarkerEnd) {
            delete this.metadata.endofcell;
        }

        const cellStart = [this.comment, this.cellMarkerStart || "+"];
        const options = metadataToDoublePercentOptions(
            this.metadata, this.cellMetadataJson
        );
        if (options) {
            cellStart.push(options);
        }
        lines.push(cellStart.join(" "));
        lines.push(...source);
        lines.push(`${this.comment} ${endofcell}`);
        return lines;
    }

    explicitStartMarker(source: string[]): boolean {
        /**
         * Does the python representation of this cell requires an explicit
         * start of cell marker?
         */
        if (!this.useCellMarkers) {
            return false;
        }
        if (Object.keys(this.metadata).length > 0) {
            return true;
        }
        if (this.cellMarkerStart) {
            const startCodeRe = new RegExp(
                "^" + escapeRegex(this.comment) + "\\s*" + escapeRegex(this.cellMarkerStart) + "\\s*(.*)$"
            );
            const endCodeRe = new RegExp(
                "^" + escapeRegex(this.comment) + "\\s*" + escapeRegex(this.cellMarkerEnd || "") + "\\s*$"
            );
            if (startCodeRe.test(source[0]) || endCodeRe.test(source[0])) {
                return false;
            }
        }

        if (this.source.every(line => line.startsWith(this.comment))) {
            return true;
        }
        const reader = new LightScriptCellReader(this.fmt);
        const [, pos] = reader.read(source);
        if (pos < source.length) {
            return true;
        }

        return false;
    }

    override removeEocMarker(text: string[], nextText: string[]): string[] {
        /**
         * Remove end of cell marker when next cell has an explicit start marker
         */
        if (this.cellMarkerStart) {
            return text;
        }

        if (this.isCode() && text[text.length - 1] === this.comment + " -") {
            // remove end of cell marker when redundant with next explicit marker
            if (!nextText.length || nextText[0].startsWith(this.comment + " +")) {
                text = text.slice(0, -1);
                // When we do not need the end of cell marker, number of blank lines is the max
                // between that required at the end of the cell, and that required before the next cell.
                if (this.linesToEndOfCellMarker && 
                    (this.linesToNextCell === null || 
                     this.linesToEndOfCellMarker > this.linesToNextCell)) {
                    this.linesToNextCell = this.linesToEndOfCellMarker;
                }
            } else {
                // Insert blank lines at the end of the cell
                let blankLines = this.linesToEndOfCellMarker;
                if (blankLines === null) {
                    // two blank lines when required by pep8
                    blankLines = pep8LinesBetweenCells(
                        text.slice(0, -1), nextText, this.ext
                    );
                    blankLines = blankLines < 2 ? 0 : 2;
                }
                text = [...text.slice(0, -1), ...Array(blankLines).fill(""), text[text.length - 1]];
            }
        }

        return text;
    }
}

// Bare script cell exporter (lines 448-452)
export class BareScriptCellExporter extends LightScriptCellExporter {
    /**
     * A class that writes notebook cells as scripts with no cell markers
     */
    override useCellMarkers = false;
}

// R Script cell exporter (lines 454-483)
export class RScriptCellExporter extends BaseCellExporter {
    /**
     * A class that can represent a notebook cell as a R script
     */
    override defaultCommentMagics = true;

    constructor(cell: CellNode, defaultLanguage: string, fmt: Record<string, any> = {}, unsupportedKeys?: string[]) {
        super(cell, defaultLanguage, fmt, unsupportedKeys);
        this.comment = "#'";
    }

    codeToText(): string[] {
        /**
         * Return the text representation of a code cell
         */
        const active = isActive(this.ext, this.metadata);
        let source = [...this.source];
        escapeCodeStart(source, this.ext, this.language || "");

        if (active) {
            commentMagic(source, this.language || this.defaultLanguage, this.commentMagics ?? undefined);
        }

        if (!active) {
            source = source.map(line => line ? "# " + line : "#");
        }

        const lines: string[] = [];
        if (!isActive(this.ext, this.metadata)) {
            this.metadata.eval = false;
        }
        const options = metadataToRmdOptions(null, this.metadata, this.useRuntools);
        if (options) {
            lines.push(`#+ ${options}`);
        }
        lines.push(...source);
        return lines;
    }
}

// Double percent cell exporter (lines 485-545) - CRITICAL FOR VSCODE
export class DoublePercentCellExporter extends BaseCellExporter {
    /**
     * A class that can represent a notebook cell as a Spyder/VScode script (#59)
     */
    override defaultCommentMagics = true;
    override parseCellLanguage = true;
    cellMarkers: string | undefined;

    constructor(cell: CellNode, defaultLanguage: string, fmt: Record<string, any> = {}, unsupportedKeys?: string[]) {
        super(cell, defaultLanguage, fmt, unsupportedKeys);
        this.cellMarkers = this.fmt.cell_markers;
    }

    override cellToText(): string[] {
        /**
         * Return the text representation for the cell
         */
        // Go notebooks have '%%' or '%% -' magic commands that need to be escaped
        if (this.defaultLanguage === "go" && this.language === "go") {
            this.source = this.source.map(line =>
                line.replace(/^(\/\/\s*)*(%%\s*$|%%\s+-.*$)/, "$1//gonb:$2")
            );
        }

        const active = isActive(
            this.ext, this.metadata, sameLanguage(this.language || "", this.defaultLanguage)
        );
        
        if (this.cellType === "raw" &&
            "active" in this.metadata &&
            this.metadata.active === "") {
            delete this.metadata.active;
        }

        if (!this.isCode()) {
            this.metadata.cell_type = this.cellType;
        }

        const options = metadataToDoublePercentOptions(
            this.metadata, this.cellMetadataJson
        );
        
        let indent = "";
        if (this.isCode() && active && this.source.length > 0) {
            const firstLine = this.source[0];
            if (firstLine.trim()) {
                const leftSpaceMatch = /^(\s*)/.exec(firstLine);
                if (leftSpaceMatch) {
                    indent = leftSpaceMatch[1];
                }
            }
        }

        let lines: string[];
        if (options.startsWith("%") || !options) {
            lines = commentLines(
                ["%%" + options], indent + this.comment, this.commentSuffix
            );
        } else {
            lines = commentLines(
                ["%% " + options], indent + this.comment, this.commentSuffix
            );
        }

        if (this.isCode() && active) {
            const source = [...this.source];
            commentMagic(source, this.language || this.defaultLanguage, this.commentMagics ?? undefined);
            if (source.length === 1 && source[0] === "") {
                return lines;
            }
            return [...lines, ...source];
        }

        return [...lines, ...this.markdownToText(this.source)];
    }

    codeToText(): string[] {
        // This method is not used in DoublePercentCellExporter
        // All logic is in cellToText()
        return this.cellToText();
    }
}

// Hydrogen cell exporter (lines 547-552)
export class HydrogenCellExporter extends DoublePercentCellExporter {
    /**
     * A class that can represent a notebook cell as a Hydrogen script (#59)
     */
    override defaultCommentMagics = false;
    override parseCellLanguage = false;
}

// Sphinx Gallery cell exporter (lines 554-597)
export class SphinxGalleryCellExporter extends BaseCellExporter {
    /**
     * A class that can represent a notebook cell as a
     * Sphinx Gallery script (#80)
     */
    defaultCellMarker = "#".repeat(79);
    override defaultCommentMagics = true;

    constructor(cell: CellNode, defaultLanguage: string, fmt: Record<string, any> = {}, unsupportedKeys?: string[]) {
        super(cell, defaultLanguage, fmt, unsupportedKeys);
        this.comment = "#";

        for (const key of ["cell_marker"]) {
            if (key in this.unfilteredMetadata) {
                this.metadata[key] = this.unfilteredMetadata[key];
            }
        }

        if (this.fmt.rst2md) {
            throw new Error(
                "The 'rst2md' option is a read only option. The reverse conversion is not " +
                "implemented. Please either deactivate the option, or save to another format."
            );
        }
    }

    override cellToText(): string[] {
        /**
         * Return the text representation for the cell
         */
        if (this.cellType === "code") {
            const source = [...this.source];
            commentMagic(source, this.language || this.defaultLanguage, this.commentMagics ?? undefined);
            return source;
        }

        let cellMarker: string;
        if ("cell_marker" in this.metadata) {
            cellMarker = this.metadata.cell_marker;
            delete this.metadata.cell_marker;
        } else {
            cellMarker = this.defaultCellMarker;
        }

        if (this.source.length === 1 && this.source[0] === "") {
            return [['""', "''"].includes(cellMarker) ? cellMarker : '""'];
        }

        if (['"""', "'''"].includes(cellMarker)) {
            return [cellMarker, ...this.source, cellMarker];
        }

        const finalMarker = cellMarker.startsWith("#".repeat(20)) 
            ? cellMarker 
            : this.defaultCellMarker;
        return [finalMarker, ...commentLines(this.source, this.comment, this.commentSuffix)];
    }

    codeToText(): string[] {
        // This method is not used in SphinxGalleryCellExporter
        // All logic is in cellToText()
        return this.cellToText();
    }
}

// Utility function for regex escaping
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
