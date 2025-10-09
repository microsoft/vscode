"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeScriptLanguageServiceHost = void 0;
/**
 * A TypeScript language service host
 */
class TypeScriptLanguageServiceHost {
    ts;
    libs;
    files;
    compilerOptions;
    defaultLibName;
    constructor(ts, libs, files, compilerOptions, defaultLibName) {
        this.ts = ts;
        this.libs = libs;
        this.files = files;
        this.compilerOptions = compilerOptions;
        this.defaultLibName = defaultLibName;
    }
    // --- language service host ---------------
    getCompilationSettings() {
        return this.compilerOptions;
    }
    getScriptFileNames() {
        return [
            ...this.libs.keys(),
            ...this.files.keys(),
        ];
    }
    getScriptVersion(_fileName) {
        return '1';
    }
    getProjectVersion() {
        return '1';
    }
    getScriptSnapshot(fileName) {
        if (this.files.has(fileName)) {
            return this.ts.ScriptSnapshot.fromString(this.files.get(fileName));
        }
        else if (this.libs.has(fileName)) {
            return this.ts.ScriptSnapshot.fromString(this.libs.get(fileName));
        }
        else {
            return this.ts.ScriptSnapshot.fromString('');
        }
    }
    getScriptKind(_fileName) {
        return this.ts.ScriptKind.TS;
    }
    getCurrentDirectory() {
        return '';
    }
    getDefaultLibFileName(_options) {
        return this.defaultLibName;
    }
    isDefaultLibFileName(fileName) {
        return fileName === this.getDefaultLibFileName(this.compilerOptions);
    }
    readFile(path, _encoding) {
        return this.files.get(path) || this.libs.get(path);
    }
    fileExists(path) {
        return this.files.has(path) || this.libs.has(path);
    }
}
exports.TypeScriptLanguageServiceHost = TypeScriptLanguageServiceHost;
//# sourceMappingURL=typeScriptLanguageServiceHost.js.map