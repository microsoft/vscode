"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTypeScriptBuilder = exports.CancellationToken = void 0;
const fs_1 = require("fs");
const path = require("path");
const crypto = require("crypto");
const utils = require("./utils");
const log = require("fancy-log");
const colors = require("ansi-colors");
const ts = require("typescript");
const Vinyl = require("vinyl");
var CancellationToken;
(function (CancellationToken) {
    CancellationToken.None = {
        isCancellationRequested() { return false; }
    };
})(CancellationToken = exports.CancellationToken || (exports.CancellationToken = {}));
function normalize(path) {
    return path.replace(/\\/g, '/');
}
function createTypeScriptBuilder(config, projectFile, cmd) {
    function _log(topic, message) {
        if (config.verbose) {
            log(colors.cyan(topic), message);
        }
    }
    let host = new LanguageServiceHost(cmd, projectFile, _log), service = ts.createLanguageService(host, ts.createDocumentRegistry()), lastBuildVersion = Object.create(null), lastDtsHash = Object.create(null), userWantsDeclarations = cmd.options.declaration, oldErrors = Object.create(null), headUsed = process.memoryUsage().heapUsed, emitSourceMapsInStream = true;
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
                        let snapshot = host.getScriptSnapshot(fileName);
                        let signature = crypto.createHash('md5')
                            .update(snapshot.getText(0, snapshot.getLength()))
                            .digest('base64');
                        return resolve({
                            fileName,
                            signature,
                            files: []
                        });
                    }
                    let output = service.getEmitOutput(fileName);
                    let files = [];
                    let signature;
                    for (let file of output.outputFiles) {
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
                        let vinyl = new Vinyl({
                            path: file.name,
                            contents: Buffer.from(file.text),
                            base: !config._emitWithoutBasePath && baseFor(host.getScriptSnapshot(fileName)) || undefined
                        });
                        if (!emitSourceMapsInStream && /\.js$/.test(file.name)) {
                            let sourcemapFile = output.outputFiles.filter(f => /\.js\.map$/.test(f.name))[0];
                            if (sourcemapFile) {
                                let extname = path.extname(vinyl.relative);
                                let basename = path.basename(vinyl.relative, extname);
                                let dirname = path.dirname(vinyl.relative);
                                let tsname = (dirname === '.' ? '' : dirname + '/') + basename + '.ts';
                                let sourceMap = JSON.parse(sourcemapFile.text);
                                sourceMap.sources[0] = tsname.replace(/\\/g, '/');
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
        let newErrors = Object.create(null);
        let t1 = Date.now();
        let toBeEmitted = [];
        let toBeCheckedSyntactically = [];
        let toBeCheckedSemantically = [];
        let filesWithChangedSignature = [];
        let dependentFiles = [];
        let newLastBuildVersion = new Map();
        for (let fileName of host.getScriptFileNames()) {
            if (lastBuildVersion[fileName] !== host.getScriptVersion(fileName)) {
                toBeEmitted.push(fileName);
                toBeCheckedSyntactically.push(fileName);
                toBeCheckedSemantically.push(fileName);
            }
        }
        return new Promise(resolve => {
            let semanticCheckInfo = new Map();
            let seenAsDependentFile = new Set();
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
                    let fileName = toBeEmitted.pop();
                    promise = emitSoon(fileName).then(value => {
                        for (let file of value.files) {
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
                    let fileName = toBeCheckedSyntactically.pop();
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
                        let fileName = filesWithChangedSignature.pop();
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
                        let value = semanticCheckInfo.get(fileName);
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
            if (config.verbose) {
                const headNow = process.memoryUsage().heapUsed;
                const MB = 1024 * 1024;
                log('[tsb]', 'time:', colors.yellow((Date.now() - t1) + 'ms'), 'mem:', colors.cyan(Math.ceil(headNow / MB) + 'MB'), colors.bgCyan('delta: ' + Math.ceil((headNow - headUsed) / MB)));
                headUsed = headNow;
            }
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
    constructor(file) {
        super(file.contents.toString(), file.stat.mtime);
        this._base = file.base;
    }
    getBase() {
        return this._base;
    }
}
class LanguageServiceHost {
    constructor(_cmdLine, _projectPath, _log) {
        this._cmdLine = _cmdLine;
        this._projectPath = _projectPath;
        this._log = _log;
        this.directoryExists = ts.sys.directoryExists;
        this.getDirectories = ts.sys.getDirectories;
        this.fileExists = ts.sys.fileExists;
        this.readFile = ts.sys.readFile;
        this.readDirectory = ts.sys.readDirectory;
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
                    contents: (0, fs_1.readFileSync)(filename),
                    base: this.getCompilationSettings().outDir,
                    stat: (0, fs_1.statSync)(filename)
                }));
                this.addScriptSnapshot(filename, result);
            }
            catch (e) {
                // ignore
            }
        }
        return result;
    }
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
            let node = this._dependencies.lookup(filename);
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
                for (let key in this._fileNameToDeclaredModule) {
                    if (this._fileNameToDeclaredModule[key] && ~this._fileNameToDeclaredModule[key].indexOf(ref.fileName)) {
                        this._dependencies.inertEdge(filename, key);
                    }
                }
            }
        });
    }
}
LanguageServiceHost._declareModule = /declare\s+module\s+('|")(.+)\1/g;
