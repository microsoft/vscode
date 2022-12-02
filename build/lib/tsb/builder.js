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
})(CancellationToken = exports.CancellationToken || (exports.CancellationToken = {}));
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
                                // check for an input source map and combine them
                                const snapshot = host.getScriptSnapshot(fileName);
                                if (snapshot instanceof VinylScriptSnapshot && snapshot.sourceMap) {
                                    const inputSMC = new source_map_1.SourceMapConsumer(snapshot.sourceMap);
                                    const tsSMC = new source_map_1.SourceMapConsumer(sourceMap);
                                    let didChange = false;
                                    const smg = new source_map_1.SourceMapGenerator({
                                        file: sourceMap.file,
                                        sourceRoot: sourceMap.sourceRoot
                                    });
                                    tsSMC.eachMapping(m => {
                                        didChange = true;
                                        const original = { line: m.originalLine, column: m.originalColumn };
                                        const generated = { line: m.generatedLine, column: m.generatedColumn };
                                        // JS-out position -> input original position
                                        const inputOriginal = inputSMC.originalPositionFor(original);
                                        if (inputOriginal.source !== null) {
                                            const inputSource = inputOriginal.source;
                                            smg.addMapping({
                                                source: inputSource,
                                                name: inputOriginal.name,
                                                generated: generated,
                                                original: inputOriginal
                                            });
                                            smg.setSourceContent(inputSource, inputSMC.sourceContentFor(inputSource));
                                        }
                                        else {
                                            smg.addMapping({
                                                source: m.source,
                                                name: m.name,
                                                generated: generated,
                                                original: original
                                            });
                                            smg.setSourceContent(m.source, tsSMC.sourceContentFor(m.source));
                                        }
                                    }, null, source_map_1.SourceMapConsumer.GENERATED_ORDER);
                                    if (didChange) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbGRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOzs7QUFFaEcseUJBQXlCO0FBQ3pCLDZCQUE2QjtBQUM3QixpQ0FBaUM7QUFDakMsaUNBQWlDO0FBQ2pDLHNDQUFzQztBQUN0QyxpQ0FBaUM7QUFDakMsK0JBQStCO0FBQy9CLDJDQUFpRjtBQVdqRixJQUFpQixpQkFBaUIsQ0FJakM7QUFKRCxXQUFpQixpQkFBaUI7SUFDcEIsc0JBQUksR0FBc0I7UUFDdEMsdUJBQXVCLEtBQUssT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDO0tBQzNDLENBQUM7QUFDSCxDQUFDLEVBSmdCLGlCQUFpQixHQUFqQix5QkFBaUIsS0FBakIseUJBQWlCLFFBSWpDO0FBUUQsU0FBUyxTQUFTLENBQUMsSUFBWTtJQUM5QixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCxTQUFnQix1QkFBdUIsQ0FBQyxNQUFzQixFQUFFLFdBQW1CLEVBQUUsR0FBeUI7SUFFN0csTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQztJQUUxQixNQUFNLElBQUksR0FBRyxJQUFJLG1CQUFtQixDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDN0QsTUFBTSxPQUFPLEdBQUcsRUFBRSxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsc0JBQXNCLEVBQUUsQ0FBQyxDQUFDO0lBQzVFLE1BQU0sZ0JBQWdCLEdBQStCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDekUsTUFBTSxXQUFXLEdBQStCLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDcEUsTUFBTSxxQkFBcUIsR0FBRyxHQUFHLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQztJ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