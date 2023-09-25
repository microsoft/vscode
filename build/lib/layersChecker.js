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
// A custom typescript checker for the specific task of detecting the use of certain types in a
// layer that does not allow such use. For example:
// - using DOM globals in common/node/electron-main layer (e.g. HTMLElement)
// - using node.js globals in common/browser layer (e.g. process)
//
// Make changes to below RULES to lift certain files from these checks only if absolutely needed
//
// #############################################################################################
//
// Types we assume are present in all implementations of JS VMs (node.js, browsers)
// Feel free to add more core types as you see needed if present in node.js and browsers
const CORE_TYPES = [
    'require', // from our AMD loader
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'console',
    'Console',
    'Error',
    'ErrorConstructor',
    'String',
    'TextDecoder',
    'TextEncoder',
    'self',
    'queueMicrotask',
    'Array',
    'Uint8Array',
    'Uint16Array',
    'Uint32Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Float32Array',
    'Float64Array',
    'Uint8ClampedArray',
    'BigUint64Array',
    'BigInt64Array',
    'btoa',
    'atob',
    'AbortController',
    'AbortSignal',
    'MessageChannel',
    'MessagePort',
    'URL',
    'URLSearchParams',
    'ReadonlyArray',
    'Event',
    'EventTarget',
    'BroadcastChannel',
    'performance',
    'Blob'
];
// Types that are defined in a common layer but are known to be only
// available in native environments should not be allowed in browser
const NATIVE_TYPES = [
    'NativeParsedArgs',
    'INativeEnvironmentService',
    'AbstractNativeEnvironmentService',
    'INativeWindowConfiguration',
    'ICommonNativeHostService',
    'INativeHostService',
    'IMainProcessService'
];
const RULES = [
    // Tests: skip
    {
        target: '**/vs/**/test/**',
        skip: true // -> skip all test files
    },
    // Common: vs/base/common/platform.ts
    {
        target: '**/vs/base/common/platform.ts',
        allowedTypes: [
            ...CORE_TYPES,
            // Safe access to postMessage() and friends
            'MessageEvent',
        ],
        disallowedTypes: NATIVE_TYPES,
        disallowedDefinitions: [
            'lib.dom.d.ts', // no DOM
            '@types/node' // no node.js
        ]
    },
    // Common: vs/platform/environment/common/*
    {
        target: '**/vs/platform/environment/common/*.ts',
        allowedTypes: CORE_TYPES,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
        disallowedDefinitions: [
            'lib.dom.d.ts', // no DOM
            '@types/node' // no node.js
        ]
    },
    // Common: vs/platform/window/common/window.ts
    {
        target: '**/vs/platform/window/common/window.ts',
        allowedTypes: CORE_TYPES,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
        disallowedDefinitions: [
            'lib.dom.d.ts', // no DOM
            '@types/node' // no node.js
        ]
    },
    // Common: vs/platform/native/common/native.ts
    {
        target: '**/vs/platform/native/common/native.ts',
        allowedTypes: CORE_TYPES,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
        disallowedDefinitions: [
            'lib.dom.d.ts', // no DOM
            '@types/node' // no node.js
        ]
    },
    // Common: vs/workbench/api/common/extHostExtensionService.ts
    {
        target: '**/vs/workbench/api/common/extHostExtensionService.ts',
        allowedTypes: [
            ...CORE_TYPES,
            // Safe access to global
            'global'
        ],
        disallowedTypes: NATIVE_TYPES,
        disallowedDefinitions: [
            'lib.dom.d.ts', // no DOM
            '@types/node' // no node.js
        ]
    },
    // Common
    {
        target: '**/vs/**/common/**',
        allowedTypes: CORE_TYPES,
        disallowedTypes: NATIVE_TYPES,
        disallowedDefinitions: [
            'lib.dom.d.ts', // no DOM
            '@types/node' // no node.js
        ]
    },
    // Browser
    {
        target: '**/vs/**/browser/**',
        allowedTypes: CORE_TYPES,
        disallowedTypes: NATIVE_TYPES,
        allowedDefinitions: [
            '@types/node/stream/consumers.d.ts' // node.js started to duplicate types from lib.dom.d.ts so we have to account for that
        ],
        disallowedDefinitions: [
            '@types/node' // no node.js
        ]
    },
    // Browser (editor contrib)
    {
        target: '**/src/vs/editor/contrib/**',
        allowedTypes: CORE_TYPES,
        disallowedTypes: NATIVE_TYPES,
        disallowedDefinitions: [
            '@types/node' // no node.js
        ]
    },
    // node.js
    {
        target: '**/vs/**/node/**',
        allowedTypes: CORE_TYPES,
        disallowedDefinitions: [
            'lib.dom.d.ts' // no DOM
        ]
    },
    // Electron (sandbox)
    {
        target: '**/vs/**/electron-sandbox/**',
        allowedTypes: CORE_TYPES,
        disallowedDefinitions: [
            '@types/node' // no node.js
        ]
    },
    // Electron (main)
    {
        target: '**/vs/**/electron-main/**',
        allowedTypes: [
            ...CORE_TYPES,
            // --> types from electron.d.ts that duplicate from lib.dom.d.ts
            'Event',
            'Request'
        ],
        disallowedTypes: [
            'ipcMain' // not allowed, use validatedIpcMain instead
        ],
        disallowedDefinitions: [
            'lib.dom.d.ts' // no DOM
        ]
    }
];
const TS_CONFIG_PATH = (0, path_1.join)(__dirname, '../../', 'src', 'tsconfig.json');
let hasErrors = false;
function checkFile(program, sourceFile, rule) {
    checkNode(sourceFile);
    function checkNode(node) {
        if (node.kind !== ts.SyntaxKind.Identifier) {
            return ts.forEachChild(node, checkNode); // recurse down
        }
        const checker = program.getTypeChecker();
        const symbol = checker.getSymbolAtLocation(node);
        if (!symbol) {
            return;
        }
        let _parentSymbol = symbol;
        while (_parentSymbol.parent) {
            _parentSymbol = _parentSymbol.parent;
        }
        const parentSymbol = _parentSymbol;
        const text = parentSymbol.getName();
        if (rule.allowedTypes?.some(allowed => allowed === text)) {
            return; // override
        }
        if (rule.disallowedTypes?.some(disallowed => disallowed === text)) {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            console.log(`[build/lib/layersChecker.ts]: Reference to type '${text}' violates layer '${rule.target}' (${sourceFile.fileName} (${line + 1},${character + 1}). Learn more about our source code organization at https://github.com/microsoft/vscode/wiki/Source-Code-Organization.`);
            hasErrors = true;
            return;
        }
        const declarations = symbol.declarations;
        if (Array.isArray(declarations)) {
            DeclarationLoop: for (const declaration of declarations) {
                if (declaration) {
                    const parent = declaration.parent;
                    if (parent) {
                        const parentSourceFile = parent.getSourceFile();
                        if (parentSourceFile) {
                            const definitionFileName = parentSourceFile.fileName;
                            if (rule.allowedDefinitions) {
                                for (const allowedDefinition of rule.allowedDefinitions) {
                                    if (definitionFileName.indexOf(allowedDefinition) >= 0) {
                                        continue DeclarationLoop;
                                    }
                                }
                            }
                            if (rule.disallowedDefinitions) {
                                for (const disallowedDefinition of rule.disallowedDefinitions) {
                                    if (definitionFileName.indexOf(disallowedDefinition) >= 0) {
                                        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                                        console.log(`[build/lib/layersChecker.ts]: Reference to symbol '${text}' from '${disallowedDefinition}' violates layer '${rule.target}' (${sourceFile.fileName} (${line + 1},${character + 1}) Learn more about our source code organization at https://github.com/microsoft/vscode/wiki/Source-Code-Organization.`);
                                        hasErrors = true;
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
function createProgram(tsconfigPath) {
    const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    const configHostParser = { fileExists: fs_1.existsSync, readDirectory: ts.sys.readDirectory, readFile: file => (0, fs_1.readFileSync)(file, 'utf8'), useCaseSensitiveFileNames: process.platform === 'linux' };
    const tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, (0, path_1.resolve)((0, path_1.dirname)(tsconfigPath)), { noEmit: true });
    const compilerHost = ts.createCompilerHost(tsConfigParsed.options, true);
    return ts.createProgram(tsConfigParsed.fileNames, tsConfigParsed.options, compilerHost);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5ZXJzQ2hlY2tlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxheWVyc0NoZWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxpQ0FBaUM7QUFDakMsMkJBQThDO0FBQzlDLCtCQUE4QztBQUM5Qyx5Q0FBa0M7QUFFbEMsRUFBRTtBQUNGLGdHQUFnRztBQUNoRyxFQUFFO0FBQ0YsK0ZBQStGO0FBQy9GLG1EQUFtRDtBQUNuRCw0RUFBNEU7QUFDNUUsaUVBQWlFO0FBQ2pFLEVBQUU7QUFDRixnR0FBZ0c7QUFDaEcsRUFBRTtBQUNGLGdHQUFnRztBQUNoRyxFQUFFO0FBRUYsbUZBQW1GO0FBQ25GLHdGQUF3RjtBQUN4RixNQUFNLFVBQVUsR0FBRztJQUNsQixTQUFTLEVBQUUsc0JBQXNCO0lBQ2pDLFlBQVk7SUFDWixjQUFjO0lBQ2QsYUFBYTtJQUNiLGVBQWU7SUFDZixTQUFTO0lBQ1QsU0FBUztJQUNULE9BQU87SUFDUCxrQkFBa0I7SUFDbEIsUUFBUTtJQUNSLGFBQWE7SUFDYixhQUFhO0lBQ2IsTUFBTTtJQUNOLGdCQUFnQjtJQUNoQixPQUFPO0lBQ1AsWUFBWTtJQUNaLGFBQWE7SUFDYixhQUFhO0lBQ2IsV0FBVztJQUNYLFlBQVk7SUFDWixZQUFZO0lBQ1osY0FBYztJQUNkLGNBQWM7SUFDZCxtQkFBbUI7SUFDbkIsZ0JBQWdCO0lBQ2hCLGVBQWU7SUFDZixNQUFNO0lBQ04sTUFBTTtJQUNOLGlCQUFpQjtJQUNqQixhQUFhO0lBQ2IsZ0JBQWdCO0lBQ2hCLGFBQWE7SUFDYixLQUFLO0lBQ0wsaUJBQWlCO0lBQ2pCLGVBQWU7SUFDZixPQUFPO0lBQ1AsYUFBYTtJQUNiLGtCQUFrQjtJQUNsQixhQUFhO0lBQ2IsTUFBTTtDQUNOLENBQUM7QUFFRixvRUFBb0U7QUFDcEUsb0VBQW9FO0FBQ3BFLE1BQU0sWUFBWSxHQUFHO0lBQ3BCLGtCQUFrQjtJQUNsQiwyQkFBMkI7SUFDM0Isa0NBQWtDO0lBQ2xDLDRCQUE0QjtJQUM1QiwwQkFBMEI7SUFDMUIsb0JBQW9CO0lBQ3BCLHFCQUFxQjtDQUNyQixDQUFDO0FBRUYsTUFBTSxLQUFLLEdBQVk7SUFFdEIsY0FBYztJQUNkO1FBQ0MsTUFBTSxFQUFFLGtCQUFrQjtRQUMxQixJQUFJLEVBQUUsSUFBSSxDQUFDLHlCQUF5QjtLQUNwQztJQUVELHFDQUFxQztJQUNyQztRQUNDLE1BQU0sRUFBRSwrQkFBK0I7UUFDdkMsWUFBWSxFQUFFO1lBQ2IsR0FBRyxVQUFVO1lBRWIsMkNBQTJDO1lBQzNDLGNBQWM7U0FDZDtRQUNELGVBQWUsRUFBRSxZQUFZO1FBQzdCLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCwyQ0FBMkM7SUFDM0M7UUFDQyxNQUFNLEVBQUUsd0NBQXdDO1FBQ2hELFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxFQUFDLG9EQUFvRCxDQUFDO1FBQ3ZFLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCw4Q0FBOEM7SUFDOUM7UUFDQyxNQUFNLEVBQUUsd0NBQXdDO1FBQ2hELFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxFQUFDLG9EQUFvRCxDQUFDO1FBQ3ZFLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCw4Q0FBOEM7SUFDOUM7UUFDQyxNQUFNLEVBQUUsd0NBQXdDO1FBQ2hELFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxFQUFDLG9EQUFvRCxDQUFDO1FBQ3ZFLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCw2REFBNkQ7SUFDN0Q7UUFDQyxNQUFNLEVBQUUsdURBQXVEO1FBQy9ELFlBQVksRUFBRTtZQUNiLEdBQUcsVUFBVTtZQUViLHdCQUF3QjtZQUN4QixRQUFRO1NBQ1I7UUFDRCxlQUFlLEVBQUUsWUFBWTtRQUM3QixxQkFBcUIsRUFBRTtZQUN0QixjQUFjLEVBQUUsU0FBUztZQUN6QixhQUFhLENBQUMsYUFBYTtTQUMzQjtLQUNEO0lBRUQsU0FBUztJQUNUO1FBQ0MsTUFBTSxFQUFFLG9CQUFvQjtRQUM1QixZQUFZLEVBQUUsVUFBVTtRQUN4QixlQUFlLEVBQUUsWUFBWTtRQUM3QixxQkFBcUIsRUFBRTtZQUN0QixjQUFjLEVBQUUsU0FBUztZQUN6QixhQUFhLENBQUMsYUFBYTtTQUMzQjtLQUNEO0lBRUQsVUFBVTtJQUNWO1FBQ0MsTUFBTSxFQUFFLHFCQUFxQjtRQUM3QixZQUFZLEVBQUUsVUFBVTtRQUN4QixlQUFlLEVBQUUsWUFBWTtRQUM3QixrQkFBa0IsRUFBRTtZQUNuQixtQ0FBbUMsQ0FBQyxzRkFBc0Y7U0FDMUg7UUFDRCxxQkFBcUIsRUFBRTtZQUN0QixhQUFhLENBQUMsYUFBYTtTQUMzQjtLQUNEO0lBRUQsMkJBQTJCO0lBQzNCO1FBQ0MsTUFBTSxFQUFFLDZCQUE2QjtRQUNyQyxZQUFZLEVBQUUsVUFBVTtRQUN4QixlQUFlLEVBQUUsWUFBWTtRQUM3QixxQkFBcUIsRUFBRTtZQUN0QixhQUFhLENBQUMsYUFBYTtTQUMzQjtLQUNEO0lBRUQsVUFBVTtJQUNWO1FBQ0MsTUFBTSxFQUFFLGtCQUFrQjtRQUMxQixZQUFZLEVBQUUsVUFBVTtRQUN4QixxQkFBcUIsRUFBRTtZQUN0QixjQUFjLENBQUMsU0FBUztTQUN4QjtLQUNEO0lBRUQscUJBQXFCO0lBQ3JCO1FBQ0MsTUFBTSxFQUFFLDhCQUE4QjtRQUN0QyxZQUFZLEVBQUUsVUFBVTtRQUN4QixxQkFBcUIsRUFBRTtZQUN0QixhQUFhLENBQUMsYUFBYTtTQUMzQjtLQUNEO0lBRUQsa0JBQWtCO0lBQ2xCO1FBQ0MsTUFBTSxFQUFFLDJCQUEyQjtRQUNuQyxZQUFZLEVBQUU7WUFDYixHQUFHLFVBQVU7WUFFYixnRUFBZ0U7WUFDaEUsT0FBTztZQUNQLFNBQVM7U0FDVDtRQUNELGVBQWUsRUFBRTtZQUNoQixTQUFTLENBQUMsNENBQTRDO1NBQ3REO1FBQ0QscUJBQXFCLEVBQUU7WUFDdEIsY0FBYyxDQUFDLFNBQVM7U0FDeEI7S0FDRDtDQUNELENBQUM7QUFFRixNQUFNLGNBQWMsR0FBRyxJQUFBLFdBQUksRUFBQyxTQUFTLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxlQUFlLENBQUMsQ0FBQztBQVd6RSxJQUFJLFNBQVMsR0FBRyxLQUFLLENBQUM7QUFFdEIsU0FBUyxTQUFTLENBQUMsT0FBbUIsRUFBRSxVQUF5QixFQUFFLElBQVc7SUFDN0UsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBRXRCLFNBQVMsU0FBUyxDQUFDLElBQWE7UUFDL0IsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxFQUFFO1lBQzNDLE9BQU8sRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxlQUFlO1NBQ3hEO1FBRUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqRCxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ1osT0FBTztTQUNQO1FBRUQsSUFBSSxhQUFhLEdBQVEsTUFBTSxDQUFDO1FBRWhDLE9BQU8sYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUM1QixhQUFhLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztTQUNyQztRQUVELE1BQU0sWUFBWSxHQUFHLGFBQTBCLENBQUM7UUFDaEQsTUFBTSxJQUFJLEdBQUcsWUFBWSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBRXBDLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDLEVBQUU7WUFDekQsT0FBTyxDQUFDLFdBQVc7U0FDbkI7UUFFRCxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxFQUFFO1lBQ2xFLE1BQU0sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsVUFBVSxDQUFDLDZCQUE2QixDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQ3RGLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0RBQW9ELElBQUkscUJBQXFCLElBQUksQ0FBQyxNQUFNLE1BQU0sVUFBVSxDQUFDLFFBQVEsS0FBSyxJQUFJLEdBQUcsQ0FBQyxJQUFJLFNBQVMsR0FBRyxDQUFDLHdIQUF3SCxDQUFDLENBQUM7WUFFclIsU0FBUyxHQUFHLElBQUksQ0FBQztZQUNqQixPQUFPO1NBQ1A7UUFFRCxNQUFNLFlBQVksR0FBRyxNQUFNLENBQUMsWUFBWSxDQUFDO1FBQ3pDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUNoQyxlQUFlLEVBQUUsS0FBSyxNQUFNLFdBQVcsSUFBSSxZQUFZLEVBQUU7Z0JBQ3hELElBQUksV0FBVyxFQUFFO29CQUNoQixNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsTUFBTSxDQUFDO29CQUNsQyxJQUFJLE1BQU0sRUFBRTt3QkFDWCxNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQzt3QkFDaEQsSUFBSSxnQkFBZ0IsRUFBRTs0QkFDckIsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUM7NEJBQ3JELElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFO2dDQUM1QixLQUFLLE1BQU0saUJBQWlCLElBQUksSUFBSSxDQUFDLGtCQUFrQixFQUFFO29DQUN4RCxJQUFJLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRTt3Q0FDdkQsU0FBUyxlQUFlLENBQUM7cUNBQ3pCO2lDQUNEOzZCQUNEOzRCQUNELElBQUksSUFBSSxDQUFDLHFCQUFxQixFQUFFO2dDQUMvQixLQUFLLE1BQU0sb0JBQW9CLElBQUksSUFBSSxDQUFDLHFCQUFxQixFQUFFO29DQUM5RCxJQUFJLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRTt3Q0FDMUQsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxVQUFVLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7d0NBRXRGLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0RBQXNELElBQUksV0FBVyxvQkFBb0IscUJBQXFCLElBQUksQ0FBQyxNQUFNLE1BQU0sVUFBVSxDQUFDLFFBQVEsS0FBSyxJQUFJLEdBQUcsQ0FBQyxJQUFJLFNBQVMsR0FBRyxDQUFDLHVIQUF1SCxDQUFDLENBQUM7d0NBRXJULFNBQVMsR0FBRyxJQUFJLENBQUM7d0NBQ2pCLE9BQU87cUNBQ1A7aUNBQ0Q7NkJBQ0Q7eUJBQ0Q7cUJBQ0Q7aUJBQ0Q7YUFDRDtTQUNEO0lBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxZQUFvQjtJQUMxQyxNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRWxFLE1BQU0sZ0JBQWdCLEdBQXVCLEVBQUUsVUFBVSxFQUFFLGVBQVUsRUFBRSxhQUFhLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBQSxpQkFBWSxFQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSx5QkFBeUIsRUFBRSxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRSxDQUFDO0lBQ3BOLE1BQU0sY0FBYyxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLElBQUEsY0FBTyxFQUFDLElBQUEsY0FBTyxFQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUUxSSxNQUFNLFlBQVksR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUV6RSxPQUFPLEVBQUUsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ3pGLENBQUM7QUFFRCxFQUFFO0FBQ0Ysb0NBQW9DO0FBQ3BDLEVBQUU7QUFDRixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFOUMsS0FBSyxNQUFNLFVBQVUsSUFBSSxPQUFPLENBQUMsY0FBYyxFQUFFLEVBQUU7SUFDbEQsS0FBSyxNQUFNLElBQUksSUFBSSxLQUFLLEVBQUU7UUFDekIsSUFBSSxJQUFBLGlCQUFLLEVBQUMsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7WUFDekQsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2YsU0FBUyxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDckM7WUFFRCxNQUFNO1NBQ047S0FDRDtDQUNEO0FBRUQsSUFBSSxTQUFTLEVBQUU7SUFDZCxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0NBQ2hCIn0=