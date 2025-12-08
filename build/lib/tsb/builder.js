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