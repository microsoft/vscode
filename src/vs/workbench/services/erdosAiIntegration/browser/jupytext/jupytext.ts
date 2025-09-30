/**
 * Read and write Jupyter notebooks as text files
 * Converted from src/jupytext/jupytext.py
 */

import { NotebookNode, CellNode, newCodeCell, newNotebook } from './types.js';
import { _IGNORE_CELL_METADATA } from './cellMetadata.js';
import { 
    _VALID_FORMAT_OPTIONS,
    divineFormat,
    formatNameForExt,
    getFormatImplementation,
    guessFormat,
    longFormOneFormat,
    readFormatFromMetadata,
    rearrangeJupytextMetadata,
    updateJupytextFormatsMetadata 
} from './formats.js';
import { 
    _JUPYTER_METADATA_NAMESPACE,
    encodingAndExecutable,
    headerToMetadataAndCell,
    insertJupytextInfoAndFilterMetadata,
    insertOrTestVersionNumber,
    metadataAndCellToHeader,
    metadataAndCellToMetadata,
    metadataToMetadataAndCell 
} from './header.js';
import { 
    SCRIPT_EXTENSIONS,
    defaultLanguageFromMetadataAndExt,
    setMainAndCellLanguage 
} from './languages.js';
import { filterMetadata, updateMetadataFilters } from './metadataFilter.js';
import { pep8LinesBetweenCells } from './pep8.js';
import { __version__ } from './version.js';

// Error classes (lines 49-51)
export class NotSupportedNBFormatVersion extends Error {
    /**
     * An error issued when the current notebook format is not supported by this version of Jupytext
     */
    constructor(message: string) {
        super(message);
        this.name = 'NotSupportedNBFormatVersion';
    }
}

// Main converter class (lines 53-387)
export class TextNotebookConverter {
    /**
     * A class that can read or write a Jupyter notebook as text
     */
    fmt: Record<string, any>;
    config: any;
    ext: string;
    implementation: any;

    constructor(fmt: Record<string, any>, config: any = null) {
        this.fmt = { ...longFormOneFormat(fmt) };
        this.config = config;
        this.ext = this.fmt.extension;
        this.implementation = getFormatImplementation(
            this.ext, this.fmt.format_name
        );
    }

    updateFmtWithNotebookOptions(metadata: Record<string, any>, read: boolean = false): void {
        /**
         * Update format options with the values in the notebook metadata, and record those
         * options in the notebook metadata
         */
        // The settings in the Jupytext configuration file have precedence over the metadata in the notebook
        // when the notebook is saved. This is because the metadata in the notebook might not be visible
        // in the text representation when e.g. notebook_metadata_filter="-all", which makes them hard to edit.
        if (!read && this.config !== null) {
            this.config.setDefaultFormatOptions(this.fmt, read);
        }

        // Use format options from the notebook if not already set by the config
        for (const opt of _VALID_FORMAT_OPTIONS) {
            if (opt in (metadata.jupytext || {})) {
                if (!(opt in this.fmt)) {
                    this.fmt[opt] = metadata.jupytext[opt];
                }
            }
        }

        // When we read the notebook we use the values of the config as defaults, as again the text representation
        // of the notebook might not store the format options when notebook_metadata_filter="-all"
        if (read && this.config !== null) {
            this.config.setDefaultFormatOptions(this.fmt, read);
        }

        // We save the format options in the notebook metadata
        for (const opt of _VALID_FORMAT_OPTIONS) {
            if (opt in this.fmt) {
                if (!metadata.jupytext) {
                    metadata.jupytext = {};
                }
                metadata.jupytext[opt] = this.fmt[opt];
            }
        }

        // Is this format the same as that documented in the YAML header? If so, we want to know the format version
        const fileFmt = metadata.jupytext?.text_representation || {};
        if (this.fmt.extension === fileFmt.extension && 
            this.fmt.format_name === fileFmt.format_name) {
            Object.assign(this.fmt, fileFmt);
        }

        // rST to md conversion should happen only once
        if (metadata.jupytext?.rst2md === true) {
            metadata.jupytext.rst2md = false;
        }
    }

    reads(s: string, trackLineMapping: boolean = false): NotebookNode | { notebook: NotebookNode; cellLineMap: Array<{ cellIndex: number; startLine: number; endLine: number }> } {
        /**
         * Read a notebook represented as text, optionally tracking line mapping
         */
        if (this.fmt.format_name === "pandoc") {
            throw new Error("Pandoc format not yet implemented in TypeScript");
        }

        if (this.fmt.format_name === "quarto") {
            throw new Error("Quarto format not yet implemented in TypeScript");
        }

        if (this.fmt.format_name === "myst") {
            throw new Error("MyST format not yet implemented in TypeScript");
        }

        const lines = s.split('\n');
        const cells: CellNode[] = [];
        const cellLineMap: Array<{ cellIndex: number; startLine: number; endLine: number }> = [];
        
        const [metadata, jupyterMd, headerCell, pos] = headerToMetadataAndCell(
            lines,
            this.implementation.headerPrefix,
            this.implementation.headerSuffix,
            this.implementation.extension,
            this.fmt.root_level_metadata_as_raw_cell ?? 
            (this.config?.rootLevelMetadataAsRawCell ?? true)
        );
        
        const defaultLanguage = defaultLanguageFromMetadataAndExt(
            metadata, this.implementation.extension
        );
        
        this.updateFmtWithNotebookOptions(metadata, true);

        if (headerCell) {
            cells.push(headerCell);
        }

        let remainingLines = lines.slice(pos);
        let currentLineOffset = pos + 1; // 1-based line numbering

        if (this.implementation.formatName?.startsWith("sphinx")) {
            cells.push(newCodeCell("%matplotlib inline"));
        }

        let cellMetadataJson = false;
        let cellIndex = headerCell ? 1 : 0;

        while (remainingLines.length > 0) {
            const ReaderClass = this.implementation.cellReaderClass;
            if (!ReaderClass) {
                throw new Error(`No reader class for format ${this.implementation.formatName}`);
            }
            
            const cellStartLine = currentLineOffset;
            const reader = new ReaderClass(this.fmt, defaultLanguage);
            const [cell, cellPos] = reader.read(remainingLines);
            cells.push(cell);
            cellMetadataJson = cellMetadataJson || reader.cellMetadataJson;
            
            if (cellPos <= 0) {
                throw new Error(
                    "Blocked at lines " + remainingLines.slice(0, 6).join('\n')
                );
            }

            const cellEndLine = currentLineOffset + cellPos - 1;
            
            if (trackLineMapping) {
                cellLineMap.push({
                    cellIndex: cellIndex,
                    startLine: cellStartLine,
                    endLine: cellEndLine
                });
            }

            remainingLines = remainingLines.slice(cellPos);
            currentLineOffset += cellPos;
            cellIndex++;
        }

        const customCellMagics = (this.fmt.custom_cell_magics || "").split(",");
        setMainAndCellLanguage(
            metadata, cells, this.implementation.extension, customCellMagics
        );
        
        const cellMetadataSet = new Set<string>();
        for (const cell of cells) {
            Object.keys(cell.metadata).forEach(key => cellMetadataSet.add(key));
        }
        updateMetadataFilters(metadata, jupyterMd, cellMetadataSet);

        if (cellMetadataJson) {
            if (!metadata.jupytext) {
                metadata.jupytext = {};
            }
            metadata.jupytext.cell_metadata_json = true;
        }

        if (this.implementation.formatName?.startsWith("sphinx")) {
            const filteredCells: CellNode[] = [];
            const filteredLineMap: Array<{ cellIndex: number; startLine: number; endLine: number }> = [];
            let filteredIndex = 0;
            
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                if (cell.source === "" &&
                    i > 0 &&
                    i + 1 < cells.length &&
                    cells[i - 1].cell_type !== "markdown" &&
                    cells[i + 1].cell_type !== "markdown") {
                    continue;
                }
                filteredCells.push(cell);
                if (trackLineMapping && cellLineMap[i]) {
                    filteredLineMap.push({
                        ...cellLineMap[i],
                        cellIndex: filteredIndex
                    });
                }
                filteredIndex++;
            }
            
            if (trackLineMapping) {
                return {
                    notebook: newNotebook(filteredCells, metadata),
                    cellLineMap: filteredLineMap
                };
            }
            return newNotebook(filteredCells, metadata);
        }

        if (trackLineMapping) {
            return {
                notebook: newNotebook(cells, metadata),
                cellLineMap
            };
        }
        return newNotebook(cells, metadata);
    }

    filterNotebook(nb: NotebookNode, metadata: Record<string, any>, preserveCellIds: boolean = false): NotebookNode {
        this.updateFmtWithNotebookOptions(nb.metadata);
        const unsupportedKeys: string[] = [];
        metadata = insertJupytextInfoAndFilterMetadata(
            metadata, this.fmt, this.implementation, unsupportedKeys
        );
        // We sort the notebook metadata for consistency with v1.16
        metadata = Object.fromEntries(
            Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b))
        );

        const cells: CellNode[] = [];
        for (const cell of nb.cells) {
            const unsupportedKeysSet = new Set(unsupportedKeys);
            const cellMetadata = filterMetadata(
                cell.metadata,
                this.fmt.cell_metadata_filter,
                _IGNORE_CELL_METADATA,
                unsupportedKeysSet
            );
            // Convert back to array
            unsupportedKeys.length = 0;
            unsupportedKeys.push(...unsupportedKeysSet);

            const id = preserveCellIds && 'id' in cell ? { id: cell.id } : {};

            if (cell.cell_type === "code") {
                cells.push(newCodeCell(
                    Array.isArray(cell.source) ? cell.source.join('') : cell.source,
                    { ...cellMetadata, ...id }
                ));
            } else {
                cells.push({
                    source: cell.source,
                    metadata: cellMetadata,
                    cell_type: cell.cell_type as 'markdown' | 'raw',
                    ...id
                } as CellNode);
            }
        }

        warnOnUnsupportedKeys(unsupportedKeys);

        return {
            nbformat: nb.nbformat,
            nbformat_minor: nb.nbformat_minor,
            metadata,
            cells
        };
    }

    writes(nb: NotebookNode, metadata?: Record<string, any>): string {
        /**
         * Return the text representation of the notebook
         */
        if (this.fmt.format_name === "pandoc") {
            throw new Error("Pandoc format not yet implemented in TypeScript");
        }
        if (this.fmt.format_name === "quarto" || this.ext === ".qmd") {
            throw new Error("Quarto format not yet implemented in TypeScript");
        }
        if (this.fmt.format_name === "myst") {
            throw new Error("MyST format not yet implemented in TypeScript");
        }

        // Copy the notebook, in order to be sure we do not modify the original notebook
        const notebookCopy: NotebookNode = {
            nbformat: nb.nbformat,
            nbformat_minor: nb.nbformat_minor,
            metadata: JSON.parse(JSON.stringify(metadata || nb.metadata)),
            cells: nb.cells
        };

        const notebookMetadata = notebookCopy.metadata;
        const defaultLanguage = defaultLanguageFromMetadataAndExt(
            notebookMetadata, this.implementation.extension, true
        ) || "python";
        
        this.updateFmtWithNotebookOptions(notebookCopy.metadata);
        
        if (!("use_runtools" in this.fmt)) {
            for (const cell of notebookCopy.cells) {
                if (cell.metadata.hide_input || cell.metadata.hide_output) {
                    this.fmt.use_runtools = true;
                    break;
                }
            }
        }

        const header = encodingAndExecutable(notebookCopy, notebookMetadata, this.ext);
        const unsupportedKeys: string[] = [];
        const [headerContent, headerLinesToNextCell] = metadataAndCellToHeader(
            notebookCopy,
            notebookMetadata,
            this.implementation,
            this.fmt,
            unsupportedKeys
        );
        header.push(...headerContent);

        const cellExporters: any[] = [];
        let lookingForFirstMarkdownCell = this.implementation.formatName?.startsWith("sphinx") || false;
        const splitAtHeading = this.fmt.split_at_heading || false;

        for (const cell of notebookCopy.cells) {
            if (lookingForFirstMarkdownCell && cell.cell_type === "markdown") {
                if (!cell.metadata.cell_marker) {
                    cell.metadata.cell_marker = '"""';
                }
                lookingForFirstMarkdownCell = false;
            }

            const ExporterClass = this.implementation.cellExporterClass;
            if (!ExporterClass) {
                throw new Error(`No exporter class for format ${this.implementation.formatName}`);
            }
            
            cellExporters.push(new ExporterClass(
                cell, defaultLanguage, this.fmt, unsupportedKeys
            ));
        }

        warnOnUnsupportedKeys(unsupportedKeys);

        const texts = cellExporters.map(cell => cell.cellToText());
        let lines: string[] = [];

        // concatenate cells in reverse order to determine how many blank lines (pep8)
        for (let i = cellExporters.length - 1; i >= 0; i--) {
            const cell = cellExporters[i];
            let text = cell.removeEocMarker(texts[i], lines);

            if (i === 0 &&
                this.implementation.formatName?.startsWith("sphinx") &&
                (JSON.stringify(text) === JSON.stringify(["%matplotlib inline"]) ||
                 JSON.stringify(text) === JSON.stringify(["# %matplotlib inline"]))) {
                continue;
            }

            let linesToNextCell = cell.linesToNextCell;
            if (linesToNextCell === null || linesToNextCell === undefined) {
                linesToNextCell = pep8LinesBetweenCells(
                    text, lines, this.implementation.extension
                );
            }

            text.push(...Array(linesToNextCell).fill(""));

            // two blank lines between markdown cells in Rmd when those do not have explicit region markers
            if ([".md", ".markdown", ".Rmd"].includes(this.ext) && !cell.isCode()) {
                if (i + 1 < cellExporters.length &&
                    !cellExporters[i + 1].isCode() &&
                    !texts[i][0]?.startsWith("<!-- #") &&
                    !texts[i + 1][0]?.startsWith("<!-- #") &&
                    (!splitAtHeading || !(texts[i + 1]?.length > 0 && texts[i + 1][0].startsWith("#")))) {
                    text.push("");
                }
            }

            // "" between two consecutive code cells in sphinx
            if (this.implementation.formatName?.startsWith("sphinx") && cell.isCode()) {
                if (i + 1 < cellExporters.length && cellExporters[i + 1].isCode()) {
                    text.push('""');
                }
            }

            lines = [...text, ...lines];
        }

        let finalHeaderLinesToNextCell = headerLinesToNextCell;
        if (finalHeaderLinesToNextCell === null || finalHeaderLinesToNextCell === undefined) {
            finalHeaderLinesToNextCell = pep8LinesBetweenCells(
                headerContent, lines, this.implementation.extension
            );
        }

        header.push(...Array(finalHeaderLinesToNextCell).fill(""));

        return [...header, ...lines].join("\n");
    }

    splitFrontmatter(nb: NotebookNode): NotebookNode {
        /**
         * Use during this.reads to separate notebook metadata from other frontmatter.
         */
        const unsupportedKeys: string[] = [];
        const metadata = nb.metadata[_JUPYTER_METADATA_NAMESPACE] || {};
        delete nb.metadata[_JUPYTER_METADATA_NAMESPACE];
        
        this.updateFmtWithNotebookOptions({
            jupytext: {
                ...metadata.jupytext || {},
                ...nb.metadata.jupytext || {}
            }
        }, true);
        
        const result = metadataToMetadataAndCell(nb, metadata, this.fmt, unsupportedKeys);
        warnOnUnsupportedKeys(unsupportedKeys);
        return result;
    }

    mergeFrontmatter(nb: NotebookNode): NotebookNode {
        /**
         * Use during this.writes to rewrite notebook metadata as frontmatter content.
         */
        const unsupportedKeys: string[] = [];
        const result = metadataAndCellToMetadata(nb, this.fmt, unsupportedKeys);
        warnOnUnsupportedKeys(unsupportedKeys);
        return result;
    }
}

// Public API functions (lines 389-644)

export function reads(
    text: string, 
    fmt?: Record<string, any> | string, 
    asVersion: number = 4, 
    config: any = null,
    returnLineMapping: boolean = false
): NotebookNode | { notebook: NotebookNode; cellLineMap: Array<{ cellIndex: number; startLine: number; endLine: number }> } {
    /**
     * Read a notebook from a string
     */
    let format = fmt ? { ...longFormOneFormat(fmt) } : divineFormat(text);
    format = longFormOneFormat(format);
    const ext = format.extension;

    if (ext === ".ipynb") {
        // For .ipynb files, we would normally use nbformat.reads
        // For now, we'll parse as JSON and validate
        try {
            const nb = JSON.parse(text) as NotebookNode;
            if (nb.nbformat !== 4) {
                console.warn(
                    `Notebooks in nbformat version ${nb.nbformat}.${nb.nbformat_minor} are not supported by Jupytext. ` +
                    `Please consider converting them to nbformat version 4.x`
                );
            }
            if (returnLineMapping) {
                // For JSON notebooks, create a simple line map (each cell gets one line)
                const cellLineMap = nb.cells.map((_, index) => ({
                    cellIndex: index,
                    startLine: index + 1,
                    endLine: index + 1
                }));
                return { notebook: nb, cellLineMap };
            }
            return nb;
        } catch (error) {
            throw new Error(`Invalid JSON in .ipynb file: ${error}`);
        }
    }

    let formatName = readFormatFromMetadata(text, ext) || format.format_name;
    let formatOptions: Record<string, any> = {};

    if (!formatName) {
        [formatName, formatOptions] = guessFormat(text, ext);
    }

    if (formatName) {
        format.format_name = formatName;
    }

    Object.assign(format, formatOptions);
    const reader = new TextNotebookConverter(format, config);
    const result = reader.reads(text, returnLineMapping);
    
    if (typeof result === 'object' && 'notebook' in result) {
        // Result includes line mapping
        rearrangeJupytextMetadata(result.notebook.metadata);

        if (formatName && insertOrTestVersionNumber()) {
            if (!result.notebook.metadata.jupytext) {
                result.notebook.metadata.jupytext = {};
            }
            if (!result.notebook.metadata.jupytext.text_representation) {
                result.notebook.metadata.jupytext.text_representation = {};
            }
            Object.assign(result.notebook.metadata.jupytext.text_representation, {
                extension: ext,
                format_name: formatName
            });
        }
        
        return result;
    } else {
        // Result is just a notebook
        rearrangeJupytextMetadata(result.metadata);

        if (formatName && insertOrTestVersionNumber()) {
            if (!result.metadata.jupytext) {
                result.metadata.jupytext = {};
            }
            if (!result.metadata.jupytext.text_representation) {
                result.metadata.jupytext.text_representation = {};
            }
            Object.assign(result.metadata.jupytext.text_representation, {
                extension: ext,
                format_name: formatName
            });
        }
        
        return result;
    }
}

export function read(
    fp: string, 
    asVersion: number = 4, 
    fmt?: Record<string, any> | string, 
    config: any = null
): NotebookNode {
    /**
     * Read a notebook from a file name or a file object
     */
    // For browser environment, we assume fp is file content as string
    // In a full Node.js implementation, you would handle file reading here
    if (typeof fp !== 'string') {
        throw new Error('File reading not implemented in browser environment');
    }

    // Treat fp as file content
    const result = reads(fp, fmt, asVersion, config, false);
    return typeof result === 'object' && 'notebook' in result ? result.notebook : result;
}

export function writes(
    notebook: NotebookNode, 
    fmt: Record<string, any> | string, 
    version: number = 4, 
    config: any = null
): string {
    /**
     * Return the text representation of the notebook
     */
    if (version !== 4) {
        throw new NotSupportedNBFormatVersion(
            `Only nbformat version 4 is supported. Got version ${version}`
        );
    }

    if (notebook.nbformat < 4) {
        throw new NotSupportedNBFormatVersion(
            `Notebooks in nbformat version ${notebook.nbformat}.${notebook.nbformat_minor} are not supported by Jupytext. ` +
            `Please convert your notebooks to nbformat version 4`
        );
    }

    if (notebook.nbformat > 4 || (notebook.nbformat === 4 && notebook.nbformat_minor > 5)) {
        console.warn(
            `Notebooks in nbformat version ${notebook.nbformat}.${notebook.nbformat_minor} ` +
            `have not been tested with Jupytext version ${__version__}.`
        );
    }

    const metadata = JSON.parse(JSON.stringify(notebook.metadata));
    rearrangeJupytextMetadata(metadata);
    let format = { ...longFormOneFormat(fmt, metadata) };
    const ext = format.extension;
    let formatName = format.format_name;

    if (ext === ".ipynb") {
        return deterministicJSONStringify(dropTextRepresentationMetadata(notebook, metadata), 2);
    }

    if (!formatName) {
        formatName = formatNameForExt(metadata, ext, undefined, false);
    }

    // Since Jupytext==1.17, the default format for
    // writing a notebook to a script is the percent format
    if (!formatName && !("cell_markers" in format) && ext in SCRIPT_EXTENSIONS) {
        formatName = "percent";
    }

    if (formatName) {
        format.format_name = formatName;
        updateJupytextFormatsMetadata(metadata, format);
    }

    const writer = new TextNotebookConverter(format, config);
    return writer.writes(notebook, metadata);
}

export function write(
    nb: NotebookNode, 
    fp: string, 
    version: number = 4, 
    fmt?: Record<string, any> | string, 
    config: any = null
): string {
    /**
     * Write a notebook to a file name or a file object
     * In browser environment, returns the content as string
     */
    return writes(nb, fmt || {}, version, config);
}

// Utility functions

function deterministicJSONStringify(obj: any, space?: string | number): string {
    /**
     * JSON.stringify with consistent property ordering for objects
     */
    return JSON.stringify(obj, (key, value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Sort object keys for consistent ordering
            const sortedObj: Record<string, any> = {};
            const sortedKeys = Object.keys(value).sort();
            for (const sortedKey of sortedKeys) {
                sortedObj[sortedKey] = value[sortedKey];
            }
            return sortedObj;
        }
        return value;
    }, space);
}

function dropTextRepresentationMetadata(notebook: NotebookNode, metadata?: Record<string, any>): NotebookNode {
    /**
     * When the notebook is saved to an ipynb file, we drop the text_representation metadata
     */
    const finalMetadata = metadata || JSON.parse(JSON.stringify(notebook.metadata));

    const jupytextMetadata = finalMetadata.jupytext || {};
    delete jupytextMetadata.text_representation;

    // Remove the jupytext section if empty
    if (Object.keys(jupytextMetadata).length === 0) {
        delete finalMetadata.jupytext;
    }

    return {
        nbformat: notebook.nbformat,
        nbformat_minor: notebook.nbformat_minor,
        metadata: finalMetadata,
        cells: notebook.cells
    };
}

function warnOnUnsupportedKeys(unsupportedKeys: string[]): void {
    if (unsupportedKeys.length > 0) {
        console.warn(
            `The following metadata cannot be exported ` +
            `to the text notebook: ${unsupportedKeys.sort()}`
        );
    }
}
