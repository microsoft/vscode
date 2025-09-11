/**
 * In this file the various text notebooks formats are defined
 * Converted from src/jupytext/formats.py
 */

import { SCRIPT_EXTENSIONS, COMMENT_CHARS, sameLanguage } from './languages.js';
import { StringParser } from './stringParser.js';
import { __version__ } from './version.js';
import { 
    MarkdownCellReader,
    RMarkdownCellReader,
    RScriptCellReader,
    LightScriptCellReader,
    DoublePercentScriptCellReader,
    HydrogenCellReader,
    SphinxGalleryScriptCellReader
} from './cellReader.js';
import {
    MarkdownCellExporter,
    RMarkdownCellExporter,
    LightScriptCellExporter,
    BareScriptCellExporter,
    RScriptCellExporter,
    DoublePercentCellExporter,
    HydrogenCellExporter,
    SphinxGalleryCellExporter
} from './cellToText.js';
import { headerToMetadataAndCell, insertOrTestVersionNumber } from './header.js';
import { metadataFilterAsString } from './metadataFilter.js';
import { isMagic } from './magics.js';

// Error classes (lines 48-50)
export class JupytextFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'JupytextFormatError';
    }
}

// Format description class (lines 52-74)
export class NotebookFormatDescription {
    formatName: string;
    extension: string;
    headerPrefix: string;
    headerSuffix: string;
    cellReaderClass: any;
    cellExporterClass: any;
    currentVersionNumber: string;
    minReadableVersionNumber: string | null;

    constructor(
        formatName: string,
        extension: string,
        headerPrefix: string,
        cellReaderClass: any,
        cellExporterClass: any,
        currentVersionNumber: string,
        headerSuffix: string = "",
        minReadableVersionNumber: string | null = null
    ) {
        this.formatName = formatName;
        this.extension = extension;
        this.headerPrefix = headerPrefix;
        this.headerSuffix = headerSuffix;
        this.cellReaderClass = cellReaderClass;
        this.cellExporterClass = cellExporterClass;
        this.currentVersionNumber = currentVersionNumber;
        this.minReadableVersionNumber = minReadableVersionNumber;
    }
}

// Cell readers and exporters are now imported from their respective modules

// MyST format placeholders (will be implemented later)
const MYST_FORMAT_NAME = "myst";
function isMystAvailable(): boolean { return false; }
function matchesMystnb(text: string, ext: string, requiresMeta: boolean): boolean { return false; }
function mystExtensions(): string[] { return []; }
function mystVersion(): string { return "0.0.0"; }

// Pandoc placeholders (will be implemented later)
function isPandocAvailable(): boolean { return false; }
function pandocVersion(): string { return "0.0.0"; }

// Some functions still need placeholder implementations for features not yet supported

// JUPYTEXT_FORMATS tuple (lines 76-235)
export const JUPYTEXT_FORMATS: NotebookFormatDescription[] = [
    // Markdown formats (lines 77-114)
    new NotebookFormatDescription(
        "markdown",
        ".md",
        "",
        MarkdownCellReader,
        MarkdownCellExporter,
        "1.3",
        "",
        "1.0"
    ),
    new NotebookFormatDescription(
        "markdown",
        ".markdown", 
        "",
        MarkdownCellReader,
        MarkdownCellExporter,
        "1.2",
        "",
        "1.0"
    ),
    new NotebookFormatDescription(
        "rmarkdown",
        ".Rmd",
        "",
        RMarkdownCellReader,
        RMarkdownCellExporter,
        "1.2",
        "",
        "1.0"
    ),
    // Light script formats (lines 115-136)
    ...Object.keys(SCRIPT_EXTENSIONS).map(ext =>
        new NotebookFormatDescription(
            "light",
            ext,
            SCRIPT_EXTENSIONS[ext].comment,
            LightScriptCellReader,
            LightScriptCellExporter,
            "1.5",
            SCRIPT_EXTENSIONS[ext].comment_suffix || "",
            "1.1"
        )
    ),
    // Nomarker formats (lines 137-149)
    ...Object.keys(SCRIPT_EXTENSIONS).map(ext =>
        new NotebookFormatDescription(
            "nomarker",
            ext,
            SCRIPT_EXTENSIONS[ext].comment,
            LightScriptCellReader,
            BareScriptCellExporter,
            "1.0",
            SCRIPT_EXTENSIONS[ext].comment_suffix || "",
            "1.0"
        )
    ),
    // Percent formats (lines 150-168) - KEY FOR VSCODE
    ...Object.keys(SCRIPT_EXTENSIONS).map(ext =>
        new NotebookFormatDescription(
            "percent",
            ext,
            SCRIPT_EXTENSIONS[ext].comment,
            DoublePercentScriptCellReader,
            DoublePercentCellExporter,
            "1.3",
            SCRIPT_EXTENSIONS[ext].comment_suffix || "",
            "1.1"
        )
    ),
    // Hydrogen formats (lines 169-182)
    ...Object.keys(SCRIPT_EXTENSIONS).map(ext =>
        new NotebookFormatDescription(
            "hydrogen",
            ext,
            SCRIPT_EXTENSIONS[ext].comment,
            HydrogenCellReader,
            HydrogenCellExporter,
            "1.3",
            SCRIPT_EXTENSIONS[ext].comment_suffix || "",
            "1.1"
        )
    ),
    // Spin formats (lines 183-194)
    new NotebookFormatDescription(
        "spin",
        ".r",
        "#'",
        RScriptCellReader,
        RScriptCellExporter,
        "1.0"
    ),
    new NotebookFormatDescription(
        "spin",
        ".R",
        "#'",
        RScriptCellReader,
        RScriptCellExporter,
        "1.0"
    ),
    // Special formats (lines 195-235)
    new NotebookFormatDescription(
        "sphinx",
        ".py",
        "#",
        SphinxGalleryScriptCellReader,
        SphinxGalleryCellExporter,
        "1.1"
    ),
    new NotebookFormatDescription(
        "pandoc",
        ".md",
        "",
        null,
        null,
        pandocVersion()
    ),
    new NotebookFormatDescription(
        "quarto",
        ".qmd",
        "",
        null,
        null,
        "1.0"
    ),
    // MyST formats (lines 224-235)
    ...mystExtensions().map(ext =>
        new NotebookFormatDescription(
            MYST_FORMAT_NAME,
            ext,
            "",
            null,
            null,
            mystVersion()
        )
    )
];

// Notebook extensions (lines 237-239)
export const NOTEBOOK_EXTENSIONS = [
    ".ipynb",
    ...Array.from(new Set(JUPYTEXT_FORMATS.map(fmt => fmt.extension)))
];

export const EXTENSION_PREFIXES = [".lgt", ".spx", ".pct", ".hyd", ".nb"];

// Functions (lines 243-869)

export function getFormatImplementation(ext: string, formatName?: string): NotebookFormatDescription {
    // Remove pre-extension if any
    ext = "." + ext.split(".").pop();

    const formatsForExtension: string[] = [];
    for (const fmt of JUPYTEXT_FORMATS) {
        if (fmt.extension === ext) {
            if (fmt.formatName === formatName || !formatName) {
                return fmt;
            }
            formatsForExtension.push(fmt.formatName);
        }
    }

    if (formatsForExtension.length > 0) {
        throw new JupytextFormatError(
            `Format '${formatName}' is not associated to extension '${ext}'. ` +
            `Please choose one of: ${formatsForExtension.join(", ")}.`
        );
    }
    throw new JupytextFormatError(`No format associated to extension '${ext}'`);
}

export function readMetadata(text: string, ext: string): Record<string, any> {
    ext = "." + ext.split(".").pop();
    const lines = text.split('\n');

    let comment: string;
    let commentSuffix: string;
    
    if ([".md", ".markdown", ".Rmd"].includes(ext)) {
        comment = "";
        commentSuffix = "";
    } else {
        comment = SCRIPT_EXTENSIONS[ext]?.comment || "#";
        commentSuffix = SCRIPT_EXTENSIONS[ext]?.comment_suffix || "";
    }

    let [metadata] = headerToMetadataAndCell(lines, comment, commentSuffix, ext);
    if ([".r", ".R"].includes(ext) && Object.keys(metadata).length === 0) {
        [metadata] = headerToMetadataAndCell(lines, "#'", "", ext);
    }

    // MyST format metadata may be at root level
    if (Object.keys(metadata).length === 0 && 
        mystExtensions().includes(ext) && 
        text.startsWith("---")) {
        // Would parse YAML here, but skipping for now
        return metadata;
    }

    return metadata;
}

export function readFormatFromMetadata(text: string, ext: string): string | null {
    const metadata = readMetadata(text, ext);
    rearrangeJupytextMetadata(metadata);
    return formatNameForExt(metadata, ext, undefined, false);
}

export function guessFormat(text: string, ext: string): [string, Record<string, any>] {
    const metadata = readMetadata(text, ext);

    if (metadata.jupytext?.text_representation) {
        return [formatNameForExt(metadata, ext) || "", {}];
    }

    if (isMystAvailable() && 
        mystExtensions().includes(ext) && 
        matchesMystnb(text, ext, false)) {
        return [MYST_FORMAT_NAME, {}];
    }

    const lines = text.split('\n');

    // Analyze script files for format markers
    if (ext in SCRIPT_EXTENSIONS) {
        const unescapedComment = SCRIPT_EXTENSIONS[ext].comment;
        const comment = escapeRegex(unescapedComment);
        const language = SCRIPT_EXTENSIONS[ext].language;
        
        // Define regex patterns (lines 326-331)
        const twentyHashRe = /^#( |)#{19,}\s*$/;
        const doublePercentRe = new RegExp(`^${comment}( %%|%%)$`);
        const doublePercentAndSpaceRe = new RegExp(`^${comment}( %%|%%)\s`);
        const nbconvertScriptRe = new RegExp(`^${comment}( <codecell>| In\\[[0-9 ]*\\]:?)`);
        const vimFoldingMarkersRe = new RegExp(`^${comment}\\s*` + '{{{');
        const vscodeFoldingMarkersRe = new RegExp(`^${comment}\\s*region`);

        // Count different marker types
        let twentyHashCount = 0;
        let doublePercentCount = 0;
        let magicCommandCount = 0;
        let rspinCommentCount = 0;
        let vimFoldingMarkersCount = 0;
        let vscodeFoldingMarkersCount = 0;

        const parser = new StringParser([".r", ".R"].includes(ext) ? "R" : "python");
        
        for (const line of lines) {
            parser.readLine(line);
            if (parser.isQuoted()) {
                continue;
            }

            // Count cell markers (lines 346-367)
            if (doublePercentRe.test(line) || 
                doublePercentAndSpaceRe.test(line) || 
                nbconvertScriptRe.test(line)) {
                doublePercentCount++;
            }

            if (!line.startsWith(unescapedComment) && isMagic(line, language)) {
                magicCommandCount++;
            }

            if (twentyHashRe.test(line) && ext === ".py") {
                twentyHashCount++;
            }

            if (line.startsWith("#'") && [".R", ".r"].includes(ext)) {
                rspinCommentCount++;
            }

            if (vimFoldingMarkersRe.test(line)) {
                vimFoldingMarkersCount++;
            }

            if (vscodeFoldingMarkersRe.test(line)) {
                vscodeFoldingMarkersCount++;
            }
        }

        // Determine format based on marker counts (lines 369-384)
        if (doublePercentCount >= 1) {
            if (magicCommandCount) {
                return ["hydrogen", {}];
            }
            return ["percent", {}]; // ← KEY FORMAT FOR VSCODE
        }

        if (vimFoldingMarkersCount) {
            return ["light", { cell_markers: "{{{,}}}" }];
        }

        if (vscodeFoldingMarkersCount) {
            return ["light", { cell_markers: "region,endregion" }];
        }

        if (twentyHashCount >= 2) {
            return ["sphinx", {}];
        }

        if (rspinCommentCount >= 1) {
            return ["spin", {}];
        }
    }

    // Check markdown files for Pandoc divs
    if ([".md", ".markdown"].includes(ext)) {
        for (const line of lines) {
            if (line.startsWith(':::')) {
                return ["pandoc", {}];
            }
        }
    }

    // Default format
    return [getFormatImplementation(ext).formatName, {}];
}

export function divineFormat(text: string): string {
    try {
        JSON.parse(text);
        // If it parses as JSON, assume it's a notebook
        return "ipynb";
    } catch {
        // Not JSON
    }

    const lines = text.split('\n');
    for (const comment of ["", "#", ...COMMENT_CHARS]) {
        const [metadata] = headerToMetadataAndCell(lines, comment, "", "");
        const ext = metadata.jupytext?.text_representation?.extension;
        if (ext) {
            return ext.slice(1) + ":" + guessFormat(text, ext)[0];
        }
    }

    // No metadata, but ``` on at least one line => markdown
    for (const line of lines) {
        if (line === "```") {
            return "md";
        }
    }

    return "py:" + guessFormat(text, ".py")[0];
}

export function checkFileVersion(notebook: any, sourcePath: string, outputsPath: string): void {
    if (!insertOrTestVersionNumber()) {
        return;
    }

    let ext: string;
    if (sourcePath === "-") {
        ext = notebook.metadata.jupytext.text_representation.extension;
    } else {
        ext = "." + sourcePath.split(".").pop();
        if (ext.endsWith(".ipynb")) {
            throw new Error(`source_path=${sourcePath} should be a text file`);
        }
    }

    const version = notebook.metadata?.jupytext?.text_representation?.format_version;
    const formatName = formatNameForExt(notebook.metadata, ext);
    const fmt = getFormatImplementation(ext, formatName || undefined);
    const current = fmt.currentVersionNumber;

    // Missing version, still generated by jupytext?
    let actualVersion = version;
    if (notebook.metadata && !version) {
        actualVersion = current;
    }

    // Same version? OK
    if (actualVersion === fmt.currentVersionNumber) {
        return;
    }

    // Version within readable range
    const minVersion = fmt.minReadableVersionNumber || current;
    if (minVersion <= actualVersion && actualVersion <= current) {
        return;
    }

    const jupytextVersionInFile = notebook.metadata?.jupytext?.text_representation?.jupytext_version || "N/A";

    throw new JupytextFormatError(
        `The file ${sourcePath.split('/').pop()} was generated with jupytext version ${jupytextVersionInFile} ` +
        `but you have ${__version__} installed. Please upgrade jupytext to version ` +
        `${jupytextVersionInFile}, or remove either ${sourcePath.split('/').pop()} or ${outputsPath.split('/').pop()}. ` +
        `This error occurs because ${sourcePath.split('/').pop()} is in the ${formatName} format in version ${actualVersion}, ` +
        `while jupytext version ${__version__} can only read the ` +
        `${formatName} format in versions ${minVersion} to ${current}.`
    );
}

export function formatNameForExt(
    metadata: Record<string, any>, 
    ext: string, 
    cmDefaultFormats?: string, 
    explicitDefault: boolean = true
): string | null {
    // Is the format information available in the text representation?
    const textRepr = metadata.jupytext?.text_representation || {};
    if (textRepr.extension?.endsWith(ext) && textRepr.format_name) {
        return textRepr.format_name;
    }

    // Format from jupytext.formats
    const formats = metadata.jupytext?.formats || cmDefaultFormats;
    const longFormFormats = longFormMultipleFormats(formats);
    for (const fmt of longFormFormats) {
        if (fmt.extension === ext) {
            if (!explicitDefault || fmt.format_name) {
                return fmt.format_name;
            }
        }
    }

    if (!explicitDefault || [".md", ".markdown", ".Rmd"].includes(ext)) {
        return null;
    }

    return getFormatImplementation(ext).formatName;
}

export function identicalFormatPath(fmt1: Record<string, any>, fmt2: Record<string, any>): boolean {
    for (const key of ["extension", "prefix", "suffix"]) {
        if (fmt1[key] !== fmt2[key]) {
            return false;
        }
    }
    return true;
}

export function updateJupytextFormatsMetadata(metadata: Record<string, any>, newFormat: Record<string, any>): void {
    const newFormatLong = longFormOneFormat(newFormat);
    const formats = longFormMultipleFormats(metadata.jupytext?.formats || "");
    if (formats.length === 0) {
        return;
    }

    for (const fmt of formats) {
        if (identicalFormatPath(fmt, newFormatLong)) {
            fmt.format_name = newFormatLong.format_name;
            break;
        }
    }

    metadata.jupytext = metadata.jupytext || {};
    metadata.jupytext.formats = shortFormMultipleFormats(formats);
}

export function rearrangeJupytextMetadata(metadata: Record<string, any>): void {
    // Backward compatibility with nbrmd
    for (const key of ["nbrmd_formats", "nbrmd_format_version"]) {
        if (key in metadata) {
            metadata[key.replace("nbrmd", "jupytext")] = metadata[key];
            delete metadata[key];
        }
    }

    const jupytextMetadata = metadata.jupytext || {};

    if ("jupytext_formats" in metadata) {
        jupytextMetadata.formats = metadata.jupytext_formats;
        delete metadata.jupytext_formats;
    }
    if ("jupytext_format_version" in metadata) {
        jupytextMetadata.text_representation = {
            format_version: metadata.jupytext_format_version
        };
        delete metadata.jupytext_format_version;
    }
    if ("main_language" in metadata) {
        jupytextMetadata.main_language = metadata.main_language;
        delete metadata.main_language;
    }
    for (const entry of ["encoding", "executable"]) {
        if (entry in metadata) {
            jupytextMetadata[entry] = metadata[entry];
            delete metadata[entry];
        }
    }

    const filters = jupytextMetadata.metadata_filter || {};
    if ("notebook" in filters) {
        jupytextMetadata.notebook_metadata_filter = filters.notebook;
    }
    if ("cells" in filters) {
        jupytextMetadata.cell_metadata_filter = filters.cells;
    }
    delete jupytextMetadata.metadata_filter;

    for (const filterLevel of ["notebook_metadata_filter", "cell_metadata_filter"]) {
        if (filterLevel in jupytextMetadata) {
            jupytextMetadata[filterLevel] = metadataFilterAsString(jupytextMetadata[filterLevel]);
        }
    }

    if (jupytextMetadata.text_representation?.jupytext_version?.startsWith("0.")) {
        const formats = jupytextMetadata.formats;
        if (formats) {
            jupytextMetadata.formats = formats.split(",").map((fmt: string) => 
                fmt.includes(".") && fmt.lastIndexOf(".") > 0 ? "." + fmt : fmt
            ).join(",");
        }
    }

    // auto to actual extension
    const formats = jupytextMetadata.formats;
    if (formats) {
        jupytextMetadata.formats = shortFormMultipleFormats(
            longFormMultipleFormats(formats, metadata)
        );
    }

    if (Object.keys(jupytextMetadata).length > 0) {
        metadata.jupytext = jupytextMetadata;
    }
}

export function longFormOneFormat(
    jupytextFormat: string | Record<string, any>,
    metadata?: Record<string, any>,
    update?: Record<string, any>,
    autoExtRequiresLanguageInfo: boolean = true
): Record<string, any> {
    if (typeof jupytextFormat === 'object') {
        if (update) {
            Object.assign(jupytextFormat, update);
        }
        return validateOneFormat(jupytextFormat);
    }

    if (!jupytextFormat) {
        return {};
    }

    const commonNameToExt: Record<string, string> = {
        "notebook": "ipynb",
        "rmarkdown": "Rmd",
        "quarto": "qmd", 
        "markdown": "md",
        "script": "auto",
        "c++": "cpp",
        "myst": "md:myst",
        "pandoc": "md:pandoc",
    };
    
    if (jupytextFormat.toLowerCase() in commonNameToExt) {
        jupytextFormat = commonNameToExt[jupytextFormat.toLowerCase()];
    }

    const fmt: Record<string, any> = {};

    if (jupytextFormat.lastIndexOf("/") > 0) {
        const parts = jupytextFormat.split("/");
        fmt.prefix = parts.slice(0, -1).join("/");
        jupytextFormat = parts[parts.length - 1];
    }

    if (jupytextFormat.lastIndexOf(":") >= 0) {
        const parts = jupytextFormat.split(":");
        const ext = parts.slice(0, -1).join(":");
        fmt.format_name = parts[parts.length - 1];
        if (fmt.format_name === "bare") {
            console.warn("The `bare` format has been renamed to `nomarker`");
            fmt.format_name = "nomarker";
        }
        jupytextFormat = ext;
    } else if (!jupytextFormat || 
               jupytextFormat.includes(".") || 
               NOTEBOOK_EXTENSIONS.concat([".auto"]).includes("." + jupytextFormat)) {
        // ext = jupytextFormat (already set)
    } else if (VALID_FORMAT_NAMES.has(jupytextFormat)) {
        fmt.format_name = jupytextFormat;
        jupytextFormat = "";
    } else {
        throw new JupytextFormatError(
            `'${jupytextFormat}' is not a notebook extension (one of ${NOTEBOOK_EXTENSIONS.join(", ")}), ` +
            `nor a notebook format (one of ${Array.from(VALID_FORMAT_NAMES).join(", ")})`
        );
    }

    if (jupytextFormat.lastIndexOf(".") > 0) {
        const parts = jupytextFormat.split(".");
        fmt.suffix = parts.slice(0, -1).join(".");
        jupytextFormat = "." + parts[parts.length - 1];
    }

    if (!jupytextFormat.startsWith(".")) {
        jupytextFormat = "." + jupytextFormat;
    }

    if (jupytextFormat === ".auto") {
        jupytextFormat = autoExtFromMetadata(metadata) || ".auto";
        if (!jupytextFormat) {
            if (autoExtRequiresLanguageInfo) {
                throw new JupytextFormatError(
                    "No language information in this notebook. Please replace 'auto' with an actual script extension."
                );
            }
            jupytextFormat = ".auto";
        }
    }

    fmt.extension = jupytextFormat;
    if (update) {
        Object.assign(fmt, update);
    }
    return validateOneFormat(fmt);
}

export function longFormMultipleFormats(
    jupytextFormats: string | string[] | null,
    metadata?: Record<string, any>,
    autoExtRequiresLanguageInfo: boolean = true
): Record<string, any>[] {
    if (!jupytextFormats) {
        return [];
    }

    let formats: string[];
    if (!Array.isArray(jupytextFormats)) {
        formats = jupytextFormats.split(",").filter(fmt => fmt);
    } else {
        formats = jupytextFormats;
    }

    let result = formats.map(fmt => 
        longFormOneFormat(fmt, metadata, undefined, autoExtRequiresLanguageInfo)
    );

    if (!autoExtRequiresLanguageInfo) {
        result = result.filter(fmt => fmt.extension !== ".auto");
    }

    return result;
}

export function shortFormOneFormat(jupytextFormat: Record<string, any> | string): string {
    if (typeof jupytextFormat !== 'object') {
        return jupytextFormat;
    }
    
    let fmt = jupytextFormat.extension;
    if (jupytextFormat.suffix) {
        fmt = jupytextFormat.suffix + fmt;
    } else if (fmt.startsWith(".")) {
        fmt = fmt.slice(1);
    }

    if (jupytextFormat.prefix) {
        fmt = jupytextFormat.prefix + "/" + fmt;
    }

    if (jupytextFormat.format_name) {
        if (![".md", ".markdown", ".Rmd"].includes(jupytextFormat.extension) || 
            ["pandoc", MYST_FORMAT_NAME].includes(jupytextFormat.format_name)) {
            fmt = fmt + ":" + jupytextFormat.format_name;
        }
    }

    return fmt;
}

export function shortFormMultipleFormats(jupytextFormats: Record<string, any>[] | string): string {
    if (typeof jupytextFormats !== 'object') {
        return jupytextFormats;
    }

    const formats = jupytextFormats.map(fmt => shortFormOneFormat(fmt));
    return formats.join(",");
}

// Constants (lines 724-742)
const VALID_FORMAT_INFO = ["extension", "format_name", "suffix", "prefix"];
const BINARY_FORMAT_OPTIONS = [
    "comment_magics",
    "hide_notebook_metadata", 
    "root_level_metadata_as_raw_cell",
    "split_at_heading",
    "rst2md",
    "cell_metadata_json",
    "use_runtools",
    "doxygen_equation_markers",
];
const VALID_FORMAT_OPTIONS = [
    ...BINARY_FORMAT_OPTIONS,
    "notebook_metadata_filter",
    "root_level_metadata_filter",
    "cell_metadata_filter",
    "cell_markers",
    "custom_cell_magics",
];

export const _VALID_FORMAT_OPTIONS = VALID_FORMAT_OPTIONS;
export const VALID_FORMAT_NAMES = new Set(JUPYTEXT_FORMATS.map(fmt => fmt.formatName));

export function validateOneFormat(jupytextFormat: Record<string, any>): Record<string, any> {
    if (typeof jupytextFormat !== 'object') {
        throw new JupytextFormatError("Jupytext format should be a dictionary");
    }

    if (jupytextFormat.format_name && !VALID_FORMAT_NAMES.has(jupytextFormat.format_name)) {
        throw new JupytextFormatError(
            `${jupytextFormat.format_name} is not a valid format name. ` +
            `Please choose one of ${Array.from(VALID_FORMAT_NAMES).join(", ")}`
        );
    }

    for (const key in jupytextFormat) {
        if (![...VALID_FORMAT_INFO, ...VALID_FORMAT_OPTIONS].includes(key)) {
            throw new JupytextFormatError(
                `Unknown format option '${key}' - should be one of '${VALID_FORMAT_OPTIONS.join("', '")}'`
            );
        }
        const value = jupytextFormat[key];
        if (BINARY_FORMAT_OPTIONS.includes(key)) {
            if (typeof value !== 'boolean') {
                throw new JupytextFormatError(
                    `Format option '${key}' should be a bool, not '${value}'`
                );
            }
        }
    }

    if (!jupytextFormat.extension) {
        throw new JupytextFormatError("Missing format extension");
    }
    const ext = jupytextFormat.extension;
    if (![...NOTEBOOK_EXTENSIONS, ".auto"].includes(ext)) {
        throw new JupytextFormatError(
            `Extension '${ext}' is not a notebook extension. ` +
            `Please use one of '${[...NOTEBOOK_EXTENSIONS, ".auto"].join("', '")}'.`
        );
    }

    return jupytextFormat;
}

export function autoExtFromMetadata(metadata?: Record<string, any>): string | null {
    if (!metadata) return null;
    
    let autoExt = metadata.language_info?.file_extension;

    // Sage notebooks have ".py" as the associated extension in "language_info",
    // so we change it to ".sage" in that case
    if (autoExt === ".py" && metadata.kernelspec?.language === "sage") {
        autoExt = ".sage";
    }

    if (!autoExt) {
        const language = metadata.kernelspec?.language || metadata.jupytext?.main_language;
        if (language) {
            for (const ext in SCRIPT_EXTENSIONS) {
                if (sameLanguage(language, SCRIPT_EXTENSIONS[ext].language)) {
                    autoExt = ext;
                    break;
                }
            }
        }
    }

    if (autoExt === ".r") return ".R";
    if (autoExt === ".fs") return ".fsx";
    if (autoExt === ".resource") return ".robot";
    if (autoExt === ".C") return ".cpp";

    return autoExt;
}

export function checkAutoExt(fmt: Record<string, any>, metadata: Record<string, any>, option: string): Record<string, any> {
    if (fmt.extension !== ".auto") {
        return fmt;
    }

    const autoExt = autoExtFromMetadata(metadata);
    if (autoExt) {
        const newFmt = { ...fmt };
        newFmt.extension = autoExt;
        return newFmt;
    }

    throw new Error(
        `The notebook does not have a 'language_info' metadata. ` +
        `Please replace 'auto' with the actual language extension in the ${option} option ` +
        `(currently ${shortFormOneFormat(fmt)}).`
    );
}

export function formatsWithSupportForCellMetadata(): string[] {
    const result: string[] = [];
    for (const fmt of JUPYTEXT_FORMATS) {
        if (fmt.formatName === "myst" && !isMystAvailable()) {
            continue;
        }
        if (fmt.formatName === "pandoc" && !isPandocAvailable()) {
            continue;
        }
        if (!["sphinx", "nomarker", "spin", "quarto"].includes(fmt.formatName)) {
            result.push(`${fmt.extension.slice(1)}:${fmt.formatName}`);
        }
    }
    return result;
}

export function getFormatsFromNotebookMetadata(notebook: any): string | null {
    return notebook.metadata?.jupytext?.formats || null;
}

// Utility function for regex escaping
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
