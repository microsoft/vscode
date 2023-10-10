"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTypeScriptBuilder = exports.CancellationToken = void 0;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const utils = require("./utils");
const colors = require("ansi-colors");
const ts = require("typescript");
const Vinyl = require("vinyl");
const source_map_1 = require("source-map");
var CancellationToken;
(function (CancellationToken) {
    CancellationToken.None = {
        isCancellationRequested() { return false; }
    };
})(CancellationToken || (exports.CancellationToken = CancellationToken = {}));
function normalize(path) {
    return path.replace(/\\/g, '/');
}
function createTypeScriptBuilder(config, projectFile, cmd) {
    const _log = config.logFn;
    const host = new LanguageServiceHost(cmd, projectFile, _log);
    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    const lastBuildVersion = Object.create(null);
    const lastDtsHash = Object.create(null);
    const userWantsDeclarations = cmd.options.declaration;
    let oldErrors = Object.create(null);
    let headUsed = process.memoryUsage().heapUsed;
    let emitSourceMapsInStream = true;
    // always emit declaraction files
    host.getCompilationSettings().declaration = true;
    function file(file) {
        // support gulp-sourcemaps
        if (file.sourceMap) {
            emitSourceMapsInStream = false;
        }
        if (!file.contents) {
            host.removeScriptSnapshot(file.path);
        }
        else {
            host.addScriptSnapshot(file.path, new VinylScriptSnapshot(file));
        }
    }
    function baseFor(snapshot) {
        if (snapshot instanceof VinylScriptSnapshot) {
            return cmd.options.outDir || snapshot.getBase();
        }
        else {
            return '';
        }
    }
    function isExternalModule(sourceFile) {
        return sourceFile.externalModuleIndicator
            || /declare\s+module\s+('|")(.+)\1/.test(sourceFile.getText());
    }
    function build(out, onError, token = CancellationToken.None) {
        function checkSyntaxSoon(fileName) {
            return new Promise(resolve => {
                process.nextTick(function () {
                    if (!host.getScriptSnapshot(fileName, false)) {
                        resolve([]); // no script, no problems
                    }
                    else {
                        resolve(service.getSyntacticDiagnostics(fileName));
                    }
                });
            });
        }
        function checkSemanticsSoon(fileName) {
            return new Promise(resolve => {
                process.nextTick(function () {
                    if (!host.getScriptSnapshot(fileName, false)) {
                        resolve([]); // no script, no problems
                    }
                    else {
                        resolve(service.getSemanticDiagnostics(fileName));
                    }
                });
            });
        }
        function emitSoon(fileName) {
            return new Promise(resolve => {
                process.nextTick(function () {
                    if (/\.d\.ts$/.test(fileName)) {
                        // if it's already a d.ts file just emit it signature
                        const snapshot = host.getScriptSnapshot(fileName);
                        const signature = crypto.createHash('md5')
                            .update(snapshot.getText(0, snapshot.getLength()))
                            .digest('base64');
                        return resolve({
                            fileName,
                            signature,
                            files: []
                        });
                    }
                    const output = service.getEmitOutput(fileName);
                    const files = [];
                    let signature;
                    for (const file of output.outputFiles) {
                        if (!emitSourceMapsInStream && /\.js\.map$/.test(file.name)) {
                            continue;
                        }
                        if (/\.d\.ts$/.test(file.name)) {
                            signature = crypto.createHash('md5')
                                .update(file.text)
                                .digest('base64');
                            if (!userWantsDeclarations) {
                                // don't leak .d.ts files if users don't want them
                                continue;
                            }
                        }
                        const vinyl = new Vinyl({
                            path: file.name,
                            contents: Buffer.from(file.text),
                            base: !config._emitWithoutBasePath && baseFor(host.getScriptSnapshot(fileName)) || undefined
                        });
                        if (!emitSourceMapsInStream && /\.js$/.test(file.name)) {
                            const sourcemapFile = output.outputFiles.filter(f => /\.js\.map$/.test(f.name))[0];
                            if (sourcemapFile) {
                                const extname = path.extname(vinyl.relative);
                                const basename = path.basename(vinyl.relative, extname);
                                const dirname = path.dirname(vinyl.relative);
                                const tsname = (dirname === '.' ? '' : dirname + '/') + basename + '.ts';
                                let sourceMap = JSON.parse(sourcemapFile.text);
                                sourceMap.sources[0] = tsname.replace(/\\/g, '/');
                                // check for an "input source" map and combine them
                                // in step 1 we extract all line edit from the input source map, and
                                // in step 2 we apply the line edits to the typescript source map
                                const snapshot = host.getScriptSnapshot(fileName);
                                if (snapshot instanceof VinylScriptSnapshot && snapshot.sourceMap) {
                                    const inputSMC = new source_map_1.SourceMapConsumer(snapshot.sourceMap);
                                    const tsSMC = new source_map_1.SourceMapConsumer(sourceMap);
                                    let didChange = false;
                                    const smg = new source_map_1.SourceMapGenerator({
                                        file: sourceMap.file,
                                        sourceRoot: sourceMap.sourceRoot
                                    });
                                    // step 1
                                    const lineEdits = new Map();
                                    inputSMC.eachMapping(m => {
                                        if (m.originalLine === m.generatedLine) {
                                            // same line mapping
                                            let array = lineEdits.get(m.originalLine);
                                            if (!array) {
                                                array = [];
                                                lineEdits.set(m.originalLine, array);
                                            }
                                            array.push([m.originalColumn, m.generatedColumn]);
                                        }
                                        else {
                                            // NOT SUPPORTED
                                        }
                                    });
                                    // step 2
                                    tsSMC.eachMapping(m => {
                                        didChange = true;
                                        const edits = lineEdits.get(m.originalLine);
                                        let originalColumnDelta = 0;
                                        if (edits) {
                                            for (const [from, to] of edits) {
                                                if (to >= m.originalColumn) {
                                                    break;
                                                }
                                                originalColumnDelta = from - to;
                                            }
                                        }
                                        smg.addMapping({
                                            source: m.source,
                                            name: m.name,
                                            generated: { line: m.generatedLine, column: m.generatedColumn },
                                            original: { line: m.originalLine, column: m.originalColumn + originalColumnDelta }
                                        });
                                    });
                                    if (didChange) {
                                        [tsSMC, inputSMC].forEach((consumer) => {
                                            consumer.sources.forEach((sourceFile) => {
                                                smg._sources.add(sourceFile);
                                                const sourceContent = consumer.sourceContentFor(sourceFile);
                                                if (sourceContent !== null) {
                                                    smg.setSourceContent(sourceFile, sourceContent);
                                                }
                                            });
                                        });
                                        sourceMap = JSON.parse(smg.toString());
                                        // const filename = '/Users/jrieken/Code/vscode/src2/' + vinyl.relative + '.map';
                                        // fs.promises.mkdir(path.dirname(filename), { recursive: true }).then(async () => {
                                        // 	await fs.promises.writeFile(filename, smg.toString());
                                        // 	await fs.promises.writeFile('/Users/jrieken/Code/vscode/src2/' + vinyl.relative, vinyl.contents);
                                        // });
                                    }
                                }
                                vinyl.sourceMap = sourceMap;
                            }
                        }
                        files.push(vinyl);
                    }
                    resolve({
                        fileName,
                        signature,
                        files
                    });
                });
            });
        }
        const newErrors = Object.create(null);
        const t1 = Date.now();
        const toBeEmitted = [];
        const toBeCheckedSyntactically = [];
        const toBeCheckedSemantically = [];
        const filesWithChangedSignature = [];
        const dependentFiles = [];
        const newLastBuildVersion = new Map();
        for (const fileName of host.getScriptFileNames()) {
            if (lastBuildVersion[fileName] !== host.getScriptVersion(fileName)) {
                toBeEmitted.push(fileName);
                toBeCheckedSyntactically.push(fileName);
                toBeCheckedSemantically.push(fileName);
            }
        }
        return new Promise(resolve => {
            const semanticCheckInfo = new Map();
            const seenAsDependentFile = new Set();
            function workOnNext() {
                let promise;
                // let fileName: string;
                // someone told us to stop this
                if (token.isCancellationRequested()) {
                    _log('[CANCEL]', '>>This compile run was cancelled<<');
                    newLastBuildVersion.clear();
                    resolve();
                    return;
                }
                // (1st) emit code
                else if (toBeEmitted.length) {
                    const fileName = toBeEmitted.pop();
                    promise = emitSoon(fileName).then(value => {
                        for (const file of value.files) {
                            _log('[emit code]', file.path);
                            out(file);
                        }
                        // remember when this was build
                        newLastBuildVersion.set(fileName, host.getScriptVersion(fileName));
                        // remeber the signature
                        if (value.signature && lastDtsHash[fileName] !== value.signature) {
                            lastDtsHash[fileName] = value.signature;
                            filesWithChangedSignature.push(fileName);
                        }
                    }).catch(e => {
                        // can't just skip this or make a result up..
                        host.error(`ERROR emitting ${fileName}`);
                        host.error(e);
                    });
                }
                // (2nd) check syntax
                else if (toBeCheckedSyntactically.length) {
                    const fileName = toBeCheckedSyntactically.pop();
                    _log('[check syntax]', fileName);
                    promise = checkSyntaxSoon(fileName).then(diagnostics => {
                        delete oldErrors[fileName];
                        if (diagnostics.length > 0) {
                            diagnostics.forEach(d => onError(d));
                            newErrors[fileName] = diagnostics;
                            // stop the world when there are syntax errors
                            toBeCheckedSyntactically.length = 0;
                            toBeCheckedSemantically.length = 0;
                            filesWithChangedSignature.length = 0;
                        }
                    });
                }
                // (3rd) check semantics
                else if (toBeCheckedSemantically.length) {
                    let fileName = toBeCheckedSemantically.pop();
                    while (fileName && semanticCheckInfo.has(fileName)) {
                        fileName = toBeCheckedSemantically.pop();
                    }
                    if (fileName) {
                        _log('[check semantics]', fileName);
                        promise = checkSemanticsSoon(fileName).then(diagnostics => {
                            delete oldErrors[fileName];
                            semanticCheckInfo.set(fileName, diagnostics.length);
                            if (diagnostics.length > 0) {
                                diagnostics.forEach(d => onError(d));
                                newErrors[fileName] = diagnostics;
                            }
                        });
                    }
                }
                // (4th) check dependents
                else if (filesWithChangedSignature.length) {
                    while (filesWithChangedSignature.length) {
                        const fileName = filesWithChangedSignature.pop();
                        if (!isExternalModule(service.getProgram().getSourceFile(fileName))) {
                            _log('[check semantics*]', fileName + ' is an internal module and it has changed shape -> check whatever hasn\'t been checked yet');
                            toBeCheckedSemantically.push(...host.getScriptFileNames());
                            filesWithChangedSignature.length = 0;
                            dependentFiles.length = 0;
                            break;
                        }
                        host.collectDependents(fileName, dependentFiles);
                    }
                }
                // (5th) dependents contd
                else if (dependentFiles.length) {
                    let fileName = dependentFiles.pop();
                    while (fileName && seenAsDependentFile.has(fileName)) {
                        fileName = dependentFiles.pop();
                    }
                    if (fileName) {
                        seenAsDependentFile.add(fileName);
                        const value = semanticCheckInfo.get(fileName);
                        if (value === 0) {
                            // already validated successfully -> look at dependents next
                            host.collectDependents(fileName, dependentFiles);
                        }
                        else if (typeof value === 'undefined') {
                            // first validate -> look at dependents next
                            dependentFiles.push(fileName);
                            toBeCheckedSemantically.push(fileName);
                        }
                    }
                }
                // (last) done
                else {
                    resolve();
                    return;
                }
                if (!promise) {
                    promise = Promise.resolve();
                }
                promise.then(function () {
                    // change to change
                    process.nextTick(workOnNext);
                }).catch(err => {
                    console.error(err);
                });
            }
            workOnNext();
        }).then(() => {
            // store the build versions to not rebuilt the next time
            newLastBuildVersion.forEach((value, key) => {
                lastBuildVersion[key] = value;
            });
            // print old errors and keep them
            utils.collections.forEach(oldErrors, entry => {
                entry.value.forEach(diag => onError(diag));
                newErrors[entry.key] = entry.value;
            });
            oldErrors = newErrors;
            // print stats
            const headNow = process.memoryUsage().heapUsed;
            const MB = 1024 * 1024;
            _log('[tsb]', `time:  ${colors.yellow((Date.now() - t1) + 'ms')} + \nmem:  ${colors.cyan(Math.ceil(headNow / MB) + 'MB')} ${colors.bgCyan('delta: ' + Math.ceil((headNow - headUsed) / MB))}`);
            headUsed = headNow;
        });
    }
    return {
        file,
        build,
        languageService: service
    };
}
exports.createTypeScriptBuilder = createTypeScriptBuilder;
class ScriptSnapshot {
    _text;
    _mtime;
    constructor(text, mtime) {
        this._text = text;
        this._mtime = mtime;
    }
    getVersion() {
        return this._mtime.toUTCString();
    }
    getText(start, end) {
        return this._text.substring(start, end);
    }
    getLength() {
        return this._text.length;
    }
    getChangeRange(_oldSnapshot) {
        return undefined;
    }
}
class VinylScriptSnapshot extends ScriptSnapshot {
    _base;
    sourceMap;
    constructor(file) {
        super(file.contents.toString(), file.stat.mtime);
        this._base = file.base;
        this.sourceMap = file.sourceMap;
    }
    getBase() {
        return this._base;
    }
}
class LanguageServiceHost {
    _cmdLine;
    _projectPath;
    _log;
    _snapshots;
    _filesInProject;
    _filesAdded;
    _dependencies;
    _dependenciesRecomputeList;
    _fileNameToDeclaredModule;
    _projectVersion;
    constructor(_cmdLine, _projectPath, _log) {
        this._cmdLine = _cmdLine;
        this._projectPath = _projectPath;
        this._log = _log;
        this._snapshots = Object.create(null);
        this._filesInProject = new Set(_cmdLine.fileNames);
        this._filesAdded = new Set();
        this._dependencies = new utils.graph.Graph(s => s);
        this._dependenciesRecomputeList = [];
        this._fileNameToDeclaredModule = Object.create(null);
        this._projectVersion = 1;
    }
    log(_s) {
        // console.log(s);
    }
    trace(_s) {
        // console.log(s);
    }
    error(s) {
        console.error(s);
    }
    getCompilationSettings() {
        return this._cmdLine.options;
    }
    getProjectVersion() {
        return String(this._projectVersion);
    }
    getScriptFileNames() {
        const res = Object.keys(this._snapshots).filter(path => this._filesInProject.has(path) || this._filesAdded.has(path));
        return res;
    }
    getScriptVersion(filename) {
        filename = normalize(filename);
        const result = this._snapshots[filename];
        if (result) {
            return result.getVersion();
        }
        return 'UNKNWON_FILE_' + Math.random().toString(16).slice(2);
    }
    getScriptSnapshot(filename, resolve = true) {
        filename = normalize(filename);
        let result = this._snapshots[filename];
        if (!result && resolve) {
            try {
                result = new VinylScriptSnapshot(new Vinyl({
                    path: filename,
                    contents: fs.readFileSync(filename),
                    base: this.getCompilationSettings().outDir,
                    stat: fs.statSync(filename)
                }));
                this.addScriptSnapshot(filename, result);
            }
            catch (e) {
                // ignore
            }
        }
        return result;
    }
    static _declareModule = /declare\s+module\s+('|")(.+)\1/g;
    addScriptSnapshot(filename, snapshot) {
        this._projectVersion++;
        filename = normalize(filename);
        const old = this._snapshots[filename];
        if (!old && !this._filesInProject.has(filename) && !filename.endsWith('.d.ts')) {
            //                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^
            //                                              not very proper!
            this._filesAdded.add(filename);
        }
        if (!old || old.getVersion() !== snapshot.getVersion()) {
            this._dependenciesRecomputeList.push(filename);
            const node = this._dependencies.lookup(filename);
            if (node) {
                node.outgoing = Object.create(null);
            }
            // (cheap) check for declare module
            LanguageServiceHost._declareModule.lastIndex = 0;
            let match;
            while ((match = LanguageServiceHost._declareModule.exec(snapshot.getText(0, snapshot.getLength())))) {
                let declaredModules = this._fileNameToDeclaredModule[filename];
                if (!declaredModules) {
                    this._fileNameToDeclaredModule[filename] = declaredModules = [];
                }
                declaredModules.push(match[2]);
            }
        }
        this._snapshots[filename] = snapshot;
        return old;
    }
    removeScriptSnapshot(filename) {
        this._filesInProject.delete(filename);
        this._filesAdded.delete(filename);
        this._projectVersion++;
        filename = normalize(filename);
        delete this._fileNameToDeclaredModule[filename];
        return delete this._snapshots[filename];
    }
    getCurrentDirectory() {
        return path.dirname(this._projectPath);
    }
    getDefaultLibFileName(options) {
        return ts.getDefaultLibFilePath(options);
    }
    directoryExists = ts.sys.directoryExists;
    getDirectories = ts.sys.getDirectories;
    fileExists = ts.sys.fileExists;
    readFile = ts.sys.readFile;
    readDirectory = ts.sys.readDirectory;
    // ---- dependency management
    collectDependents(filename, target) {
        while (this._dependenciesRecomputeList.length) {
            this._processFile(this._dependenciesRecomputeList.pop());
        }
        filename = normalize(filename);
        const node = this._dependencies.lookup(filename);
        if (node) {
            utils.collections.forEach(node.incoming, entry => target.push(entry.key));
        }
    }
    _processFile(filename) {
        if (filename.match(/.*\.d\.ts$/)) {
            return;
        }
        filename = normalize(filename);
        const snapshot = this.getScriptSnapshot(filename);
        if (!snapshot) {
            this._log('processFile', `Missing snapshot for: ${filename}`);
            return;
        }
        const info = ts.preProcessFile(snapshot.getText(0, snapshot.getLength()), true);
        // (1) ///-references
        info.referencedFiles.forEach(ref => {
            const resolvedPath = path.resolve(path.dirname(filename), ref.fileName);
            const normalizedPath = normalize(resolvedPath);
            this._dependencies.inertEdge(filename, normalizedPath);
        });
        // (2) import-require statements
        info.importedFiles.forEach(ref => {
            const stopDirname = normalize(this.getCurrentDirectory());
            let dirname = filename;
            let found = false;
            while (!found && dirname.indexOf(stopDirname) === 0) {
                dirname = path.dirname(dirname);
                const resolvedPath = path.resolve(dirname, ref.fileName);
                const normalizedPath = normalize(resolvedPath);
                if (this.getScriptSnapshot(normalizedPath + '.ts')) {
                    this._dependencies.inertEdge(filename, normalizedPath + '.ts');
                    found = true;
                }
                else if (this.getScriptSnapshot(normalizedPath + '.d.ts')) {
                    this._dependencies.inertEdge(filename, normalizedPath + '.d.ts');
                    found = true;
                }
            }
            if (!found) {
                for (const key in this._fileNameToDeclaredModule) {
                    if (this._fileNameToDeclaredModule[key] && ~this._fileNameToDeclaredModule[key].indexOf(ref.fileName)) {
                        this._dependencies.inertEdge(filename, key);
                    }
                }
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFDakMsaUNBQWlDO0FBQ2pDLHNDQUFzQztBQUN0QyxpQ0FBaUM7QUFDakMsK0JBQStCO0FBQy9CLDJDQUFpRjtBQVdqRixJQUFpQixpQkFBaUIsQ0FJakM7QUFKRCxXQUFpQixpQkFBaUI7SUFDcEIsc0JBQUksR0FBc0I7UUFDdEMsdUJBQXVCLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0tBQzNDLENBQUM7QUFDSCxDQUFDLEVBSmdCLGlCQUFpQixpQ0FBakIsaUJBQWlCLFFBSWpDO0FBUUQsU0FBUyxTQUFTLENBQUMsSUFBWTtJQUM5QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxTQUFnQix1QkFBdUIsQ0FBQyxNQUFzQixFQUFFLFdBQW1CLEVBQUUsR0FBeUI7SUFFN0csTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUUxQixNQUFNLElBQUksR0FBRyxJQUFJLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0QsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLE1BQU0sZ0JBQWdCLEdBQStCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekUsTUFBTSxXQUFXLEdBQStCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEUsTUFBTSxxQkFBcUIsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztJQUN0RCxJQUFJLFNB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