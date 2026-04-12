/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import * as Objects from '../../../../base/common/objects.js';
import * as Strings from '../../../../base/common/strings.js';
import * as Assert from '../../../../base/common/assert.js';
import { join, normalize } from '../../../../base/common/path.js';
import * as Types from '../../../../base/common/types.js';
import * as UUID from '../../../../base/common/uuid.js';
import * as Platform from '../../../../base/common/platform.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { ValidationStatus, Parser } from '../../../../base/common/parsers.js';
import { asArray } from '../../../../base/common/arrays.js';
import { Schemas as NetworkSchemas } from '../../../../base/common/network.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
import { Emitter } from '../../../../base/common/event.js';
import { FileType } from '../../../../platform/files/common/files.js';
export var FileLocationKind;
(function (FileLocationKind) {
    FileLocationKind[FileLocationKind["Default"] = 0] = "Default";
    FileLocationKind[FileLocationKind["Relative"] = 1] = "Relative";
    FileLocationKind[FileLocationKind["Absolute"] = 2] = "Absolute";
    FileLocationKind[FileLocationKind["AutoDetect"] = 3] = "AutoDetect";
    FileLocationKind[FileLocationKind["Search"] = 4] = "Search";
})(FileLocationKind || (FileLocationKind = {}));
(function (FileLocationKind) {
    function fromString(value) {
        value = value.toLowerCase();
        if (value === 'absolute') {
            return FileLocationKind.Absolute;
        }
        else if (value === 'relative') {
            return FileLocationKind.Relative;
        }
        else if (value === 'autodetect') {
            return FileLocationKind.AutoDetect;
        }
        else if (value === 'search') {
            return FileLocationKind.Search;
        }
        else {
            return undefined;
        }
    }
    FileLocationKind.fromString = fromString;
})(FileLocationKind || (FileLocationKind = {}));
export var ProblemLocationKind;
(function (ProblemLocationKind) {
    ProblemLocationKind[ProblemLocationKind["File"] = 0] = "File";
    ProblemLocationKind[ProblemLocationKind["Location"] = 1] = "Location";
})(ProblemLocationKind || (ProblemLocationKind = {}));
(function (ProblemLocationKind) {
    function fromString(value) {
        value = value.toLowerCase();
        if (value === 'file') {
            return ProblemLocationKind.File;
        }
        else if (value === 'location') {
            return ProblemLocationKind.Location;
        }
        else {
            return undefined;
        }
    }
    ProblemLocationKind.fromString = fromString;
})(ProblemLocationKind || (ProblemLocationKind = {}));
export var ApplyToKind;
(function (ApplyToKind) {
    ApplyToKind[ApplyToKind["allDocuments"] = 0] = "allDocuments";
    ApplyToKind[ApplyToKind["openDocuments"] = 1] = "openDocuments";
    ApplyToKind[ApplyToKind["closedDocuments"] = 2] = "closedDocuments";
})(ApplyToKind || (ApplyToKind = {}));
(function (ApplyToKind) {
    function fromString(value) {
        value = value.toLowerCase();
        if (value === 'alldocuments') {
            return ApplyToKind.allDocuments;
        }
        else if (value === 'opendocuments') {
            return ApplyToKind.openDocuments;
        }
        else if (value === 'closeddocuments') {
            return ApplyToKind.closedDocuments;
        }
        else {
            return undefined;
        }
    }
    ApplyToKind.fromString = fromString;
})(ApplyToKind || (ApplyToKind = {}));
export function isNamedProblemMatcher(value) {
    return value && Types.isString(value.name) ? true : false;
}
export async function getResource(filename, matcher, fileService) {
    const kind = matcher.fileLocation;
    let fullPath;
    if (kind === FileLocationKind.Absolute) {
        fullPath = filename;
    }
    else if ((kind === FileLocationKind.Relative) && matcher.filePrefix && Types.isString(matcher.filePrefix)) {
        fullPath = join(matcher.filePrefix, filename);
    }
    else if (kind === FileLocationKind.AutoDetect) {
        const matcherClone = Objects.deepClone(matcher);
        matcherClone.fileLocation = FileLocationKind.Relative;
        if (fileService) {
            const relative = await getResource(filename, matcherClone);
            let stat = undefined;
            try {
                stat = await fileService.stat(relative);
            }
            catch (ex) {
                // Do nothing, we just need to catch file resolution errors.
            }
            if (stat) {
                return relative;
            }
        }
        matcherClone.fileLocation = FileLocationKind.Absolute;
        return getResource(filename, matcherClone);
    }
    else if (kind === FileLocationKind.Search && fileService) {
        const fsProvider = fileService.getProvider(NetworkSchemas.file);
        if (fsProvider) {
            const uri = await searchForFileLocation(filename, fsProvider, matcher.filePrefix);
            fullPath = uri?.path;
        }
        if (!fullPath) {
            const absoluteMatcher = Objects.deepClone(matcher);
            absoluteMatcher.fileLocation = FileLocationKind.Absolute;
            return getResource(filename, absoluteMatcher);
        }
    }
    if (fullPath === undefined) {
        throw new Error('FileLocationKind is not actionable. Does the matcher have a filePrefix? This should never happen.');
    }
    fullPath = normalize(fullPath);
    fullPath = fullPath.replace(/\\/g, '/');
    if (fullPath[0] !== '/') {
        fullPath = '/' + fullPath;
    }
    if (matcher.uriProvider !== undefined) {
        return matcher.uriProvider(fullPath);
    }
    else {
        return URI.file(fullPath);
    }
}
async function searchForFileLocation(filename, fsProvider, args) {
    const exclusions = new Set(asArray(args.exclude || []).map(x => URI.file(x).path));
    async function search(dir) {
        if (exclusions.has(dir.path)) {
            return undefined;
        }
        const entries = await fsProvider.readdir(dir);
        const subdirs = [];
        for (const [name, fileType] of entries) {
            if (fileType === FileType.Directory) {
                subdirs.push(URI.joinPath(dir, name));
                continue;
            }
            if (fileType === FileType.File) {
                /**
                 * Note that sometimes the given `filename` could be a relative
                 * path (not just the "name.ext" part). For example, the
                 * `filename` can be "/subdir/name.ext". So, just comparing
                 * `name` as `filename` is not sufficient. The workaround here
                 * is to form the URI with `dir` and `name` and check if it ends
                 * with the given `filename`.
                 */
                const fullUri = URI.joinPath(dir, name);
                if (fullUri.path.endsWith(filename)) {
                    return fullUri;
                }
            }
        }
        for (const subdir of subdirs) {
            const result = await search(subdir);
            if (result) {
                return result;
            }
        }
        return undefined;
    }
    for (const dir of asArray(args.include || [])) {
        const hit = await search(URI.file(dir));
        if (hit) {
            return hit;
        }
    }
    return undefined;
}
export function createLineMatcher(matcher, fileService, logService) {
    const pattern = matcher.pattern;
    if (Array.isArray(pattern)) {
        return new MultiLineMatcher(matcher, fileService, logService);
    }
    else {
        return new SingleLineMatcher(matcher, fileService, logService);
    }
}
const endOfLine = Platform.OS === 1 /* Platform.OperatingSystem.Windows */ ? '\r\n' : '\n';
class AbstractLineMatcher {
    constructor(matcher, fileService, logService) {
        this.matcher = matcher;
        this.fileService = fileService;
        this.logService = logService;
    }
    handle(lines, start = 0) {
        return { match: null, continue: false };
    }
    next(line) {
        return null;
    }
    regexpExec(regexp, line) {
        const start = Date.now();
        const result = regexp.exec(line);
        const elapsed = Date.now() - start;
        if (elapsed > 5) {
            this.logService?.trace(`ProblemMatcher: slow regexp took ${elapsed}ms to execute`, regexp.source);
        }
        return result;
    }
    fillProblemData(data, pattern, matches) {
        if (data) {
            this.fillProperty(data, 'file', pattern, matches, true);
            this.appendProperty(data, 'message', pattern, matches, true);
            this.fillProperty(data, 'code', pattern, matches, true);
            this.fillProperty(data, 'severity', pattern, matches, true);
            this.fillProperty(data, 'location', pattern, matches, true);
            this.fillProperty(data, 'line', pattern, matches);
            this.fillProperty(data, 'character', pattern, matches);
            this.fillProperty(data, 'endLine', pattern, matches);
            this.fillProperty(data, 'endCharacter', pattern, matches);
            return true;
        }
        else {
            return false;
        }
    }
    appendProperty(data, property, pattern, matches, trim = false) {
        const patternProperty = pattern[property];
        if (Types.isUndefined(data[property])) {
            this.fillProperty(data, property, pattern, matches, trim);
        }
        else if (!Types.isUndefined(patternProperty) && patternProperty < matches.length) {
            let value = matches[patternProperty];
            if (trim) {
                value = Strings.trim(value);
            }
            data[property] = data[property] + endOfLine + value;
        }
    }
    fillProperty(data, property, pattern, matches, trim = false) {
        const patternAtProperty = pattern[property];
        if (Types.isUndefined(data[property]) && !Types.isUndefined(patternAtProperty) && patternAtProperty < matches.length) {
            let value = matches[patternAtProperty];
            if (value !== undefined) {
                if (trim) {
                    value = Strings.trim(value);
                }
                data[property] = value;
            }
        }
    }
    getMarkerMatch(data) {
        try {
            const location = this.getLocation(data);
            if (data.file && location && data.message) {
                const marker = {
                    severity: this.getSeverity(data),
                    startLineNumber: location.startLineNumber,
                    startColumn: location.startCharacter,
                    endLineNumber: location.endLineNumber,
                    endColumn: location.endCharacter,
                    message: data.message
                };
                if (data.code !== undefined) {
                    marker.code = data.code;
                }
                if (this.matcher.source !== undefined) {
                    marker.source = this.matcher.source;
                }
                return {
                    description: this.matcher,
                    resource: this.getResource(data.file),
                    marker: marker
                };
            }
        }
        catch (err) {
            console.error(`Failed to convert problem data into match: ${JSON.stringify(data)}`);
        }
        return undefined;
    }
    getResource(filename) {
        return getResource(filename, this.matcher, this.fileService);
    }
    getLocation(data) {
        if (data.kind === ProblemLocationKind.File) {
            return this.createLocation(0, 0, 0, 0);
        }
        if (data.location) {
            return this.parseLocationInfo(data.location);
        }
        if (!data.line) {
            return null;
        }
        const startLine = parseInt(data.line);
        const startColumn = data.character ? parseInt(data.character) : undefined;
        const endLine = data.endLine ? parseInt(data.endLine) : undefined;
        const endColumn = data.endCharacter ? parseInt(data.endCharacter) : undefined;
        return this.createLocation(startLine, startColumn, endLine, endColumn);
    }
    parseLocationInfo(value) {
        if (!value || !value.match(/(\d+|\d+,\d+|\d+,\d+,\d+,\d+)/)) {
            return null;
        }
        const parts = value.split(',');
        const startLine = parseInt(parts[0]);
        const startColumn = parts.length > 1 ? parseInt(parts[1]) : undefined;
        if (parts.length > 3) {
            return this.createLocation(startLine, startColumn, parseInt(parts[2]), parseInt(parts[3]));
        }
        else {
            return this.createLocation(startLine, startColumn, undefined, undefined);
        }
    }
    createLocation(startLine, startColumn, endLine, endColumn) {
        if (startColumn !== undefined && endColumn !== undefined) {
            return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: endLine || startLine, endCharacter: endColumn };
        }
        if (startColumn !== undefined) {
            return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: startLine, endCharacter: startColumn };
        }
        return { startLineNumber: startLine, startCharacter: 1, endLineNumber: startLine, endCharacter: 2 ** 31 - 1 }; // See https://github.com/microsoft/vscode/issues/80288#issuecomment-650636442 for discussion
    }
    getSeverity(data) {
        let result = null;
        if (data.severity) {
            const value = data.severity;
            if (value) {
                result = Severity.fromValue(value);
                if (result === Severity.Ignore) {
                    if (value === 'E') {
                        result = Severity.Error;
                    }
                    else if (value === 'W') {
                        result = Severity.Warning;
                    }
                    else if (value === 'I') {
                        result = Severity.Info;
                    }
                    else if (Strings.equalsIgnoreCase(value, 'hint')) {
                        result = Severity.Info;
                    }
                    else if (Strings.equalsIgnoreCase(value, 'note')) {
                        result = Severity.Info;
                    }
                }
            }
        }
        if (result === null || result === Severity.Ignore) {
            result = this.matcher.severity || Severity.Error;
        }
        return MarkerSeverity.fromSeverity(result);
    }
}
class SingleLineMatcher extends AbstractLineMatcher {
    constructor(matcher, fileService, logService) {
        super(matcher, fileService, logService);
        this.pattern = matcher.pattern;
    }
    get matchLength() {
        return 1;
    }
    handle(lines, start = 0) {
        Assert.ok(lines.length - start === 1);
        const data = Object.create(null);
        if (this.pattern.kind !== undefined) {
            data.kind = this.pattern.kind;
        }
        const matches = this.regexpExec(this.pattern.regexp, lines[start]);
        if (matches) {
            this.fillProblemData(data, this.pattern, matches);
            if (data.kind === ProblemLocationKind.Location && !data.location && !data.line && data.file) {
                data.kind = ProblemLocationKind.File;
            }
            const match = this.getMarkerMatch(data);
            if (match) {
                return { match: match, continue: false };
            }
        }
        return { match: null, continue: false };
    }
    next(line) {
        return null;
    }
}
class MultiLineMatcher extends AbstractLineMatcher {
    constructor(matcher, fileService, logService) {
        super(matcher, fileService, logService);
        this.patterns = matcher.pattern;
    }
    get matchLength() {
        return this.patterns.length;
    }
    handle(lines, start = 0) {
        Assert.ok(lines.length - start === this.patterns.length);
        this.data = Object.create(null);
        let data = this.data;
        data.kind = this.patterns[0].kind;
        for (let i = 0; i < this.patterns.length; i++) {
            const pattern = this.patterns[i];
            const matches = this.regexpExec(pattern.regexp, lines[i + start]);
            if (!matches) {
                return { match: null, continue: false };
            }
            else {
                // Only the last pattern can loop
                if (pattern.loop && i === this.patterns.length - 1) {
                    data = Objects.deepClone(data);
                }
                this.fillProblemData(data, pattern, matches);
            }
        }
        const loop = !!this.patterns[this.patterns.length - 1].loop;
        if (!loop) {
            this.data = undefined;
        }
        const markerMatch = data ? this.getMarkerMatch(data) : null;
        return { match: markerMatch ? markerMatch : null, continue: loop };
    }
    next(line) {
        const pattern = this.patterns[this.patterns.length - 1];
        Assert.ok(pattern.loop === true && this.data !== null);
        const matches = this.regexpExec(pattern.regexp, line);
        if (!matches) {
            this.data = undefined;
            return null;
        }
        const data = Objects.deepClone(this.data);
        let problemMatch;
        if (this.fillProblemData(data, pattern, matches)) {
            problemMatch = this.getMarkerMatch(data);
        }
        return problemMatch ? problemMatch : null;
    }
}
export var Config;
(function (Config) {
    let CheckedProblemPattern;
    (function (CheckedProblemPattern) {
        function is(value) {
            const candidate = value;
            return candidate && Types.isString(candidate.regexp);
        }
        CheckedProblemPattern.is = is;
    })(CheckedProblemPattern = Config.CheckedProblemPattern || (Config.CheckedProblemPattern = {}));
    let NamedProblemPattern;
    (function (NamedProblemPattern) {
        function is(value) {
            const candidate = value;
            return candidate && Types.isString(candidate.name);
        }
        NamedProblemPattern.is = is;
    })(NamedProblemPattern = Config.NamedProblemPattern || (Config.NamedProblemPattern = {}));
    let NamedCheckedProblemPattern;
    (function (NamedCheckedProblemPattern) {
        function is(value) {
            const candidate = value;
            return candidate && NamedProblemPattern.is(candidate) && Types.isString(candidate.regexp);
        }
        NamedCheckedProblemPattern.is = is;
    })(NamedCheckedProblemPattern = Config.NamedCheckedProblemPattern || (Config.NamedCheckedProblemPattern = {}));
    let MultiLineProblemPattern;
    (function (MultiLineProblemPattern) {
        function is(value) {
            return Array.isArray(value);
        }
        MultiLineProblemPattern.is = is;
    })(MultiLineProblemPattern = Config.MultiLineProblemPattern || (Config.MultiLineProblemPattern = {}));
    let MultiLineCheckedProblemPattern;
    (function (MultiLineCheckedProblemPattern) {
        function is(value) {
            if (!MultiLineProblemPattern.is(value)) {
                return false;
            }
            for (const element of value) {
                if (!Config.CheckedProblemPattern.is(element)) {
                    return false;
                }
            }
            return true;
        }
        MultiLineCheckedProblemPattern.is = is;
    })(MultiLineCheckedProblemPattern = Config.MultiLineCheckedProblemPattern || (Config.MultiLineCheckedProblemPattern = {}));
    let NamedMultiLineCheckedProblemPattern;
    (function (NamedMultiLineCheckedProblemPattern) {
        function is(value) {
            const candidate = value;
            return candidate && Types.isString(candidate.name) && Array.isArray(candidate.patterns) && MultiLineCheckedProblemPattern.is(candidate.patterns);
        }
        NamedMultiLineCheckedProblemPattern.is = is;
    })(NamedMultiLineCheckedProblemPattern = Config.NamedMultiLineCheckedProblemPattern || (Config.NamedMultiLineCheckedProblemPattern = {}));
    function isNamedProblemMatcher(value) {
        return Types.isString(value.name);
    }
    Config.isNamedProblemMatcher = isNamedProblemMatcher;
})(Config || (Config = {}));
export class ProblemPatternParser extends Parser {
    constructor(logger) {
        super(logger);
    }
    parse(value) {
        if (Config.NamedMultiLineCheckedProblemPattern.is(value)) {
            return this.createNamedMultiLineProblemPattern(value);
        }
        else if (Config.MultiLineCheckedProblemPattern.is(value)) {
            return this.createMultiLineProblemPattern(value);
        }
        else if (Config.NamedCheckedProblemPattern.is(value)) {
            const result = this.createSingleProblemPattern(value);
            result.name = value.name;
            return result;
        }
        else if (Config.CheckedProblemPattern.is(value)) {
            return this.createSingleProblemPattern(value);
        }
        else {
            this.error(localize('ProblemPatternParser.problemPattern.missingRegExp', 'The problem pattern is missing a regular expression.'));
            return null;
        }
    }
    createSingleProblemPattern(value) {
        const result = this.doCreateSingleProblemPattern(value, true);
        if (result === undefined) {
            return null;
        }
        else if (result.kind === undefined) {
            result.kind = ProblemLocationKind.Location;
        }
        return this.validateProblemPattern([result]) ? result : null;
    }
    createNamedMultiLineProblemPattern(value) {
        const validPatterns = this.createMultiLineProblemPattern(value.patterns);
        if (!validPatterns) {
            return null;
        }
        const result = {
            name: value.name,
            label: value.label ? value.label : value.name,
            patterns: validPatterns
        };
        return result;
    }
    createMultiLineProblemPattern(values) {
        const result = [];
        for (let i = 0; i < values.length; i++) {
            const pattern = this.doCreateSingleProblemPattern(values[i], false);
            if (pattern === undefined) {
                return null;
            }
            if (i < values.length - 1) {
                if (!Types.isUndefined(pattern.loop) && pattern.loop) {
                    pattern.loop = false;
                    this.error(localize('ProblemPatternParser.loopProperty.notLast', 'The loop property is only supported on the last line matcher.'));
                }
            }
            result.push(pattern);
        }
        if (!result || result.length === 0) {
            this.error(localize('ProblemPatternParser.problemPattern.emptyPattern', 'The problem pattern is invalid. It must contain at least one pattern.'));
            return null;
        }
        if (result[0].kind === undefined) {
            result[0].kind = ProblemLocationKind.Location;
        }
        return this.validateProblemPattern(result) ? result : null;
    }
    doCreateSingleProblemPattern(value, setDefaults) {
        const regexp = this.createRegularExpression(value.regexp);
        if (regexp === undefined) {
            return undefined;
        }
        let result = { regexp };
        if (value.kind) {
            result.kind = ProblemLocationKind.fromString(value.kind);
        }
        function copyProperty(result, source, resultKey, sourceKey) {
            const value = source[sourceKey];
            if (typeof value === 'number') {
                result[resultKey] = value;
            }
        }
        copyProperty(result, value, 'file', 'file');
        copyProperty(result, value, 'location', 'location');
        copyProperty(result, value, 'line', 'line');
        copyProperty(result, value, 'character', 'column');
        copyProperty(result, value, 'endLine', 'endLine');
        copyProperty(result, value, 'endCharacter', 'endColumn');
        copyProperty(result, value, 'severity', 'severity');
        copyProperty(result, value, 'code', 'code');
        copyProperty(result, value, 'message', 'message');
        if (value.loop === true || value.loop === false) {
            result.loop = value.loop;
        }
        if (setDefaults) {
            if (result.location || result.kind === ProblemLocationKind.File) {
                const defaultValue = {
                    file: 1,
                    message: 0
                };
                result = Objects.mixin(result, defaultValue, false);
            }
            else {
                const defaultValue = {
                    file: 1,
                    line: 2,
                    character: 3,
                    message: 0
                };
                result = Objects.mixin(result, defaultValue, false);
            }
        }
        return result;
    }
    validateProblemPattern(values) {
        if (!values || values.length === 0) {
            this.error(localize('ProblemPatternParser.problemPattern.emptyPattern', 'The problem pattern is invalid. It must contain at least one pattern.'));
            return false;
        }
        let file = false, message = false, location = false, line = false;
        const locationKind = (values[0].kind === undefined) ? ProblemLocationKind.Location : values[0].kind;
        values.forEach((pattern, i) => {
            if (i !== 0 && pattern.kind) {
                this.error(localize('ProblemPatternParser.problemPattern.kindProperty.notFirst', 'The problem pattern is invalid. The kind property must be provided only in the first element'));
            }
            file = file || !Types.isUndefined(pattern.file);
            message = message || !Types.isUndefined(pattern.message);
            location = location || !Types.isUndefined(pattern.location);
            line = line || !Types.isUndefined(pattern.line);
        });
        if (!(file && message)) {
            this.error(localize('ProblemPatternParser.problemPattern.missingProperty', 'The problem pattern is invalid. It must have at least have a file and a message.'));
            return false;
        }
        if (locationKind === ProblemLocationKind.Location && !(location || line)) {
            this.error(localize('ProblemPatternParser.problemPattern.missingLocation', 'The problem pattern is invalid. It must either have kind: "file" or have a line or location match group.'));
            return false;
        }
        return true;
    }
    createRegularExpression(value) {
        let result;
        try {
            result = new RegExp(value);
        }
        catch (err) {
            this.error(localize('ProblemPatternParser.invalidRegexp', 'Error: The string {0} is not a valid regular expression.\n', value));
        }
        return result;
    }
}
export class ExtensionRegistryReporter {
    constructor(_collector, _validationStatus = new ValidationStatus()) {
        this._collector = _collector;
        this._validationStatus = _validationStatus;
    }
    info(message) {
        this._validationStatus.state = 1 /* ValidationState.Info */;
        this._collector.info(message);
    }
    warn(message) {
        this._validationStatus.state = 2 /* ValidationState.Warning */;
        this._collector.warn(message);
    }
    error(message) {
        this._validationStatus.state = 3 /* ValidationState.Error */;
        this._collector.error(message);
    }
    fatal(message) {
        this._validationStatus.state = 4 /* ValidationState.Fatal */;
        this._collector.error(message);
    }
    get status() {
        return this._validationStatus;
    }
}
export var Schemas;
(function (Schemas) {
    Schemas.ProblemPattern = {
        default: {
            regexp: '^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$',
            file: 1,
            location: 2,
            message: 3
        },
        type: 'object',
        additionalProperties: false,
        properties: {
            regexp: {
                type: 'string',
                description: localize('ProblemPatternSchema.regexp', 'The regular expression to find an error, warning or info in the output.')
            },
            kind: {
                type: 'string',
                description: localize('ProblemPatternSchema.kind', 'whether the pattern matches a location (file and line) or only a file.')
            },
            file: {
                type: 'integer',
                description: localize('ProblemPatternSchema.file', 'The match group index of the filename. If omitted 1 is used.')
            },
            location: {
                type: 'integer',
                description: localize('ProblemPatternSchema.location', 'The match group index of the problem\'s location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.')
            },
            line: {
                type: 'integer',
                description: localize('ProblemPatternSchema.line', 'The match group index of the problem\'s line. Defaults to 2')
            },
            column: {
                type: 'integer',
                description: localize('ProblemPatternSchema.column', 'The match group index of the problem\'s line character. Defaults to 3')
            },
            endLine: {
                type: 'integer',
                description: localize('ProblemPatternSchema.endLine', 'The match group index of the problem\'s end line. Defaults to undefined')
            },
            endColumn: {
                type: 'integer',
                description: localize('ProblemPatternSchema.endColumn', 'The match group index of the problem\'s end line character. Defaults to undefined')
            },
            severity: {
                type: 'integer',
                description: localize('ProblemPatternSchema.severity', 'The match group index of the problem\'s severity. Defaults to undefined')
            },
            code: {
                type: 'integer',
                description: localize('ProblemPatternSchema.code', 'The match group index of the problem\'s code. Defaults to undefined')
            },
            message: {
                type: 'integer',
                description: localize('ProblemPatternSchema.message', 'The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.')
            },
            loop: {
                type: 'boolean',
                description: localize('ProblemPatternSchema.loop', 'In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.')
            }
        }
    };
    Schemas.NamedProblemPattern = Objects.deepClone(Schemas.ProblemPattern);
    Schemas.NamedProblemPattern.properties = Objects.deepClone(Schemas.NamedProblemPattern.properties) || {};
    Schemas.NamedProblemPattern.properties['name'] = {
        type: 'string',
        description: localize('NamedProblemPatternSchema.name', 'The name of the problem pattern.')
    };
    Schemas.MultiLineProblemPattern = {
        type: 'array',
        items: Schemas.ProblemPattern
    };
    Schemas.NamedMultiLineProblemPattern = {
        type: 'object',
        additionalProperties: false,
        properties: {
            name: {
                type: 'string',
                description: localize('NamedMultiLineProblemPatternSchema.name', 'The name of the problem multi line problem pattern.')
            },
            patterns: {
                type: 'array',
                description: localize('NamedMultiLineProblemPatternSchema.patterns', 'The actual patterns.'),
                items: Schemas.ProblemPattern
            }
        }
    };
    Schemas.WatchingPattern = {
        type: 'object',
        additionalProperties: false,
        properties: {
            regexp: {
                type: 'string',
                description: localize('WatchingPatternSchema.regexp', 'The regular expression to detect the begin or end of a background task.')
            },
            file: {
                type: 'integer',
                description: localize('WatchingPatternSchema.file', 'The match group index of the filename. Can be omitted.')
            },
        }
    };
    Schemas.PatternType = {
        anyOf: [
            {
                type: 'string',
                description: localize('PatternTypeSchema.name', 'The name of a contributed or predefined pattern')
            },
            Schemas.ProblemPattern,
            Schemas.MultiLineProblemPattern
        ],
        description: localize('PatternTypeSchema.description', 'A problem pattern or the name of a contributed or predefined problem pattern. Can be omitted if base is specified.')
    };
    Schemas.ProblemMatcher = {
        type: 'object',
        additionalProperties: false,
        properties: {
            base: {
                type: 'string',
                description: localize('ProblemMatcherSchema.base', 'The name of a base problem matcher to use.')
            },
            owner: {
                type: 'string',
                description: localize('ProblemMatcherSchema.owner', 'The owner of the problem inside Code. Can be omitted if base is specified. Defaults to \'external\' if omitted and base is not specified.')
            },
            source: {
                type: 'string',
                description: localize('ProblemMatcherSchema.source', 'A human-readable string describing the source of this diagnostic, e.g. \'typescript\' or \'super lint\'.')
            },
            severity: {
                type: 'string',
                enum: ['error', 'warning', 'info'],
                description: localize('ProblemMatcherSchema.severity', 'The default severity for captures problems. Is used if the pattern doesn\'t define a match group for severity.')
            },
            applyTo: {
                type: 'string',
                enum: ['allDocuments', 'openDocuments', 'closedDocuments'],
                description: localize('ProblemMatcherSchema.applyTo', 'Controls if a problem reported on a text document is applied only to open, closed or all documents.')
            },
            pattern: Schemas.PatternType,
            fileLocation: {
                oneOf: [
                    {
                        type: 'string',
                        enum: ['absolute', 'relative', 'autoDetect', 'search']
                    },
                    {
                        type: 'array',
                        prefixItems: [
                            {
                                type: 'string',
                                enum: ['absolute', 'relative', 'autoDetect', 'search']
                            },
                        ],
                        minItems: 1,
                        maxItems: 1,
                        additionalItems: false
                    },
                    {
                        type: 'array',
                        prefixItems: [
                            { type: 'string', enum: ['relative', 'autoDetect'] },
                            { type: 'string' },
                        ],
                        minItems: 2,
                        maxItems: 2,
                        additionalItems: false,
                        examples: [
                            ['relative', '${workspaceFolder}'],
                            ['autoDetect', '${workspaceFolder}'],
                        ]
                    },
                    {
                        type: 'array',
                        prefixItems: [
                            { type: 'string', enum: ['search'] },
                            {
                                type: 'object',
                                properties: {
                                    'include': {
                                        oneOf: [
                                            { type: 'string' },
                                            { type: 'array', items: { type: 'string' } }
                                        ]
                                    },
                                    'exclude': {
                                        oneOf: [
                                            { type: 'string' },
                                            { type: 'array', items: { type: 'string' } }
                                        ]
                                    },
                                },
                                required: ['include']
                            }
                        ],
                        minItems: 2,
                        maxItems: 2,
                        additionalItems: false,
                        examples: [
                            ['search', { 'include': ['${workspaceFolder}'] }],
                            ['search', { 'include': ['${workspaceFolder}'], 'exclude': [] }]
                        ],
                    }
                ],
                description: localize('ProblemMatcherSchema.fileLocation', 'Defines how file names reported in a problem pattern should be interpreted. A relative fileLocation may be an array, where the second element of the array is the path of the relative file location. The search fileLocation mode, performs a deep (and, possibly, heavy) file system search within the directories specified by the include/exclude properties of the second element (or the current workspace directory if not specified).')
            },
            background: {
                type: 'object',
                additionalProperties: false,
                description: localize('ProblemMatcherSchema.background', 'Patterns to track the begin and end of a matcher active on a background task.'),
                properties: {
                    activeOnStart: {
                        type: 'boolean',
                        description: localize('ProblemMatcherSchema.background.activeOnStart', 'If set to true the background monitor starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.')
                    },
                    beginsPattern: {
                        oneOf: [
                            {
                                type: 'string'
                            },
                            Schemas.WatchingPattern
                        ],
                        description: localize('ProblemMatcherSchema.background.beginsPattern', 'If matched in the output the start of a background task is signaled.')
                    },
                    endsPattern: {
                        oneOf: [
                            {
                                type: 'string'
                            },
                            Schemas.WatchingPattern
                        ],
                        description: localize('ProblemMatcherSchema.background.endsPattern', 'If matched in the output the end of a background task is signaled.')
                    }
                }
            },
            watching: {
                type: 'object',
                additionalProperties: false,
                deprecationMessage: localize('ProblemMatcherSchema.watching.deprecated', 'The watching property is deprecated. Use background instead.'),
                description: localize('ProblemMatcherSchema.watching', 'Patterns to track the begin and end of a watching matcher.'),
                properties: {
                    activeOnStart: {
                        type: 'boolean',
                        description: localize('ProblemMatcherSchema.watching.activeOnStart', 'If set to true the watcher starts in active mode. This is the same as outputting a line that matches beginsPattern when the task starts.')
                    },
                    beginsPattern: {
                        oneOf: [
                            {
                                type: 'string'
                            },
                            Schemas.WatchingPattern
                        ],
                        description: localize('ProblemMatcherSchema.watching.beginsPattern', 'If matched in the output the start of a watching task is signaled.')
                    },
                    endsPattern: {
                        oneOf: [
                            {
                                type: 'string'
                            },
                            Schemas.WatchingPattern
                        ],
                        description: localize('ProblemMatcherSchema.watching.endsPattern', 'If matched in the output the end of a watching task is signaled.')
                    }
                }
            }
        }
    };
    Schemas.LegacyProblemMatcher = Objects.deepClone(Schemas.ProblemMatcher);
    Schemas.LegacyProblemMatcher.properties = Objects.deepClone(Schemas.LegacyProblemMatcher.properties) || {};
    Schemas.LegacyProblemMatcher.properties['watchedTaskBeginsRegExp'] = {
        type: 'string',
        deprecationMessage: localize('LegacyProblemMatcherSchema.watchedBegin.deprecated', 'This property is deprecated. Use the watching property instead.'),
        description: localize('LegacyProblemMatcherSchema.watchedBegin', 'A regular expression signaling that a watched tasks begins executing triggered through file watching.')
    };
    Schemas.LegacyProblemMatcher.properties['watchedTaskEndsRegExp'] = {
        type: 'string',
        deprecationMessage: localize('LegacyProblemMatcherSchema.watchedEnd.deprecated', 'This property is deprecated. Use the watching property instead.'),
        description: localize('LegacyProblemMatcherSchema.watchedEnd', 'A regular expression signaling that a watched tasks ends executing.')
    };
    Schemas.NamedProblemMatcher = Objects.deepClone(Schemas.ProblemMatcher);
    Schemas.NamedProblemMatcher.properties = Objects.deepClone(Schemas.NamedProblemMatcher.properties) || {};
    Schemas.NamedProblemMatcher.properties.name = {
        type: 'string',
        description: localize('NamedProblemMatcherSchema.name', 'The name of the problem matcher used to refer to it.')
    };
    Schemas.NamedProblemMatcher.properties.label = {
        type: 'string',
        description: localize('NamedProblemMatcherSchema.label', 'A human readable label of the problem matcher.')
    };
})(Schemas || (Schemas = {}));
const problemPatternExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'problemPatterns',
    jsonSchema: {
        description: localize('ProblemPatternExtPoint', 'Contributes problem patterns'),
        type: 'array',
        items: {
            anyOf: [
                Schemas.NamedProblemPattern,
                Schemas.NamedMultiLineProblemPattern
            ]
        }
    }
});
class ProblemPatternRegistryImpl {
    constructor() {
        this.patterns = Object.create(null);
        this.fillDefaults();
        this.readyPromise = new Promise((resolve, reject) => {
            problemPatternExtPoint.setHandler((extensions, delta) => {
                // We get all statically know extension during startup in one batch
                try {
                    delta.removed.forEach(extension => {
                        const problemPatterns = extension.value;
                        for (const pattern of problemPatterns) {
                            if (this.patterns[pattern.name]) {
                                delete this.patterns[pattern.name];
                            }
                        }
                    });
                    delta.added.forEach(extension => {
                        const problemPatterns = extension.value;
                        const parser = new ProblemPatternParser(new ExtensionRegistryReporter(extension.collector));
                        for (const pattern of problemPatterns) {
                            if (Config.NamedMultiLineCheckedProblemPattern.is(pattern)) {
                                const result = parser.parse(pattern);
                                if (parser.problemReporter.status.state < 3 /* ValidationState.Error */) {
                                    this.add(result.name, result.patterns);
                                }
                                else {
                                    extension.collector.error(localize('ProblemPatternRegistry.error', 'Invalid problem pattern. The pattern will be ignored.'));
                                    extension.collector.error(JSON.stringify(pattern, undefined, 4));
                                }
                            }
                            else if (Config.NamedProblemPattern.is(pattern)) {
                                const result = parser.parse(pattern);
                                if (parser.problemReporter.status.state < 3 /* ValidationState.Error */) {
                                    this.add(pattern.name, result);
                                }
                                else {
                                    extension.collector.error(localize('ProblemPatternRegistry.error', 'Invalid problem pattern. The pattern will be ignored.'));
                                    extension.collector.error(JSON.stringify(pattern, undefined, 4));
                                }
                            }
                            parser.reset();
                        }
                    });
                }
                catch (error) {
                    // Do nothing
                }
                resolve(undefined);
            });
        });
    }
    onReady() {
        return this.readyPromise;
    }
    add(key, value) {
        this.patterns[key] = value;
    }
    get(key) {
        return this.patterns[key];
    }
    fillDefaults() {
        this.add('msCompile', {
            regexp: /^\s*(?:\s*\d+>)?(\S.*?)(?:\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\))?\s*:\s+(?:(\S+)\s+)?((?:fatal +)?error|warning|info)\s+(\w+\d+)?\s*:\s*(.*)$/,
            kind: ProblemLocationKind.Location,
            file: 1,
            location: 2,
            severity: 4,
            code: 5,
            message: 6
        });
        this.add('gulp-tsc', {
            regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(\d+)\s+(.*)$/,
            kind: ProblemLocationKind.Location,
            file: 1,
            location: 2,
            code: 3,
            message: 4
        });
        this.add('cpp', {
            regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(C\d+)\s*:\s*(.*)$/,
            kind: ProblemLocationKind.Location,
            file: 1,
            location: 2,
            severity: 3,
            code: 4,
            message: 5
        });
        this.add('csc', {
            regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(CS\d+)\s*:\s*(.*)$/,
            kind: ProblemLocationKind.Location,
            file: 1,
            location: 2,
            severity: 3,
            code: 4,
            message: 5
        });
        this.add('vb', {
            regexp: /^(\S.*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(BC\d+)\s*:\s*(.*)$/,
            kind: ProblemLocationKind.Location,
            file: 1,
            location: 2,
            severity: 3,
            code: 4,
            message: 5
        });
        this.add('lessCompile', {
            regexp: /^\s*(.*) in file (.*) line no. (\d+)$/,
            kind: ProblemLocationKind.Location,
            message: 1,
            file: 2,
            line: 3
        });
        this.add('jshint', {
            regexp: /^(.*):\s+line\s+(\d+),\s+col\s+(\d+),\s(.+?)(?:\s+\((\w)(\d+)\))?$/,
            kind: ProblemLocationKind.Location,
            file: 1,
            line: 2,
            character: 3,
            message: 4,
            severity: 5,
            code: 6
        });
        this.add('jshint-stylish', [
            {
                regexp: /^(.+)$/,
                kind: ProblemLocationKind.Location,
                file: 1
            },
            {
                regexp: /^\s+line\s+(\d+)\s+col\s+(\d+)\s+(.+?)(?:\s+\((\w)(\d+)\))?$/,
                line: 1,
                character: 2,
                message: 3,
                severity: 4,
                code: 5,
                loop: true
            }
        ]);
        this.add('eslint-compact', {
            regexp: /^(.+):\sline\s(\d+),\scol\s(\d+),\s(Error|Warning|Info)\s-\s(.+)\s\((.+)\)$/,
            file: 1,
            kind: ProblemLocationKind.Location,
            line: 2,
            character: 3,
            severity: 4,
            message: 5,
            code: 6
        });
        this.add('eslint-stylish', [
            {
                regexp: /^((?:[a-zA-Z]:)*[./\\]+.*?)$/,
                kind: ProblemLocationKind.Location,
                file: 1
            },
            {
                regexp: /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)(?:\s\s+(.*))?$/,
                line: 1,
                character: 2,
                severity: 3,
                message: 4,
                code: 5,
                loop: true
            }
        ]);
        this.add('go', {
            regexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/,
            kind: ProblemLocationKind.Location,
            file: 2,
            line: 4,
            character: 6,
            message: 7
        });
    }
}
export const ProblemPatternRegistry = new ProblemPatternRegistryImpl();
export class ProblemMatcherParser extends Parser {
    constructor(logger) {
        super(logger);
    }
    parse(json) {
        const result = this.createProblemMatcher(json);
        if (!this.checkProblemMatcherValid(json, result)) {
            return undefined;
        }
        this.addWatchingMatcher(json, result);
        return result;
    }
    checkProblemMatcherValid(externalProblemMatcher, problemMatcher) {
        if (!problemMatcher) {
            this.error(localize('ProblemMatcherParser.noProblemMatcher', 'Error: the description can\'t be converted into a problem matcher:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
            return false;
        }
        if (!problemMatcher.pattern) {
            this.error(localize('ProblemMatcherParser.noProblemPattern', 'Error: the description doesn\'t define a valid problem pattern:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
            return false;
        }
        if (!problemMatcher.owner) {
            this.error(localize('ProblemMatcherParser.noOwner', 'Error: the description doesn\'t define an owner:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
            return false;
        }
        if (Types.isUndefined(problemMatcher.fileLocation)) {
            this.error(localize('ProblemMatcherParser.noFileLocation', 'Error: the description doesn\'t define a file location:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
            return false;
        }
        return true;
    }
    createProblemMatcher(description) {
        let result = null;
        const owner = Types.isString(description.owner) ? description.owner : UUID.generateUuid();
        const source = Types.isString(description.source) ? description.source : undefined;
        let applyTo = Types.isString(description.applyTo) ? ApplyToKind.fromString(description.applyTo) : ApplyToKind.allDocuments;
        if (!applyTo) {
            applyTo = ApplyToKind.allDocuments;
        }
        let fileLocation = undefined;
        let filePrefix = undefined;
        let kind;
        if (Types.isUndefined(description.fileLocation)) {
            fileLocation = FileLocationKind.Relative;
            filePrefix = '${workspaceFolder}';
        }
        else if (Types.isString(description.fileLocation)) {
            kind = FileLocationKind.fromString(description.fileLocation);
            if (kind) {
                fileLocation = kind;
                if ((kind === FileLocationKind.Relative) || (kind === FileLocationKind.AutoDetect)) {
                    filePrefix = '${workspaceFolder}';
                }
                else if (kind === FileLocationKind.Search) {
                    filePrefix = { include: ['${workspaceFolder}'] };
                }
            }
        }
        else if (Types.isStringArray(description.fileLocation)) {
            const values = description.fileLocation;
            if (values.length > 0) {
                kind = FileLocationKind.fromString(values[0]);
                if (values.length === 1 && kind === FileLocationKind.Absolute) {
                    fileLocation = kind;
                }
                else if (values.length === 2 && (kind === FileLocationKind.Relative || kind === FileLocationKind.AutoDetect) && values[1]) {
                    fileLocation = kind;
                    filePrefix = values[1];
                }
            }
        }
        else if (Array.isArray(description.fileLocation)) {
            const kind = FileLocationKind.fromString(description.fileLocation[0]);
            if (kind === FileLocationKind.Search) {
                fileLocation = FileLocationKind.Search;
                filePrefix = description.fileLocation[1] ?? { include: ['${workspaceFolder}'] };
            }
        }
        const pattern = description.pattern ? this.createProblemPattern(description.pattern) : undefined;
        let severity = description.severity ? Severity.fromValue(description.severity) : undefined;
        if (severity === Severity.Ignore) {
            this.info(localize('ProblemMatcherParser.unknownSeverity', 'Info: unknown severity {0}. Valid values are error, warning and info.\n', description.severity));
            severity = Severity.Error;
        }
        if (Types.isString(description.base)) {
            const variableName = description.base;
            if (variableName.length > 1 && variableName[0] === '$') {
                const base = ProblemMatcherRegistry.get(variableName.substring(1));
                if (base) {
                    result = Objects.deepClone(base);
                    if (description.owner !== undefined && owner !== undefined) {
                        result.owner = owner;
                    }
                    if (description.source !== undefined && source !== undefined) {
                        result.source = source;
                    }
                    if (description.fileLocation !== undefined && fileLocation !== undefined) {
                        result.fileLocation = fileLocation;
                        result.filePrefix = filePrefix;
                    }
                    if (description.pattern !== undefined && pattern !== undefined && pattern !== null) {
                        result.pattern = pattern;
                    }
                    if (description.severity !== undefined && severity !== undefined) {
                        result.severity = severity;
                    }
                    if (description.applyTo !== undefined && applyTo !== undefined) {
                        result.applyTo = applyTo;
                    }
                }
            }
        }
        else if (fileLocation && pattern) {
            result = {
                owner: owner,
                applyTo: applyTo,
                fileLocation: fileLocation,
                pattern: pattern,
            };
            if (source) {
                result.source = source;
            }
            if (filePrefix) {
                result.filePrefix = filePrefix;
            }
            if (severity) {
                result.severity = severity;
            }
        }
        if (Config.isNamedProblemMatcher(description)) {
            result.name = description.name;
            result.label = Types.isString(description.label) ? description.label : description.name;
        }
        return result;
    }
    createProblemPattern(value) {
        if (Types.isString(value)) {
            const variableName = value;
            if (variableName.length > 1 && variableName[0] === '$') {
                const result = ProblemPatternRegistry.get(variableName.substring(1));
                if (!result) {
                    this.error(localize('ProblemMatcherParser.noDefinedPatter', 'Error: the pattern with the identifier {0} doesn\'t exist.', variableName));
                }
                return result;
            }
            else {
                if (variableName.length === 0) {
                    this.error(localize('ProblemMatcherParser.noIdentifier', 'Error: the pattern property refers to an empty identifier.'));
                }
                else {
                    this.error(localize('ProblemMatcherParser.noValidIdentifier', 'Error: the pattern property {0} is not a valid pattern variable name.', variableName));
                }
            }
        }
        else if (value) {
            const problemPatternParser = new ProblemPatternParser(this.problemReporter);
            if (Array.isArray(value)) {
                return problemPatternParser.parse(value);
            }
            else {
                return problemPatternParser.parse(value);
            }
        }
        return null;
    }
    addWatchingMatcher(external, internal) {
        const oldBegins = this.createRegularExpression(external.watchedTaskBeginsRegExp);
        const oldEnds = this.createRegularExpression(external.watchedTaskEndsRegExp);
        if (oldBegins && oldEnds) {
            internal.watching = {
                activeOnStart: false,
                beginsPattern: { regexp: oldBegins },
                endsPattern: { regexp: oldEnds }
            };
            return;
        }
        const backgroundMonitor = external.background || external.watching;
        if (Types.isUndefinedOrNull(backgroundMonitor)) {
            return;
        }
        const begins = this.createWatchingPattern(backgroundMonitor.beginsPattern);
        const ends = this.createWatchingPattern(backgroundMonitor.endsPattern);
        if (begins && ends) {
            internal.watching = {
                activeOnStart: Types.isBoolean(backgroundMonitor.activeOnStart) ? backgroundMonitor.activeOnStart : false,
                beginsPattern: begins,
                endsPattern: ends
            };
            return;
        }
        if (begins || ends) {
            this.error(localize('ProblemMatcherParser.problemPattern.watchingMatcher', 'A problem matcher must define both a begin pattern and an end pattern for watching.'));
        }
    }
    createWatchingPattern(external) {
        if (Types.isUndefinedOrNull(external)) {
            return null;
        }
        let regexp;
        let file;
        if (Types.isString(external)) {
            regexp = this.createRegularExpression(external);
        }
        else {
            regexp = this.createRegularExpression(external.regexp);
            if (Types.isNumber(external.file)) {
                file = external.file;
            }
        }
        if (!regexp) {
            return null;
        }
        return file ? { regexp, file } : { regexp, file: 1 };
    }
    createRegularExpression(value) {
        let result = null;
        if (!value) {
            return result;
        }
        try {
            result = new RegExp(value);
        }
        catch (err) {
            this.error(localize('ProblemMatcherParser.invalidRegexp', 'Error: The string {0} is not a valid regular expression.\n', value));
        }
        return result;
    }
}
const problemMatchersExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'problemMatchers',
    deps: [problemPatternExtPoint],
    jsonSchema: {
        description: localize('ProblemMatcherExtPoint', 'Contributes problem matchers'),
        type: 'array',
        items: Schemas.NamedProblemMatcher
    }
});
class ProblemMatcherRegistryImpl {
    constructor() {
        this._onMatchersChanged = new Emitter();
        this.onMatcherChanged = this._onMatchersChanged.event;
        this.matchers = Object.create(null);
        this.fillDefaults();
        this.readyPromise = new Promise((resolve, reject) => {
            problemMatchersExtPoint.setHandler((extensions, delta) => {
                try {
                    delta.removed.forEach(extension => {
                        const problemMatchers = extension.value;
                        for (const matcher of problemMatchers) {
                            if (this.matchers[matcher.name]) {
                                delete this.matchers[matcher.name];
                            }
                        }
                    });
                    delta.added.forEach(extension => {
                        const problemMatchers = extension.value;
                        const parser = new ProblemMatcherParser(new ExtensionRegistryReporter(extension.collector));
                        for (const matcher of problemMatchers) {
                            const result = parser.parse(matcher);
                            if (result && isNamedProblemMatcher(result)) {
                                this.add(result);
                            }
                        }
                    });
                    if ((delta.removed.length > 0) || (delta.added.length > 0)) {
                        this._onMatchersChanged.fire();
                    }
                }
                catch (error) {
                }
                const matcher = this.get('tsc-watch');
                if (matcher) {
                    matcher.tscWatch = true;
                }
                resolve(undefined);
            });
        });
    }
    onReady() {
        ProblemPatternRegistry.onReady();
        return this.readyPromise;
    }
    add(matcher) {
        this.matchers[matcher.name] = matcher;
    }
    get(name) {
        return this.matchers[name];
    }
    keys() {
        return Object.keys(this.matchers);
    }
    fillDefaults() {
        this.add({
            name: 'msCompile',
            label: localize('msCompile', 'Microsoft compiler problems'),
            owner: 'msCompile',
            source: 'cpp',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: ProblemPatternRegistry.get('msCompile')
        });
        this.add({
            name: 'lessCompile',
            label: localize('lessCompile', 'Less problems'),
            deprecated: true,
            owner: 'lessCompile',
            source: 'less',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: ProblemPatternRegistry.get('lessCompile'),
            severity: Severity.Error
        });
        this.add({
            name: 'gulp-tsc',
            label: localize('gulp-tsc', 'Gulp TSC Problems'),
            owner: 'typescript',
            source: 'ts',
            applyTo: ApplyToKind.closedDocuments,
            fileLocation: FileLocationKind.Relative,
            filePrefix: '${workspaceFolder}',
            pattern: ProblemPatternRegistry.get('gulp-tsc')
        });
        this.add({
            name: 'jshint',
            label: localize('jshint', 'JSHint problems'),
            owner: 'jshint',
            source: 'jshint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: ProblemPatternRegistry.get('jshint')
        });
        this.add({
            name: 'jshint-stylish',
            label: localize('jshint-stylish', 'JSHint stylish problems'),
            owner: 'jshint',
            source: 'jshint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: ProblemPatternRegistry.get('jshint-stylish')
        });
        this.add({
            name: 'eslint-compact',
            label: localize('eslint-compact', 'ESLint compact problems'),
            owner: 'eslint',
            source: 'eslint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            filePrefix: '${workspaceFolder}',
            pattern: ProblemPatternRegistry.get('eslint-compact')
        });
        this.add({
            name: 'eslint-stylish',
            label: localize('eslint-stylish', 'ESLint stylish problems'),
            owner: 'eslint',
            source: 'eslint',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Absolute,
            pattern: ProblemPatternRegistry.get('eslint-stylish')
        });
        this.add({
            name: 'go',
            label: localize('go', 'Go problems'),
            owner: 'go',
            source: 'go',
            applyTo: ApplyToKind.allDocuments,
            fileLocation: FileLocationKind.Relative,
            filePrefix: '${workspaceFolder}',
            pattern: ProblemPatternRegistry.get('go')
        });
    }
}
export const ProblemMatcherRegistry = new ProblemMatcherRegistryImpl();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvYmxlbU1hdGNoZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90YXNrcy9jb21tb24vcHJvYmxlbU1hdGNoZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTlDLE9BQU8sS0FBSyxPQUFPLE1BQU0sb0NBQW9DLENBQUM7QUFDOUQsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEtBQUssTUFBTSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEUsT0FBTyxLQUFLLEtBQUssTUFBTSxrQ0FBa0MsQ0FBQztBQUMxRCxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sS0FBSyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDaEUsT0FBTyxRQUFRLE1BQU0scUNBQXFDLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBRXJELE9BQU8sRUFBRSxnQkFBZ0IsRUFBcUMsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFakgsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVELE9BQU8sRUFBRSxPQUFPLElBQUksY0FBYyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFL0UsT0FBTyxFQUFlLGNBQWMsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxrQkFBa0IsRUFBNkIsTUFBTSwyREFBMkQsQ0FBQztBQUMxSCxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFB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