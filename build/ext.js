"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtensions = void 0;
const fs_1 = require("fs");
const path = require("path");
const cp = require("child_process");
const commander_1 = require("commander");
const storage_blob_1 = require("@azure/storage-blob");
const mkdirp = require("mkdirp");
const plimit = require("p-limit");
const rootPath = path.resolve(path.join(__dirname, '..'));
const vsixsPath = path.join(rootPath, '.build', 'vsix');
var ExtensionType;
(function (ExtensionType) {
    ExtensionType["Grammar"] = "grammar";
    ExtensionType["Theme"] = "theme";
    ExtensionType["Misc"] = "misc";
})(ExtensionType || (ExtensionType = {}));
async function spawn(cmd, argsOrOpts, opts = {}) {
    return new Promise((c, e) => {
        const child = Array.isArray(argsOrOpts)
            ? cp.spawn(cmd, argsOrOpts, Object.assign({ stdio: 'inherit', env: process.env }, opts))
            : cp.spawn(cmd, Object.assign({ stdio: 'inherit', env: process.env }, argsOrOpts));
        child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
    });
}
async function exec(cmd, opts = {}) {
    return new Promise((c, e) => {
        cp.exec(cmd, Object.assign({ env: process.env }, opts), (err, stdout) => err ? e(err) : c(opts.trim ? stdout.trim() : stdout));
    });
}
function getExtensionType(packageJson) {
    var _a, _b, _c;
    if (packageJson.main) {
        return "misc" /* Misc */;
    }
    else if (((_a = packageJson.contributes) === null || _a === void 0 ? void 0 : _a.themes) || ((_b = packageJson.contributes) === null || _b === void 0 ? void 0 : _b.iconThemes)) {
        return "theme" /* Theme */;
    }
    else if ((_c = packageJson.contributes) === null || _c === void 0 ? void 0 : _c.grammars) {
        return "grammar" /* Grammar */;
    }
    else {
        return "misc" /* Misc */;
    }
}
async function getExtension(extensionPath) {
    const packageJsonPath = path.join(extensionPath, 'package.json');
    const packageJson = JSON.parse(await fs_1.promises.readFile(packageJsonPath, 'utf8'));
    const type = getExtensionType(packageJson);
    const { name, version } = packageJson;
    const vsixName = `${name}-${version}.vsix`;
    return {
        name,
        version,
        path: extensionPath,
        type,
        vsixPath: path.join(vsixsPath, vsixName)
    };
}
function getExtensions() {
    return __asyncGenerator(this, arguments, function* getExtensions_1() {
        const extensionsPath = path.join(rootPath, 'extensions');
        const children = yield __await(fs_1.promises.readdir(extensionsPath));
        for (const child of children) {
            try {
                const extension = yield __await(getExtension(path.join(extensionsPath, child)));
                if (extension.type !== "theme" /* Theme */ && extension.type !== "grammar" /* Grammar */) {
                    continue;
                }
                yield yield __await(extension);
            }
            catch (err) {
                if (/ENOENT|ENOTDIR/.test(err.message)) {
                    continue;
                }
                throw err;
            }
        }
    });
}
exports.getExtensions = getExtensions;
async function each([cmd, ...args], opts) {
    var e_1, _a;
    try {
        for (var _b = __asyncValues(getExtensions()), _c; _c = await _b.next(), !_c.done;) {
            const extension = _c.value;
            if (opts.type && extension.type !== opts.type) {
                continue;
            }
            console.log(`👉 ${extension.name}`);
            await spawn(cmd, args, { cwd: extension.path });
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
        }
        finally { if (e_1) throw e_1.error; }
    }
}
async function runExtensionCI(extension, opts) {
    const vsixName = `${extension.name}-${extension.version}.vsix`;
    const commit = await exec(`git log -1 --format="%H" -- ${extension.path}`, { trim: true });
    const creds = new storage_blob_1.StorageSharedKeyCredential(opts.account, opts.key);
    const service = new storage_blob_1.BlobServiceClient(`https://${opts.account}.blob.core.windows.net`, creds);
    const container = service.getContainerClient('extensions');
    const blobName = `${commit}/${vsixName}`;
    const blob = container.getBlobClient(blobName);
    try {
        await blob.downloadToFile(extension.vsixPath);
        console.log(`📦 [${extension.name}] Downloaded from cache (${blobName})`);
        return;
    }
    catch (err) {
        if (err.statusCode !== 404) {
            throw err;
        }
    }
    console.log(`📦 [${extension.name}] Cache miss (${blobName})`);
    console.log(`📦 [${extension.name}] Building...`);
    await spawn(`yarn`, { shell: true, cwd: extension.path });
    await spawn(`vsce package --yarn -o ${vsixsPath}`, { shell: true, cwd: extension.path });
    const blockBlob = await blob.getBlockBlobClient();
    await blockBlob.uploadFile(extension.vsixPath);
}
async function ci() {
    var e_2, _a;
    const { 'AZURE_STORAGE_ACCOUNT_2': account, 'AZURE_STORAGE_KEY_2': key } = process.env;
    if (!account) {
        throw new Error('Missing env: AZURE_STORAGE_ACCOUNT_2');
    }
    else if (!key) {
        throw new Error('Missing env: AZURE_STORAGE_KEY_2');
    }
    await mkdirp(vsixsPath);
    const limit = plimit(10);
    const promises = [];
    try {
        for (var _b = __asyncValues(getExtensions()), _c; _c = await _b.next(), !_c.done;) {
            const extension = _c.value;
            if (extension.type !== "theme" /* Theme */ && extension.type !== "grammar" /* Grammar */) {
                continue;
            }
            promises.push(limit(() => runExtensionCI(extension, { account, key })));
        }
    }
    catch (e_2_1) { e_2 = { error: e_2_1 }; }
    finally {
        try {
            if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
        }
        finally { if (e_2) throw e_2.error; }
    }
    await Promise.all(promises);
}
if (require.main === module) {
    commander_1.program.version('0.0.1');
    commander_1.program
        .command('each <command...>')
        .option('-t, --type <type>', 'Specific type only')
        .description('Run a command in each extension repository')
        .allowUnknownOption()
        .action(each);
    commander_1.program
        .command('ci')
        .description('Run CI build steps for extensions')
        .action(ci);
    commander_1.program.parseAsync(process.argv).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
