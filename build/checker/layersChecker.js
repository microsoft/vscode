"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const fs_1 = require("fs");
const path_1 = require("path");
const minimatch_1 = require("minimatch");
//
// #############################################################################################
//
// A custom typescript checker for the specific task of detecting the use of certain types in a
// layer that does not allow such use.
//
// Make changes to below RULES to lift certain files from these checks only if absolutely needed
//
// NOTE: Most layer checks are done via tsconfig.<layer>.json files.
//
// #############################################################################################
//
// Types that are defined in a common layer but are known to be only
// available in native environments should not be allowed in browser
const NATIVE_TYPES = [
    'NativeParsedArgs',
    'INativeEnvironmentService',
    'AbstractNativeEnvironmentService',
    'INativeWindowConfiguration',
    'ICommonNativeHostService',
    'INativeHostService',
    'IMainProcessService',
    'INativeBrowserElementsService',
];
const RULES = [
    // Tests: skip
    {
        target: '**/vs/**/test/**',
        skip: true // -> skip all test files
    },
    // Common: vs/platform services that can access native types
    {
        target: `**/vs/platform/{${[
            'environment/common/*.ts',
            'window/common/window.ts',
            'native/common/native.ts',
            'native/common/nativeHostService.ts',
            'browserElements/common/browserElements.ts',
            'browserElements/common/nativeBrowserElementsService.ts'
        ].join(',')}}`,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
    },
    // Common: vs/base/parts/sandbox/electron-browser/preload{,-aux}.ts
    {
        target: '**/vs/base/parts/sandbox/electron-browser/preload{,-aux}.ts',
        disallowedTypes: NATIVE_TYPES,
    },
    // Common
    {
        target: '**/vs/**/common/**',
        disallowedTypes: NATIVE_TYPES,
    },
    // Common
    {
        target: '**/vs/**/worker/**',
        disallowedTypes: NATIVE_TYPES,
    },
    // Browser
    {
        target: '**/vs/**/browser/**',
        disallowedTypes: NATIVE_TYPES,
    },
    // Electron (main, utility)
    {
        target: '**/vs/**/{electron-main,electron-utility}/**',
        disallowedTypes: [
            'ipcMain' // not allowed, use validatedIpcMain instead
        ]
    }
];
const TS_CONFIG_PATH = (0, path_1.join)(__dirname, '../../', 'src', 'tsconfig.json');
let hasErrors = false;
function checkFile(program, sourceFile, rule) {
    checkNode(sourceFile);
    function checkNode(node) {
        if (node.kind !== typescript_1.default.SyntaxKind.Identifier) {
            return typescript_1.default.forEachChild(node, checkNode); // recurse down
        }
        const checker = program.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(node);
        if (!symbol) {
            return;
        }
        let text = symbol.getName();
        let _parentSymbol = symbol;
        while (_parentSymbol.parent) {
            _parentSymbol = _parentSymbol.parent;
        }
        const parentSymbol = _parentSymbol;
        text = parentSymbol.getName();
        if (rule.disallowedTypes?.some(disallowed => disallowed === text)) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            console.log(`[build/checker/layersChecker.ts]: Reference to type '${text}' violates layer '${rule.target}' (${sourceFile.fileName} (${line + 1},${character + 1}). Learn more about our source code organization at https://github.com/microsoft/vscode/wiki/Source-Code-Organization.`);
            hasErrors = true;
            return;
        }
    }
}
function createProgram(tsconfigPath) {
    const tsConfig = typescript_1.default.readConfigFile(tsconfigPath, typescript_1.default.sys.readFile);
    const configHostParser = { fileExists: fs_1.existsSync, readDirectory: typescript_1.default.sys.readDirectory, readFile: file => (0, fs_1.readFileSync)(file, 'utf8'), useCaseSensitiveFileNames: process.platform === 'linux' };
    const tsConfigParsed = typescript_1.default.parseJsonConfigFileContent(tsConfig.config, configHostParser, (0, path_1.resolve)((0, path_1.dirname)(tsconfigPath)), { noEmit: true });
    const compilerHost = typescript_1.default.createCompilerHost(tsConfigParsed.options, true);
    return typescript_1.default.createProgram(tsConfigParsed.fileNames, tsConfigParsed.options, compilerHost);
}
//
// Create program and start checking
//
const program = createProgram(TS_CONFIG_PATH);
for (const sourceFile of program.getSourceFiles()) {
    for (const rule of RULES) {
        if ((0, minimatch_1.match)([sourceFile.fileName], rule.target).length > 0) {
            if (!rule.skip) {
                checkFile(program, sourceFile, rule);
            }
            break;
        }
    }
}
if (hasErrors) {
    process.exit(1);
}
//# sourceMappingURL=layersChecker.js.map