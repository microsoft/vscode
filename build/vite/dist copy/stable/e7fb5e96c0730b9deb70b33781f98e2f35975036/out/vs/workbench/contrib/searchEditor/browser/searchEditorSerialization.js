/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { coalesce } from '../../../../base/common/arrays.js';
import './media/searchEditor.css';
import { Range } from '../../../../editor/common/core/range.js';
import { localize } from '../../../../nls.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { searchMatchComparer } from '../../search/browser/searchCompare.js';
import { isNotebookFileMatch } from '../../search/browser/notebookSearch/notebookSearchModelBase.js';
// Using \r\n on Windows inserts an extra newline between results.
const lineDelimiter = '\n';
const translateRangeLines = (n) => (range) => new Range(range.startLineNumber + n, range.startColumn, range.endLineNumber + n, range.endColumn);
const matchToSearchResultFormat = (match, longestLineNumber) => {
    const getLinePrefix = (i) => `${match.range().startLineNumber + i}`;
    const fullMatchLines = match.fullPreviewLines();
    const results = [];
    fullMatchLines
        .forEach((sourceLine, i) => {
        const lineNumber = getLinePrefix(i);
        const paddingStr = ' '.repeat(longestLineNumber - lineNumber.length);
        const prefix = `  ${paddingStr}${lineNumber}: `;
        const prefixOffset = prefix.length;
        // split instead of replace to avoid creating a new string object
        const line = prefix + (sourceLine.split(/\r?\n?$/, 1)[0] || '');
        const rangeOnThisLine = ({ start, end }) => new Range(1, (start ?? 1) + prefixOffset, 1, (end ?? sourceLine.length + 1) + prefixOffset);
        const matchRange = match.rangeInPreview();
        const matchIsSingleLine = matchRange.startLineNumber === matchRange.endLineNumber;
        let lineRange;
        if (matchIsSingleLine) {
            lineRange = (rangeOnThisLine({ start: matchRange.startColumn, end: matchRange.endColumn }));
        }
        else if (i === 0) {
            lineRange = (rangeOnThisLine({ start: matchRange.startColumn }));
        }
        else if (i === fullMatchLines.length - 1) {
            lineRange = (rangeOnThisLine({ end: matchRange.endColumn }));
        }
        else {
            lineRange = (rangeOnThisLine({}));
        }
        results.push({ lineNumber: lineNumber, line, ranges: [lineRange] });
    });
    return results;
};
function fileMatchToSearchResultFormat(fileMatch, labelFormatter) {
    const textSerializations = fileMatch.textMatches().length > 0 ? matchesToSearchResultFormat(fileMatch.resource, fileMatch.textMatches().sort(searchMatchComparer), fileMatch.context, labelFormatter) : undefined;
    const cellSerializations = (isNotebookFileMatch(fileMatch)) ? fileMatch.cellMatches().sort((a, b) => a.cellIndex - b.cellIndex).sort().filter(cellMatch => cellMatch.contentMatches.length > 0).map((cellMatch, index) => cellMatchToSearchResultFormat(cellMatch, labelFormatter, index === 0)) : [];
    return [textSerializations, ...cellSerializations].filter(x => !!x);
}
function matchesToSearchResultFormat(resource, sortedMatches, matchContext, labelFormatter, shouldUseHeader = true) {
    const longestLineNumber = sortedMatches[sortedMatches.length - 1].range().endLineNumber.toString().length;
    const text = shouldUseHeader ? [`${labelFormatter(resource)}:`] : [];
    const matchRanges = [];
    const targetLineNumberToOffset = {};
    const context = [];
    matchContext.forEach((line, lineNumber) => context.push({ line, lineNumber }));
    context.sort((a, b) => a.lineNumber - b.lineNumber);
    let lastLine = undefined;
    const seenLines = new Set();
    sortedMatches.forEach(match => {
        matchToSearchResultFormat(match, longestLineNumber).forEach(match => {
            if (!seenLines.has(match.lineNumber)) {
                while (context.length && context[0].lineNumber < +match.lineNumber) {
                    const { line, lineNumber } = context.shift();
                    if (lastLine !== undefined && lineNumber !== lastLine + 1) {
                        text.push('');
                    }
                    text.push(`  ${' '.repeat(longestLineNumber - `${lineNumber}`.length)}${lineNumber}  ${line}`);
                    lastLine = lineNumber;
                }
                targetLineNumberToOffset[match.lineNumber] = text.length;
                seenLines.add(match.lineNumber);
                text.push(match.line);
                lastLine = +match.lineNumber;
            }
            matchRanges.push(...match.ranges.map(translateRangeLines(targetLineNumberToOffset[match.lineNumber])));
        });
    });
    while (context.length) {
        const { line, lineNumber } = context.shift();
        text.push(`  ${lineNumber}  ${line}`);
    }
    return { text, matchRanges };
}
function cellMatchToSearchResultFormat(cellMatch, labelFormatter, shouldUseHeader) {
    return matchesToSearchResultFormat(cellMatch.cell?.uri ?? cellMatch.parent.resource, cellMatch.contentMatches.sort(searchMatchComparer), cellMatch.context, labelFormatter, shouldUseHeader);
}
const contentPatternToSearchConfiguration = (pattern, includes, excludes, contextLines) => {
    return {
        query: pattern.contentPattern.pattern,
        isRegexp: !!pattern.contentPattern.isRegExp,
        isCaseSensitive: !!pattern.contentPattern.isCaseSensitive,
        matchWholeWord: !!pattern.contentPattern.isWordMatch,
        filesToExclude: excludes, filesToInclude: includes,
        showIncludesExcludes: !!(includes || excludes || pattern?.userDisabledExcludesAndIgnoreFiles),
        useExcludeSettingsAndIgnoreFiles: (pattern?.userDisabledExcludesAndIgnoreFiles === undefined ? true : !pattern.userDisabledExcludesAndIgnoreFiles),
        contextLines,
        onlyOpenEditors: !!pattern.onlyOpenEditors,
        notebookSearchConfig: {
            includeMarkupInput: !!pattern.contentPattern.notebookInfo?.isInNotebookMarkdownInput,
            includeMarkupPreview: !!pattern.contentPattern.notebookInfo?.isInNotebookMarkdownPreview,
            includeCodeInput: !!pattern.contentPattern.notebookInfo?.isInNotebookCellInput,
            includeOutput: !!pattern.contentPattern.notebookInfo?.isInNotebookCellOutput,
        }
    };
};
export const serializeSearchConfiguration = (config) => {
    const removeNullFalseAndUndefined = (a) => a.filter(a => a !== false && a !== null && a !== undefined);
    const escapeNewlines = (str) => str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
    return removeNullFalseAndUndefined([
        `# Query: ${escapeNewlines(config.query ?? '')}`,
        (config.isCaseSensitive || config.matchWholeWord || config.isRegexp || config.useExcludeSettingsAndIgnoreFiles === false)
            && `# Flags: ${coalesce([
                config.isCaseSensitive && 'CaseSensitive',
                config.matchWholeWord && 'WordMatch',
                config.isRegexp && 'RegExp',
                config.onlyOpenEditors && 'OpenEditors',
                (config.useExcludeSettingsAndIgnoreFiles === false) && 'IgnoreExcludeSettings'
            ]).join(' ')}`,
        config.filesToInclude ? `# Including: ${config.filesToInclude}` : undefined,
        config.filesToExclude ? `# Excluding: ${config.filesToExclude}` : undefined,
        config.contextLines ? `# ContextLines: ${config.contextLines}` : undefined,
        ''
    ]).join(lineDelimiter);
};
export const extractSearchQueryFromModel = (model) => extractSearchQueryFromLines(model.getValueInRange(new Range(1, 1, 6, 1)).split(lineDelimiter));
export const defaultSearchConfig = () => ({
    query: '',
    filesToInclude: '',
    filesToExclude: '',
    isRegexp: false,
    isCaseSensitive: false,
    useExcludeSettingsAndIgnoreFiles: true,
    matchWholeWord: false,
    contextLines: 0,
    showIncludesExcludes: false,
    onlyOpenEditors: false,
    notebookSearchConfig: {
        includeMarkupInput: true,
        includeMarkupPreview: false,
        includeCodeInput: true,
        includeOutput: true,
    }
});
export const extractSearchQueryFromLines = (lines) => {
    const query = defaultSearchConfig();
    const unescapeNewlines = (str) => {
        let out = '';
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '\\') {
                i++;
                const escaped = str[i];
                if (escaped === 'n') {
                    out += '\n';
                }
                else if (escaped === '\\') {
                    out += '\\';
                }
                else {
                    throw Error(localize('invalidQueryStringError', "All backslashes in Query string must be escaped (\\\\)"));
                }
            }
            else {
                out += str[i];
            }
        }
        return out;
    };
    const parseYML = /^# ([^:]*): (.*)$/;
    for (const line of lines) {
        const parsed = parseYML.exec(line);
        if (!parsed) {
            continue;
        }
        const [, key, value] = parsed;
        switch (key) {
            case 'Query':
                query.query = unescapeNewlines(value);
                break;
            case 'Including':
                query.filesToInclude = value;
                break;
            case 'Excluding':
                query.filesToExclude = value;
                break;
            case 'ContextLines':
                query.contextLines = +value;
                break;
            case 'Flags': {
                query.isRegexp = value.indexOf('RegExp') !== -1;
                query.isCaseSensitive = value.indexOf('CaseSensitive') !== -1;
                query.useExcludeSettingsAndIgnoreFiles = value.indexOf('IgnoreExcludeSettings') === -1;
                query.matchWholeWord = value.indexOf('WordMatch') !== -1;
                query.onlyOpenEditors = value.indexOf('OpenEditors') !== -1;
            }
        }
    }
    query.showIncludesExcludes = !!(query.filesToInclude || query.filesToExclude || !query.useExcludeSettingsAndIgnoreFiles);
    return query;
};
export const serializeSearchResultForEditor = (searchResult, rawIncludePattern, rawExcludePattern, contextLines, labelFormatter, sortOrder, limitHit) => {
    if (!searchResult.query) {
        throw Error('Internal Error: Expected query, got null');
    }
    const config = contentPatternToSearchConfiguration(searchResult.query, rawIncludePattern, rawExcludePattern, contextLines);
    const filecount = searchResult.fileCount() > 1 ? localize('numFiles', "{0} files", searchResult.fileCount()) : localize('oneFile', "1 file");
    const resultcount = searchResult.count() > 1 ? localize('numResults', "{0} results", searchResult.count()) : localize('oneResult', "1 result");
    const info = [
        searchResult.count()
            ? `${resultcount} - ${filecount}`
            : localize('noResults', "No Results"),
    ];
    if (limitHit) {
        info.push(localize('searchMaxResultsWarning', "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results."));
    }
    info.push('');
    const matchComparer = (a, b) => searchMatchComparer(a, b, sortOrder);
    const allResults = flattenSearchResultSerializations(searchResult.folderMatches().sort(matchComparer)
        .map(folderMatch => folderMatch.allDownstreamFileMatches().sort(matchComparer)
        .flatMap(fileMatch => fileMatchToSearchResultFormat(fileMatch, labelFormatter))).flat());
    return {
        matchRanges: allResults.matchRanges.map(translateRangeLines(info.length)),
        text: info.concat(allResults.text).join(lineDelimiter),
        config
    };
};
const flattenSearchResultSerializations = (serializations) => {
    const text = [];
    const matchRanges = [];
    serializations.forEach(serialized => {
        serialized.matchRanges.map(translateRangeLines(text.length)).forEach(range => matchRanges.push(range));
        serialized.text.forEach(line => text.push(line));
        text.push(''); // new line
    });
    return { text, matchRanges };
};
export const parseSavedSearchEditor = async (accessor, resource) => {
    const textFileService = accessor.get(ITextFileService);
    const text = (await textFileService.read(resource)).value;
    return parseSerializedSearchEditor(text);
};
export const parseSerializedSearchEditor = (text) => {
    const headerlines = [];
    const bodylines = [];
    let inHeader = true;
    for (const line of text.split(/\r?\n/g)) {
        if (inHeader) {
            headerlines.push(line);
            if (line === '') {
                inHeader = false;
            }
        }
        else {
            bodylines.push(line);
        }
    }
    return { config: extractSearchQueryFromLines(headerlines), text: bodylines.join('\n') };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoRWRpdG9yU2VyaWFsaXphdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvclNlcmlhbGl6YXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTdELE9BQU8sMEJBQTBCLENBQUM7QUFFbEMsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRWhFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUc5QyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVsRixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM1RSxPQUFPLEVBQWMsbUJBQW1CLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUVqSCxrRUFBa0U7QUFDbEUsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDO0FBRTNCLE1BQU0sbUJBQW1CLEdBQ3hCLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FDYixDQUFDLEtBQVksRUFBRSxFQUFFLENBQ2hCLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxlQUFlLEdBQUcsQ0FBQyxFQUFFLEtBQUssQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLGFBQWEsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBRXJHLE1BQU0seUJBQXlCLEdBQUcsQ0FBQyxLQUF1QixFQUFFLGlCQUF5QixFQUEyRCxFQUFFO0lBQ2pKLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQyxlQUFlLEdBQUcsQ0FB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