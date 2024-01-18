"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCssImports = void 0;
const hasCssImport = (content) => {
    return content.includes(`import 'vs/css!`);
};
const isImportLine = (line) => {
    return line.startsWith('import ');
};
const getLastImportLineIndex = (lines) => {
    let lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isImportLine(line)) {
            lastIndex = i;
        }
    }
    return lastIndex;
};
const getNewContentTop = (lines) => {
    const newLinesTop = [];
    const newCssImports = [];
    for (const line of lines) {
        if (hasCssImport(line)) {
            newCssImports.push(line);
        }
        else {
            newLinesTop.push(line);
        }
    }
    return {
        newLinesTop,
        newCssImports
    };
};
const RE_VS_CSS_IMPORT = /^import 'vs\/css!(.*)'/;
const parseNewCssImport = (line) => {
    const match = line.match(RE_VS_CSS_IMPORT);
    if (!match) {
        throw new Error(`failed to parse css import line ${line}`);
    }
    const path = match[1];
    return path;
};
const getNewCssImportLines = (newCssImports) => {
    const newCssImportLines = [];
    newCssImportLines.push(`import { importCss } from 'vs/base/browser/importCss';`);
    newCssImportLines.push('');
    for (const newCssImport of newCssImports) {
        const path = parseNewCssImport(newCssImport);
        newCssImportLines.push(`importCss('${path}.css', import.meta.url)`);
    }
    newCssImportLines.push('');
    return newCssImportLines;
};
const updateCssImports = (content) => {
    if (!hasCssImport(content)) {
        return content;
    }
    const lines = content.split('\n');
    const lastImportLineIndex = getLastImportLineIndex(lines);
    if (lastImportLineIndex === -1) {
        throw new Error(`no imports found`);
    }
    const { newLinesTop, newCssImports } = getNewContentTop(lines.slice(0, lastImportLineIndex + 1));
    if (newCssImports.length === 0) {
        console.log(lines, lastImportLineIndex);
        throw new Error(`import length cannot be zero`);
    }
    const newCssImportLines = getNewCssImportLines(newCssImports);
    const newLinesBottom = lines.slice(lastImportLineIndex + 1);
    const newLines = [...newLinesTop, ...newCssImportLines, ...newLinesBottom];
    const newContent = newLines.join('\n');
    if (newContent.includes('vs/css!')) {
        throw new Error(`css transformation error`);
    }
    return newContent;
};
exports.updateCssImports = updateCssImports;
//# sourceMappingURL=updateCssImports.js.map