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
    // Common: vs/base/common/async.ts
    {
        target: '**/vs/base/common/async.ts',
        allowedTypes: [
            ...CORE_TYPES,
            // Safe access to requestIdleCallback & cancelIdleCallback
            'requestIdleCallback',
            'cancelIdleCallback'
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
    // Common: vs/platform/native/common/nativeHostService.ts
    {
        target: '**/vs/platform/native/common/nativeHostService.ts',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5ZXJzQ2hlY2tlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxheWVyc0NoZWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxpQ0FBaUM7QUFDakMsMkJBQThDO0FBQzlDLCtCQUE4QztBQUM5Qyx5Q0FBa0M7QUFFbEMsRUFBRTtBQUNGLGdHQUFnRztBQUNoRyxFQUFFO0FBQ0YsK0ZBQStGO0FBQy9GLG1EQUFtRDtBQUNuRCw0RUFBNEU7QUFDNUUsaUVBQWlFO0FBQ2pFLEVBQUU7QUFDRixnR0FBZ0c7QUFDaEcsRUFBRTtBQUNGLGdHQUFnRztBQUNoRyxFQUFFO0FBRUYsbUZBQW1GO0FBQ25GLHdGQUF3RjtBQUN4RixNQUFNLFVBQVUsR0FBRztJQUNsQixTQUFTLEVBQUUsc0JBQXNCO0lBQ2pDLFlBQVk7SUFDWixjQUFjO0lBQ2QsYUFBYTtJQUNiLGVBQWU7SUFDZixTQUFTO0lBQ1QsU0FBUztJQUNULE9BQU87SUFDUCxrQkFBa0I7SUFDbEIsUUFBUTtJQUNSLGFBQWE7SUFDYixhQUFhO0lBQ2IsTUFBTTtJQUNOLGdCQUFnQjtJQUNoQixPQUFPO0lBQ1AsWUFBWTtJQUNaLGFBQWE7SUFDYixhQUFhO0lBQ2IsV0FBVztJQUNYLFlBQVk7SUFDWixZQUFZO0lBQ1osY0FBYztJQUNkLGNBQWM7SUFDZCxtQkFBbUI7SUFDbkIsZ0JBQWdCO0lBQ2hCLGVBQWU7SUFDZixNQUFNO0lBQ04sTUFBTTtJQUNOLGlCQUFpQjtJQUNqQixhQUFhO0lBQ2IsZ0JBQWdCO0lBQ2hCLGFBQWE7SUFDYixLQUFLO0lBQ0wsaUJBQWlCO0lBQ2pCLGVBQWU7SUFDZixPQUFPO0lBQ1AsYUFBYTtJQUNiLGtCQUFrQjtJQUNsQixhQUFhO0lBQ2IsTUFBTTtDQUNOLENBQUM7QUFFRixvRUFBb0U7QUFDcEUsb0VBQW9FO0FBQ3BFLE1BQU0sWUFBWSxHQUFHO0lBQ3BCLGtCQUFrQjtJQUNsQiwyQkFBMkI7SUFDM0Isa0NBQWtDO0lBQ2xDLDRCQUE0QjtJQUM1QiwwQkFBMEI7SUFDMUIsb0JBQW9CO0lBQ3BCLHFCQUFxQjtDQUNyQixDQUFDO0FBRUYsTUFBTSxLQUFLLEdBQVk7SUFFdEIsY0FBYztJQUNkO1FBQ0MsTUFBTSxFQUFFLGtCQUFrQjtRQUMxQixJQUFJLEVBQUUsSUFBSSxDQUFDLHlCQUF5QjtLQUNwQztJQUVELHFDQUFxQztJQUNyQztRQUNDLE1BQU0sRUFBRSwrQkFBK0I7UUFDdkMsWUFBWSxFQUFFO1lBQ2IsR0FBRyxVQUFVO1lBRWIsMkNBQTJDO1lBQzNDLGNBQWM7U0FDZDtRQUNELGVBQWUsRUFBRSxZQUFZO1FBQzdCLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxrQ0FBa0M7SUFDbEM7UUFDQyxNQUFNLEVBQUUsNEJBQTRCO1FBQ3BDLFlBQVksRUFBRTtZQUNiLEdBQUcsVUFBVTtZQUViLDBEQUEwRDtZQUMxRCxxQkFBcUI7WUFDckIsb0JBQW9CO1NBQ3BCO1FBQ0QsZUFBZSxFQUFFLFlBQVk7UUFDN0IscUJBQXFCLEVBQUU7WUFDdEIsY0FBYyxFQUFFLFNBQVM7WUFDekIsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELDJDQUEyQztJQUMzQztRQUNDLE1BQU0sRUFBRSx3Q0FBd0M7UUFDaEQsWUFBWSxFQUFFLFVBQVU7UUFDeEIsZUFBZSxFQUFFLEVBQUMsb0RBQW9ELENBQUM7UUFDdkUscUJBQXFCLEVBQUU7WUFDdEIsY0FBYyxFQUFFLFNBQVM7WUFDekIsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELDhDQUE4QztJQUM5QztRQUNDLE1BQU0sRUFBRSx3Q0FBd0M7UUFDaEQsWUFBWSxFQUFFLFVBQVU7UUFDeEIsZUFBZSxFQUFFLEVBQUMsb0RBQW9ELENBQUM7UUFDdkUscUJBQXFCLEVBQUU7WUFDdEIsY0FBYyxFQUFFLFNBQVM7WUFDekIsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELDhDQUE4QztJQUM5QztRQUNDLE1BQU0sRUFBRSx3Q0FBd0M7UUFDaEQsWUFBWSxFQUFFLFVBQVU7UUFDeEIsZUFBZSxFQUFFLEVBQUMsb0RBQW9ELENBQUM7UUFDdkUscUJBQXFCLEVBQUU7WUFDdEIsY0FBYyxFQUFFLFNBQVM7WUFDekIsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELHlEQUF5RDtJQUN6RDtRQUNDLE1BQU0sRUFBRSxtREFBbUQ7UUFDM0QsWUFBWSxFQUFFLFVBQVU7UUFDeEIsZUFBZSxFQUFFLEVBQUMsb0RBQW9ELENBQUM7UUFDdkUscUJBQXFCLEVBQUU7WUFDdEIsY0FBYyxFQUFFLFNBQVM7WUFDekIsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELDZEQUE2RDtJQUM3RDtRQUNDLE1BQU0sRUFBRSx1REFBdUQ7UUFDL0QsWUFBWSxFQUFFO1lBQ2IsR0FBRyxVQUFVO1lBRWIsd0JBQXdCO1lBQ3hCLFFBQVE7U0FDUjtRQUNELGVBQWUsRUFBRSxZQUFZO1FBQzdCLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxTQUFTO0lBQ1Q7UUFDQyxNQUFNLEVBQUUsb0JBQW9CO1FBQzVCLFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxZQUFZO1FBQzdCLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsRUFBRSxTQUFTO1lBQ3pCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxVQUFVO0lBQ1Y7UUFDQyxNQUFNLEVBQUUscUJBQXFCO1FBQzdCLFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxZQUFZO1FBQzdCLGtCQUFrQixFQUFFO1lBQ25CLG1DQUFtQyxDQUFDLHNGQUFzRjtTQUMxSDtRQUNELHFCQUFxQixFQUFFO1lBQ3RCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCwyQkFBMkI7SUFDM0I7UUFDQyxNQUFNLEVBQUUsNkJBQTZCO1FBQ3JDLFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxZQUFZO1FBQzdCLHFCQUFxQixFQUFFO1lBQ3RCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxVQUFVO0lBQ1Y7UUFDQyxNQUFNLEVBQUUsa0JBQWtCO1FBQzFCLFlBQVksRUFBRSxVQUFVO1FBQ3hCLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsQ0FBQyxTQUFTO1NBQ3hCO0tBQ0Q7SUFFRCxxQkFBcUI7SUFDckI7UUFDQyxNQUFNLEVBQUUsOEJBQThCO1FBQ3RDLFlBQVksRUFBRSxVQUFVO1FBQ3hCLHFCQUFxQixFQUFFO1lBQ3RCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxrQkFBa0I7SUFDbEI7UUFDQyxNQUFNLEVBQUUsMkJBQTJCO1FBQ25DLFlBQVksRUFBRTtZQUNiLEdBQUcsVUFBVTtZQUViLGdFQUFnRTtZQUNoRSxPQUFPO1lBQ1AsU0FBUztTQUNUO1FBQ0QsZUFBZSxFQUFFO1lBQ2hCLFNBQVMsQ0FBQyw0Q0FBNEM7U0FDdEQ7UUFDRCxxQkFBcUIsRUFBRTtZQUN0QixjQUFjLENBQUMsU0FBUztTQUN4QjtLQUNEO0NBQ0QsQ0FBQztBQUVGLE1BQU0sY0FBYyxHQUFHLElBQUEsV0FBSSxFQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBV3pFLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztBQUV0QixTQUFTLFNBQVMsQ0FBQyxPQUFtQixFQUFFLFVBQXlCLEVBQUUsSUFBVztJQUM3RSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7SUFFdEIsU0FBUyxTQUFTLENBQUMsSUFBYTtRQUMvQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUM1QyxPQUFPLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsZUFBZTtRQUN6RCxDQUFDO1FBRUQsTUFBTSxPQUFPLEdBQUcsT0FBTyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3pDLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVqRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixPQUFPO1FBQ1IsQ0FBQztRQUVELElBQUksYUFBYSxHQUFRLE1BQU0sQ0FBQztRQUVoQyxPQUFPLGFBQWEsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUM3QixhQUFhLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztRQUN0QyxDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsYUFBMEIsQ0FBQztRQUNoRCxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFcEMsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDO1lBQzFELE9BQU8sQ0FBQyxXQUFXO1FBQ3BCLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsVUFBVSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDbkUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxVQUFVLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsSUFBSSxxQkFBcUIsSUFBSSxDQUFDLE1BQU0sTUFBTSxVQUFVLENBQUMsUUFBUSxLQUFLLElBQUksR0FBRyxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsd0hBQXdILENBQUMsQ0FBQztZQUVyUixTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLE9BQU87UUFDUixDQUFDO1FBRUQsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQztRQUN6QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUNqQyxlQUFlLEVBQUUsS0FBSyxNQUFNLFdBQVcsSUFBSSxZQUFZLEVBQUUsQ0FBQztnQkFDekQsSUFBSSxXQUFXLEVBQUUsQ0FBQztvQkFDakIsTUFBTSxNQUFNLEdBQUcsV0FBVyxDQUFDLE1BQU0sQ0FBQztvQkFDbEMsSUFBSSxNQUFNLEVBQUUsQ0FBQzt3QkFDWixNQUFNLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQzt3QkFDaEQsSUFBSSxnQkFBZ0IsRUFBRSxDQUFDOzRCQUN0QixNQUFNLGtCQUFrQixHQUFHLGdCQUFnQixDQUFDLFFBQVEsQ0FBQzs0QkFDckQsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztnQ0FDN0IsS0FBSyxNQUFNLGlCQUFpQixJQUFJLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO29DQUN6RCxJQUFJLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO3dDQUN4RCxTQUFTLGVBQWUsQ0FBQztvQ0FDMUIsQ0FBQztnQ0FDRixDQUFDOzRCQUNGLENBQUM7NEJBQ0QsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUUsQ0FBQztnQ0FDaEMsS0FBSyxNQUFNLG9CQUFvQixJQUFJLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO29DQUMvRCxJQUFJLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO3dDQUMzRCxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxHQUFHLFVBQVUsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQzt3Q0FFdEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzREFBc0QsSUFBSSxXQUFXLG9CQUFvQixxQkFBcUIsSUFBSSxDQUFDLE1BQU0sTUFBTSxVQUFVLENBQUMsUUFBUSxLQUFLLElBQUksR0FBRyxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsdUhBQXVILENBQUMsQ0FBQzt3Q0FFclQsU0FBUyxHQUFHLElBQUksQ0FBQzt3Q0FDakIsT0FBTztvQ0FDUixDQUFDO2dDQUNGLENBQUM7NEJBQ0YsQ0FBQzt3QkFDRixDQUFDO29CQUNGLENBQUM7Z0JBQ0YsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxTQUFTLGFBQWEsQ0FBQyxZQUFvQjtJQUMxQyxNQUFNLFFBQVEsR0FBRyxFQUFFLENBQUMsY0FBYyxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRWxFLE1BQU0sZ0JBQWdCLEdBQXVCLEVBQUUsVUFBVSxFQUFFLGVBQVUsRUFBRSxhQUFhLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBQSxpQkFBWSxFQUFDLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSx5QkFBeUIsRUFBRSxPQUFPLENBQUMsUUFBUSxLQUFLLE9BQU8sRUFBRSxDQUFDO0lBQ3BOLE1BQU0sY0FBYyxHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLElBQUEsY0FBTyxFQUFDLElBQUEsY0FBTyxFQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUUxSSxNQUFNLFlBQVksR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUV6RSxPQUFPLEVBQUUsQ0FBQyxhQUFhLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRSxjQUFjLENBQUMsT0FBTyxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ3pGLENBQUM7QUFFRCxFQUFFO0FBQ0Ysb0NBQW9DO0FBQ3BDLEVBQUU7QUFDRixNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsY0FBYyxDQUFDLENBQUM7QUFFOUMsS0FBSyxNQUFNLFVBQVUsSUFBSSxPQUFPLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQztJQUNuRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRSxDQUFDO1FBQzFCLElBQUksSUFBQSxpQkFBSyxFQUFDLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDMUQsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDaEIsU0FBUyxDQUFDLE9BQU8sRUFBRSxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7WUFDdEMsQ0FBQztZQUVELE1BQU07UUFDUCxDQUFDO0lBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBQ2YsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNqQixDQUFDIn0=