/**
 * Parse header of text notebooks
 * Converted from src/jupytext/header.py
 */

import { load as yamlLoad, dump as yamlDump } from 'js-yaml';
import { SCRIPT_EXTENSIONS, commentLines, defaultLanguageFromMetadataAndExt } from './languages.js';
import { filterMetadata, _DEFAULT_NOTEBOOK_METADATA, _DEFAULT_ROOT_LEVEL_METADATA, _JUPYTER_METADATA_NAMESPACE } from './metadataFilter.js';

// Re-export for other modules
export { _JUPYTER_METADATA_NAMESPACE };
import { pep8LinesBetweenCells } from './pep8.js';
import { __version__ } from './version.js';
import { NotebookNode, CellNode, newRawCell } from './types.js';

// MyST format placeholder (will be implemented later)
const MYST_FORMAT_NAME = "myst";

// Regex patterns (lines 29-33)
const _HEADER_RE = /^---\s*$/;
const _BLANK_RE = /^\s*$/;
const _JUPYTER_RE = /^jupyter\s*:\s*$/;
const _LEFTSPACE_RE = /^\s/;
const _UTF8_HEADER = " -*- coding: utf-8 -*-";

// Change this to False in tests (lines 35-36)
let INSERT_AND_CHECK_VERSION_NUMBER = true;

// Functions (lines 39-371)

export function insertOrTestVersionNumber(): boolean {
    /**
     * Should the format name and version number be inserted in text
     * representations (not in tests!)
     */
    return INSERT_AND_CHECK_VERSION_NUMBER;
}

export function setInsertAndCheckVersionNumber(value: boolean): void {
    INSERT_AND_CHECK_VERSION_NUMBER = value;
}

export function uncommentLine(line: string, prefix: string, suffix: string = ""): string {
    /**
     * Remove prefix (and space) from line
     */
    let result = line;
    if (prefix) {
        if (result.startsWith(prefix + " ")) {
            result = result.slice(prefix.length + 1);
        } else if (result.startsWith(prefix)) {
            result = result.slice(prefix.length);
        }
    }
    if (suffix) {
        if (result.endsWith(suffix + " ")) {
            result = result.slice(0, -(1 + suffix.length));
        } else if (result.endsWith(suffix)) {
            result = result.slice(0, -suffix.length);
        }
    }
    return result;
}

export function encodingAndExecutable(
    notebook: NotebookNode, 
    metadata: Record<string, any>, 
    ext: string
): string[] {
    /**
     * Return encoding and executable lines for a notebook, if applicable
     */
    const lines: string[] = [];
    const comment = SCRIPT_EXTENSIONS[ext]?.comment;
    const jupytextMetadata = metadata.jupytext || {};

    if (comment !== undefined && "executable" in jupytextMetadata) {
        lines.push("#!" + jupytextMetadata.executable);
        delete jupytextMetadata.executable;
    }

    if (comment !== undefined) {
        if ("encoding" in jupytextMetadata) {
            lines.push(jupytextMetadata.encoding);
            delete jupytextMetadata.encoding;
        } else if (defaultLanguageFromMetadataAndExt(metadata, ext) !== "python") {
            for (const cell of notebook.cells) {
                try {
                    // Check if source contains non-ASCII characters
                    const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
                    // Simple ASCII check - if any character code > 127, it's non-ASCII
                    for (let i = 0; i < source.length; i++) {
                        if (source.charCodeAt(i) > 127) {
                            lines.push(comment + _UTF8_HEADER);
                            return lines;
                        }
                    }
                } catch (error) {
                    lines.push(comment + _UTF8_HEADER);
                    break;
                }
            }
        }
    }

    return lines;
}

export function insertJupytextInfoAndFilterMetadata(
    metadata: Record<string, any>,
    fmt: Record<string, any>,
    textFormat: any,
    unsupportedKeys?: string[]
): Record<string, any> {
    /**
     * Update the notebook metadata to include Jupytext information, and filter
     * the notebook metadata according to the default or user filter
     */
    if (insertOrTestVersionNumber()) {
        if (!metadata.jupytext) {
            metadata.jupytext = {};
        }
        metadata.jupytext.text_representation = {
            extension: fmt.extension,
            format_name: textFormat.formatName,
            format_version: textFormat.currentVersionNumber,
            jupytext_version: __version__,
        };
    }

    if ("jupytext" in metadata && !metadata.jupytext) {
        delete metadata.jupytext;
    }

    const notebookMetadataFilter = fmt.notebook_metadata_filter;
    return filterMetadata(
        metadata,
        notebookMetadataFilter,
        _DEFAULT_NOTEBOOK_METADATA,
        unsupportedKeys ? new Set(unsupportedKeys) : undefined
    );
}

export function metadataAndCellToHeader(
    notebook: NotebookNode,
    metadata: Record<string, any>,
    textFormat: any,
    fmt: Record<string, any>,
    unsupportedKeys?: string[]
): [string[], number | null] {
    /**
     * Return the text header corresponding to a notebook, and remove the
     * first cell of the notebook if it contained the header
     */
    let header: string[] = [];
    let linesToNextCell: number | null = null;
    let rootLevelMetadata: Record<string, any> = {};
    const rootLevelMetadataAsRawCell = fmt.root_level_metadata_as_raw_cell !== false;

    if (!rootLevelMetadataAsRawCell) {
        const jupytextMd = metadata.jupytext || {};
        if ("root_level_metadata" in jupytextMd) {
            rootLevelMetadata = jupytextMd.root_level_metadata;
            delete jupytextMd.root_level_metadata;
        }
    } else if (notebook.cells.length > 0) {
        const cell = notebook.cells[0];
        if (cell.cell_type === "raw") {
            const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            const lines = source.trim().split('\n');
            if (lines.length >= 2 && 
                _HEADER_RE.test(lines[0]) && 
                _HEADER_RE.test(lines[lines.length - 1])) {
                header = lines.slice(1, -1);
                linesToNextCell = cell.metadata?.lines_to_next_cell || null;
                notebook.cells = notebook.cells.slice(1);
            }
        }
    }

    metadata = insertJupytextInfoAndFilterMetadata(
        metadata, fmt, textFormat, unsupportedKeys
    );

    if (metadata && Object.keys(metadata).length > 0) {
        rootLevelMetadata.jupyter = metadata;
    }

    if (rootLevelMetadata && Object.keys(rootLevelMetadata).length > 0) {
        const yamlString = yamlDump(rootLevelMetadata, { flowLevel: -1, sortKeys: true });
        header.push(...yamlString.split('\n').filter((line: string) => line.trim() !== ''));
    }

    if (header.length > 0) {
        header = ["---", ...header, "---"];

        if (fmt.hide_notebook_metadata && textFormat.formatName === "markdown") {
            header = ["<!--", "", ...header, "", "-->"];
        }
    }

    return [
        commentLines(header, textFormat.headerPrefix, textFormat.headerSuffix),
        linesToNextCell,
    ];
}

export function recursiveUpdate(
    target: Record<string, any>,
    update: Record<string, any>,
    overwrite: boolean = true
): Record<string, any> {
    /**
     * Update recursively a (nested) dictionary with the content of another.
     * Inspired from https://stackoverflow.com/questions/3232943/update-value-of-a-nested-dictionary-of-varying-depth
     */
    for (const key in update) {
        const value = update[key];
        if (value === null || value === undefined) {
            delete target[key];
        } else if (typeof value === 'object' && !Array.isArray(value)) {
            target[key] = recursiveUpdate(
                target[key] || {},
                value,
                overwrite
            );
        } else if (overwrite) {
            target[key] = value;
        } else {
            if (!(key in target)) {
                target[key] = value;
            }
        }
    }
    return target;
}

export function headerToMetadataAndCell(
    lines: string[],
    headerPrefix: string,
    headerSuffix: string,
    ext?: string,
    rootLevelMetadataAsRawCell: boolean = true
): [Record<string, any>, any, CellNode | null, number] {
    /**
     * Return the metadata, a boolean to indicate if a jupyter section was found,
     * the first cell of notebook if some metadata is found outside
     * the jupyter section, and next loc in text
     */
    const header: string[] = [];
    const jupyter: string[] = [];
    let inJupyter = false;
    let inHtmlDiv = false;

    let start = 0;
    let started = false;
    let ended = false;
    let metadata: Record<string, any> = {};
    let i = -1;

    const comment = headerPrefix === "#'" ? "#" : headerPrefix;

    const encodingRe = new RegExp(
        `^[ \\t\\f]*${escapeRegex(comment)}.*?coding[:=][ \\t]*([-_.a-zA-Z0-9]+)`
    );

    for (i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (i === 0 && line.startsWith("#!")) {
            if (!metadata.jupytext) {
                metadata.jupytext = {};
            }
            metadata.jupytext.executable = line.slice(2);
            start = i + 1;
            continue;
        }
        
        if (i === 0 || (i === 1 && !encodingRe.test(lines[0]))) {
            const encodingMatch = encodingRe.exec(line);
            if (encodingMatch) {
                if (encodingMatch[1] !== "utf-8") {
                    throw new Error("Encodings other than utf-8 are not supported");
                }
                if (!metadata.jupytext) {
                    metadata.jupytext = {};
                }
                metadata.jupytext.encoding = line;
                start = i + 1;
                continue;
            }
        }
        
        if (!line.startsWith(headerPrefix)) {
            break;
        }
        
        if (!comment) {
            if (line.trim().startsWith("<!--")) {
                inHtmlDiv = true;
                continue;
            }
        }

        if (inHtmlDiv) {
            if (ended) {
                if (line.includes("-->")) {
                    break;
                }
            }
            if (!started && !line.trim()) {
                continue;
            }
        }

        const uncommentedLine = uncommentLine(line, headerPrefix, headerSuffix);
        if (_HEADER_RE.test(uncommentedLine)) {
            if (!started) {
                started = true;
                continue;
            }
            ended = true;
            if (inHtmlDiv) {
                continue;
            }
            break;
        }

        // Stop if there is something else than a YAML header
        if (!started && uncommentedLine.trim()) {
            break;
        }

        if (_JUPYTER_RE.test(uncommentedLine)) {
            inJupyter = true;
        } else if (uncommentedLine && !_LEFTSPACE_RE.test(uncommentedLine)) {
            inJupyter = false;
        }

        if (inJupyter) {
            jupyter.push(uncommentedLine);
        } else {
            header.push(uncommentedLine);
        }
    }

    if (ended) {
        if (jupyter.length > 0) {
            const extraMetadata = metadata;
            try {
                const parsedJupyter = yamlLoad(jupyter.join('\n')) as Record<string, any>;
                metadata = parsedJupyter.jupyter || {};
                recursiveUpdate(metadata, extraMetadata);
            } catch (error) {
                console.warn("Failed to parse YAML in jupyter section:", error);
            }
        }

        let linesToNextCell = 1;
        if (i + 1 < lines.length) {
            const nextLine = uncommentLine(lines[i + 1], headerPrefix);
            if (!_BLANK_RE.test(nextLine)) {
                linesToNextCell = 0;
            } else {
                i = i + 1;
            }
        } else {
            linesToNextCell = 0;
        }

        let cell: CellNode | null = null;
        if (header.length > 0) {
            if (rootLevelMetadataAsRawCell) {
                const cellSource = ["---", ...header, "---"].join('\n');
                const expectedLines = ext ? pep8LinesBetweenCells(["---"], lines.slice(i + 1), ext) : 1;
                const cellMetadata = linesToNextCell === expectedLines 
                    ? {} 
                    : { lines_to_next_cell: linesToNextCell };
                cell = newRawCell(cellSource, cellMetadata);
            } else {
                try {
                    const rootLevelMetadata = yamlLoad(header.join('\n')) as Record<string, any>;
                    if (!metadata.jupytext) {
                        metadata.jupytext = {};
                    }
                    metadata.jupytext.root_level_metadata = rootLevelMetadata;
                } catch (error) {
                    console.warn("Failed to parse YAML in header:", error);
                }
            }
        }

        return [metadata, jupyter.length > 0, cell, i + 1];
    }

    return [metadata, false, null, start];
}

export function defaultRootLevelMetadataFilter(fmt?: Record<string, any>): string {
    /**
     * Return defaults for settings that promote or demote root level metadata.
     */
    if (fmt && fmt.format_name === MYST_FORMAT_NAME) {
        // MyST format would have different defaults, but we'll use the standard for now
        return _DEFAULT_ROOT_LEVEL_METADATA;
    } else {
        return _DEFAULT_ROOT_LEVEL_METADATA;
    }
}

export function metadataToMetadataAndCell(
    nb: NotebookNode,
    metadata: Record<string, any>,
    fmt: Record<string, any>,
    unsupportedKeys?: string[]
): NotebookNode {
    // Stash notebook metadata, including keys promoted to the root level
    metadata = recursiveUpdate(
        metadata,
        filterMetadata(
            nb.metadata,
            fmt.root_level_metadata_filter || "",
            defaultRootLevelMetadataFilter(fmt),
            unsupportedKeys ? new Set(unsupportedKeys) : undefined,
            true // remove
        )
    );
    
    // Move remaining metadata (i.e. frontmatter) to the first notebook cell
    if (nb.metadata && Object.keys(nb.metadata).length > 0 && fmt.root_level_metadata_as_raw_cell !== false) {
        const frontmatter = yamlDump(nb.metadata, { sortKeys: true });
        nb.cells.unshift(newRawCell("---\n" + frontmatter + "---"));
    }
    
    // Attach the stashed metadata to notebook
    nb.metadata = metadata;
    return nb;
}

export function metadataAndCellToMetadata(
    nb: NotebookNode,
    fmt: Record<string, any>,
    unsupportedKeys?: string[]
): NotebookNode {
    // New metadata from filtered nb.metadata
    let metadata = filterMetadata(
        nb.metadata,
        fmt.root_level_metadata_filter || "",
        defaultRootLevelMetadataFilter(fmt),
        unsupportedKeys ? new Set(unsupportedKeys) : undefined,
        true // remove
    );
    
    // Remaining nb.metadata moved under namespace key for jupyter metadata
    if (nb.metadata && Object.keys(nb.metadata).length > 0) {
        metadata[_JUPYTER_METADATA_NAMESPACE] = nb.metadata;
    }
    
    // Move first cell frontmatter to the root level of nb.metadata (overwrites)
    if (nb.cells.length > 0 && fmt.root_level_metadata_as_raw_cell !== false) {
        const cell = nb.cells[0];
        if (cell.cell_type === "raw") {
            const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            const lines = source.trim().split('\n');
            if (lines.length >= 2 && 
                _HEADER_RE.test(lines[0]) && 
                _HEADER_RE.test(lines[lines.length - 1])) {
                try {
                    const frontmatter = yamlLoad(source) as Record<string, any>;
                    if (frontmatter && typeof frontmatter === 'object') {
                        nb.cells = nb.cells.slice(1);
                        if (!("root_level_metadata_filter" in fmt) &&
                            defaultRootLevelMetadataFilter(fmt) === "all") {
                            if (!metadata.jupytext) {
                                metadata.jupytext = {};
                            }
                            metadata.jupytext.root_level_metadata_filter = 
                                "-" + Object.keys(frontmatter).sort().join(",-");
                        }
                        metadata = recursiveUpdate(frontmatter, metadata, false);
                    }
                } catch (error) {
                    console.warn("[jupytext] failed to parse YAML in raw cell:", error);
                }
            }
        }
    }
    
    nb.metadata = metadata;
    return nb;
}

// Utility function for regex escaping
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
