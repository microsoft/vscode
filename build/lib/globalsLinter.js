"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const fs_1 = require("fs");
const path_1 = require("path");
const minimatch_1 = require("minimatch");
//
// #############################################################################################
//
// A custom typescript linter for the specific task of detecting the use of certain globals in a
// layer that does not allow the use. For example:
// - using DOM globals in common/node/electron-main layer (e.g. HTMLElement)
// - using node.js globals in common/browser layer (e.g. process)
//
// Make changes to below RULES to lift certain files from these checks only if absolutely needed
//
// #############################################################################################
//
const RULES = {
    "no-nodejs-globals": [
        {
            "target": "**/vs/**/test/{common,browser}/**",
            "allowed": [
                "process",
                "Buffer",
                "__filename",
                "__dirname"
            ]
        },
        {
            "target": "**/vs/workbench/api/common/extHostExtensionService.ts",
            "allowed": [
                "global" // -> safe access to 'global'
            ]
        },
        {
            "target": "**/vs/**/{common,browser}/**",
            "allowed": [ /* none */]
        }
    ],
    "no-dom-globals": [
        {
            "target": "**/vs/base/parts/quickopen/common/quickOpen.ts",
            "allowed": [
                "HTMLElement" // quick open will be replaced with a different widget soon
            ]
        },
        {
            "target": "**/vs/**/test/{common,node,electron-main}/**",
            "allowed": [
                "document",
                "HTMLElement",
                "createElement"
            ]
        },
        {
            "target": "**/vs/**/{common,node,electron-main}/**",
            "allowed": [ /* none */]
        }
    ]
};
const TS_CONFIG_PATH = path_1.join(__dirname, '../../', 'src', 'tsconfig.json');
const DOM_GLOBALS_DEFINITION = 'lib.dom.d.ts';
const DISALLOWED_DOM_GLOBALS = [
    "window",
    "document",
    "HTMLElement",
    "createElement"
];
const NODE_GLOBALS_DEFINITION = '@types/node';
const DISALLOWED_NODE_GLOBALS = [
    // https://nodejs.org/api/globals.html#globals_global_objects
    "NodeJS",
    "Buffer",
    "__dirname",
    "__filename",
    "clearImmediate",
    "exports",
    "global",
    "module",
    "process",
    "setImmediate"
];
let hasErrors = false;
function checkFile(program, sourceFile, rule) {
    checkNode(sourceFile);
    function checkNode(node) {
        if (node.kind !== ts.SyntaxKind.Identifier) {
            return ts.forEachChild(node, checkNode); // recurse down
        }
        const text = node.getText(sourceFile);
        if (!rule.disallowedGlobals.some(disallowedGlobal => disallowedGlobal === text)) {
            return; // only if disallowed
        }
        if (rule.allowedGlobals.some(allowed => allowed === text)) {
            return; // override
        }
        const checker = program.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol) {
            const declarations = symbol.declarations;
            if (Array.isArray(declarations) && symbol.declarations.some(declaration => {
                if (declaration) {
                    const parent = declaration.parent;
                    if (parent) {
                        const sourceFile = parent.getSourceFile();
                        if (sourceFile) {
                            const fileName = sourceFile.fileName;
                            if (fileName && fileName.indexOf(rule.definition) >= 0) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            })) {
                const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                console.log(`build/lib/globalsLinter.ts: Cannot use global '${text}' in ${sourceFile.fileName} (${line + 1},${character + 1})`);
                hasErrors = true;
            }
        }
    }
}
function createProgram(tsconfigPath) {
    const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const configHostParser = { fileExists: fs_1.existsSync, readDirectory: ts.sys.readDirectory, readFile: file => fs_1.readFileSync(file, "utf8"), useCaseSensitiveFileNames: process.platform === 'linux' };
    const tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, path_1.resolve(path_1.dirname(tsconfigPath)), { noEmit: true });
    const compilerHost = ts.createCompilerHost(tsConfigParsed.options, true);
    return ts.createProgram(tsConfigParsed.fileNames, tsConfigParsed.options, compilerHost);
}
//
// Create program and start checking
//
const program = createProgram(TS_CONFIG_PATH);
for (const sourceFile of program.getSourceFiles()) {
    let noDomGlobalsLinter = undefined;
    let noNodeJSGlobalsLinter = undefined;
    for (const rules of RULES["no-dom-globals"]) {
        if (minimatch_1.match([sourceFile.fileName], rules.target).length > 0) {
            noDomGlobalsLinter = { allowed: rules.allowed };
            break;
        }
    }
    for (const rules of RULES["no-nodejs-globals"]) {
        if (minimatch_1.match([sourceFile.fileName], rules.target).length > 0) {
            noNodeJSGlobalsLinter = { allowed: rules.allowed };
            break;
        }
    }
    if (!noDomGlobalsLinter && !noNodeJSGlobalsLinter) {
        continue; // no rule to run
    }
    // No DOM Globals
    if (noDomGlobalsLinter) {
        checkFile(program, sourceFile, {
            definition: DOM_GLOBALS_DEFINITION,
            disallowedGlobals: DISALLOWED_DOM_GLOBALS,
            allowedGlobals: noDomGlobalsLinter.allowed
        });
    }
    // No node.js Globals
    if (noNodeJSGlobalsLinter) {
        checkFile(program, sourceFile, {
            definition: NODE_GLOBALS_DEFINITION,
            disallowedGlobals: DISALLOWED_NODE_GLOBALS,
            allowedGlobals: noNodeJSGlobalsLinter.allowed
        });
    }
}
if (hasErrors) {
    process.exit(1);
}
