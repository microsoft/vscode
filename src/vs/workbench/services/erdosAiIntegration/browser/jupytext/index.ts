/**
 * Read and write Jupyter notebooks as text files
 * Converted from src/jupytext/__init__.py
 */

// Main API exports (from lines 3-6)
export { NOTEBOOK_EXTENSIONS, getFormatImplementation, guessFormat } from './formats.js';
export { read, reads, write, writes } from './jupytext.js';
export { __version__ } from './version.js';

// Additional exports for TypeScript version
export { 
    NotebookNode, 
    CellNode, 
    newCodeCell, 
    newMarkdownCell, 
    newRawCell, 
    newNotebook 
} from './types.js';

export { StringParser } from './stringParser.js';
export { TextNotebookConverter, NotSupportedNBFormatVersion } from './jupytext.js';

// Core classes for advanced usage
export { BaseCellReader, DoublePercentScriptCellReader, MarkdownCellReader } from './cellReader.js';
export { BaseCellExporter, DoublePercentCellExporter, MarkdownCellExporter } from './cellToText.js';

// Utility functions
export { isMagic, commentMagic, uncommentMagic } from './magics.js';
export { filterMetadata } from './metadataFilter.js';
export { textToMetadata, metadataToText } from './cellMetadata.js';

// Export list (from lines 28-41, adapted for TypeScript)
export const __all__ = [
    "read",
    "write", 
    "writes",
    "reads",
    "NOTEBOOK_EXTENSIONS",
    "guessFormat",
    "getFormatImplementation",
    "__version__",
    // Additional TypeScript exports
    "NotebookNode",
    "CellNode", 
    "newCodeCell",
    "newMarkdownCell",
    "newRawCell",
    "newNotebook",
    "StringParser",
    "TextNotebookConverter",
    "NotSupportedNBFormatVersion",
    "BaseCellReader",
    "DoublePercentScriptCellReader",
    "MarkdownCellReader",
    "BaseCellExporter",
    "DoublePercentCellExporter", 
    "MarkdownCellExporter",
    "isMagic",
    "commentMagic",
    "uncommentMagic",
    "filterMetadata",
    "textToMetadata",
    "metadataToText"
];

