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
const fs_1 = require("fs");
const path = require("path");
const cp = require("child_process");
const commander_1 = require("commander");
const root = path.resolve(path.join(__dirname, '..'));
var ExtensionType;
(function (ExtensionType) {
    ExtensionType["Grammar"] = "grammar";
    ExtensionType["Theme"] = "theme";
    ExtensionType["Misc"] = "misc";
})(ExtensionType || (ExtensionType = {}));
// const exists = (path) => fs.stat(path).then(() => true, () => false);
// const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');
// async function readControlFile() {
// 	try {
// 		return JSON.parse(await fs.readFile(controlFilePath, 'utf8'));
// 	} catch (err) {
// 		return {};
// 	}
// }
// async function writeControlFile(control) {
// 	await mkdirp(path.dirname(controlFilePath));
// 	await fs.writeFile(controlFilePath, JSON.stringify(control, null, '  '));
// }
async function exec(cmd, args, opts = {}) {
    return new Promise((c, e) => {
        const child = cp.spawn(cmd, args, Object.assign({ stdio: 'inherit', env: process.env }, opts));
        child.on('close', code => code === 0 ? c() : e(`Returned ${code}`));
    });
}
function getExtensionType(packageJson) {
    var _a, _b, _c;
    if (((_a = packageJson.contributes) === null || _a === void 0 ? void 0 : _a.themes) || ((_b = packageJson.contributes) === null || _b === void 0 ? void 0 : _b.iconThemes)) {
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
    return {
        name: packageJson.name,
        path: extensionPath,
        type
    };
}
function getExtensions() {
    return __asyncGenerator(this, arguments, function* getExtensions_1() {
        const extensionsPath = path.join(root, 'extensions');
        const children = yield __await(fs_1.promises.readdir(extensionsPath));
        for (const child of children) {
            try {
                yield yield __await(yield __await(getExtension(path.join(extensionsPath, child))));
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
async function each([cmd, ...args], opts) {
    var e_1, _a;
    try {
        for (var _b = __asyncValues(getExtensions()), _c; _c = await _b.next(), !_c.done;) {
            const extension = _c.value;
            if (opts.type && extension.type !== opts.type) {
                continue;
            }
            console.log(`👉 ${extension.name}`);
            await exec(cmd, args, { cwd: extension.path });
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
if (require.main === module) {
    commander_1.program.version('0.0.1');
    commander_1.program
        .command('each <command...>')
        .option('-t, --type <type>', 'Specific type only')
        .description('Run a command in each extension repository')
        .allowUnknownOption()
        .action(each);
    commander_1.program.parseAsync(process.argv).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
