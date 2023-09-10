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
    'require',
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
            'lib.dom.d.ts',
            '@types/node' // no node.js
        ]
    },
    // Common: vs/platform/environment/common/*
    {
        target: '**/vs/platform/environment/common/*.ts',
        allowedTypes: CORE_TYPES,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
        disallowedDefinitions: [
            'lib.dom.d.ts',
            '@types/node' // no node.js
        ]
    },
    // Common: vs/platform/window/common/window.ts
    {
        target: '**/vs/platform/window/common/window.ts',
        allowedTypes: CORE_TYPES,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
        disallowedDefinitions: [
            'lib.dom.d.ts',
            '@types/node' // no node.js
        ]
    },
    // Common: vs/platform/native/common/native.ts
    {
        target: '**/vs/platform/native/common/native.ts',
        allowedTypes: CORE_TYPES,
        disallowedTypes: [ /* Ignore native types that are defined from here */],
        disallowedDefinitions: [
            'lib.dom.d.ts',
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
            'lib.dom.d.ts',
            '@types/node' // no node.js
        ]
    },
    // Common
    {
        target: '**/vs/**/common/**',
        allowedTypes: CORE_TYPES,
        disallowedTypes: NATIVE_TYPES,
        disallowedDefinitions: [
            'lib.dom.d.ts',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5ZXJzQ2hlY2tlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImxheWVyc0NoZWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHOztBQUVoRyxpQ0FBaUM7QUFDakMsMkJBQThDO0FBQzlDLCtCQUE4QztBQUM5Qyx5Q0FBa0M7QUFFbEMsRUFBRTtBQUNGLGdHQUFnRztBQUNoRyxFQUFFO0FBQ0YsK0ZBQStGO0FBQy9GLG1EQUFtRDtBQUNuRCw0RUFBNEU7QUFDNUUsaUVBQWlFO0FBQ2pFLEVBQUU7QUFDRixnR0FBZ0c7QUFDaEcsRUFBRTtBQUNGLGdHQUFnRztBQUNoRyxFQUFFO0FBRUYsbUZBQW1GO0FBQ25GLHdGQUF3RjtBQUN4RixNQUFNLFVBQVUsR0FBRztJQUNsQixTQUFTO0lBQ1QsWUFBWTtJQUNaLGNBQWM7SUFDZCxhQUFhO0lBQ2IsZUFBZTtJQUNmLFNBQVM7SUFDVCxTQUFTO0lBQ1QsT0FBTztJQUNQLGtCQUFrQjtJQUNsQixRQUFRO0lBQ1IsYUFBYTtJQUNiLGFBQWE7SUFDYixNQUFNO0lBQ04sZ0JBQWdCO0lBQ2hCLE9BQU87SUFDUCxZQUFZO0lBQ1osYUFBYTtJQUNiLGFBQWE7SUFDYixXQUFXO0lBQ1gsWUFBWTtJQUNaLFlBQVk7SUFDWixjQUFjO0lBQ2QsY0FBYztJQUNkLG1CQUFtQjtJQUNuQixnQkFBZ0I7SUFDaEIsZUFBZTtJQUNmLE1BQU07SUFDTixNQUFNO0lBQ04saUJBQWlCO0lBQ2pCLGFBQWE7SUFDYixnQkFBZ0I7SUFDaEIsYUFBYTtJQUNiLEtBQUs7SUFDTCxpQkFBaUI7SUFDakIsZUFBZTtJQUNmLE9BQU87SUFDUCxhQUFhO0lBQ2Isa0JBQWtCO0lBQ2xCLGFBQWE7SUFDYixNQUFNO0NBQ04sQ0FBQztBQUVGLG9FQUFvRTtBQUNwRSxvRUFBb0U7QUFDcEUsTUFBTSxZQUFZLEdBQUc7SUFDcEIsa0JBQWtCO0lBQ2xCLDJCQUEyQjtJQUMzQixrQ0FBa0M7SUFDbEMsNEJBQTRCO0lBQzVCLDBCQUEwQjtJQUMxQixvQkFBb0I7SUFDcEIscUJBQXFCO0NBQ3JCLENBQUM7QUFFRixNQUFNLEtBQUssR0FBWTtJQUV0QixjQUFjO0lBQ2Q7UUFDQyxNQUFNLEVBQUUsa0JBQWtCO1FBQzFCLElBQUksRUFBRSxJQUFJLENBQUMseUJBQXlCO0tBQ3BDO0lBRUQscUNBQXFDO0lBQ3JDO1FBQ0MsTUFBTSxFQUFFLCtCQUErQjtRQUN2QyxZQUFZLEVBQUU7WUFDYixHQUFHLFVBQVU7WUFFYiwyQ0FBMkM7WUFDM0MsY0FBYztTQUNkO1FBQ0QsZUFBZSxFQUFFLFlBQVk7UUFDN0IscUJBQXFCLEVBQUU7WUFDdEIsY0FBYztZQUNkLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCwyQ0FBMkM7SUFDM0M7UUFDQyxNQUFNLEVBQUUsd0NBQXdDO1FBQ2hELFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxFQUFDLG9EQUFvRCxDQUFDO1FBQ3ZFLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWM7WUFDZCxhQUFhLENBQUMsYUFBYTtTQUMzQjtLQUNEO0lBRUQsOENBQThDO0lBQzlDO1FBQ0MsTUFBTSxFQUFFLHdDQUF3QztRQUNoRCxZQUFZLEVBQUUsVUFBVTtRQUN4QixlQUFlLEVBQUUsRUFBQyxvREFBb0QsQ0FBQztRQUN2RSxxQkFBcUIsRUFBRTtZQUN0QixjQUFjO1lBQ2QsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELDhDQUE4QztJQUM5QztRQUNDLE1BQU0sRUFBRSx3Q0FBd0M7UUFDaEQsWUFBWSxFQUFFLFVBQVU7UUFDeEIsZUFBZSxFQUFFLEVBQUMsb0RBQW9ELENBQUM7UUFDdkUscUJBQXFCLEVBQUU7WUFDdEIsY0FBYztZQUNkLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCw2REFBNkQ7SUFDN0Q7UUFDQyxNQUFNLEVBQUUsdURBQXVEO1FBQy9ELFlBQVksRUFBRTtZQUNiLEdBQUcsVUFBVTtZQUViLHdCQUF3QjtZQUN4QixRQUFRO1NBQ1I7UUFDRCxlQUFlLEVBQUUsWUFBWTtRQUM3QixxQkFBcUIsRUFBRTtZQUN0QixjQUFjO1lBQ2QsYUFBYSxDQUFDLGFBQWE7U0FDM0I7S0FDRDtJQUVELFNBQVM7SUFDVDtRQUNDLE1BQU0sRUFBRSxvQkFBb0I7UUFDNUIsWUFBWSxFQUFFLFVBQVU7UUFDeEIsZUFBZSxFQUFFLFlBQVk7UUFDN0IscUJBQXFCLEVBQUU7WUFDdEIsY0FBYztZQUNkLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxVQUFVO0lBQ1Y7UUFDQyxNQUFNLEVBQUUscUJBQXFCO1FBQzdCLFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxZQUFZO1FBQzdCLGtCQUFrQixFQUFFO1lBQ25CLG1DQUFtQyxDQUFDLHNGQUFzRjtTQUMxSDtRQUNELHFCQUFxQixFQUFFO1lBQ3RCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCwyQkFBMkI7SUFDM0I7UUFDQyxNQUFNLEVBQUUsNkJBQTZCO1FBQ3JDLFlBQVksRUFBRSxVQUFVO1FBQ3hCLGVBQWUsRUFBRSxZQUFZO1FBQzdCLHFCQUFxQixFQUFFO1lBQ3RCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxVQUFVO0lBQ1Y7UUFDQyxNQUFNLEVBQUUsa0JBQWtCO1FBQzFCLFlBQVksRUFBRSxVQUFVO1FBQ3hCLHFCQUFxQixFQUFFO1lBQ3RCLGNBQWMsQ0FBQyxTQUFTO1NBQ3hCO0tBQ0Q7SUFFRCxxQkFBcUI7SUFDckI7UUFDQyxNQUFNLEVBQUUsOEJBQThCO1FBQ3RDLFlBQVksRUFBRSxVQUFVO1FBQ3hCLHFCQUFxQixFQUFFO1lBQ3RCLGFBQWEsQ0FBQyxhQUFhO1NBQzNCO0tBQ0Q7SUFFRCxrQkFBa0I7SUFDbEI7UUFDQyxNQUFNLEVBQUUsMkJBQTJCO1FBQ25DLFlBQVksRUFBRTtZQUNiLEdBQUcsVUFBVTtZQUViLGdFQUFnRTtZQUNoRSxPQUFPO1lBQ1AsU0FBUztTQUNUO1FBQ0QsZUFBZSxFQUFFO1lBQ2hCLFNBQVMsQ0FBQyw0Q0FBNEM7U0FDdEQ7UUFDRCxxQkFBcUIsRUFBRTtZQUN0QixjQUFjLENBQUMsU0FBUztTQUN4QjtLQUNEO0NBQ0QsQ0FBQztBQUVGLE1BQU0sY0FBYyxHQUFHLElBQUEsV0FBSSxFQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLGVBQWUsQ0FBQyxDQUFDO0FBV3pFLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztBQUV0QixTQUFTLFNBQVMsQ0FBQyxPQUFtQixFQUFFLFVBQXlCLEVBQUUsSUFBVztJQUM3RSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7SUFFdEIsU0FBUyxTQUFTLENBQUMsSUFBYTtRQUMvQixJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLEVBQUU7WUFDM0MsT0FBTyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLGVBQWU7U0FDeEQ7UUFFRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDekMsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRWpELElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDWixPQUFPO1NBQ1A7UUFFRCxJQUFJLGFBQWEsR0FBUSxNQUFNLENBQUM7UUFFaEMsT0FBTyxhQUFhLENBQUMsTUFBTSxFQUFFO1lBQzVCLGFBQWEsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1NBQ3JDO1FBRUQsTUFBTSxZQUFZLEdBQUcsYUFBMEIsQ0FBQztRQUNoRCxNQUFNLElBQUksR0FBRyxZQUFZLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFcEMsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sS0FBSyxJQUFJLENBQUMsRUFBRTtZQUN6RCxPQUFPLENBQUMsV0FBVztTQUNuQjtRQUVELElBQUksSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDLEVBQUU7WUFDbEUsTUFBTSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxVQUFVLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDdEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxvREFBb0QsSUFBSSxxQkFBcUIsSUFBSSxDQUFDLE1BQU0sTUFBTSxVQUFVLENBQUMsUUFBUSxLQUFLLElBQUksR0FBRyxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsd0hBQXdILENBQUMsQ0FBQztZQUVyUixTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ2pCLE9BQU87U0FDUDtRQUVELE1BQU0sWUFBWSxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUM7UUFDekMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQ2hDLGVBQWUsRUFBRSxLQUFLLE1BQU0sV0FBVyxJQUFJLFlBQVksRUFBRTtnQkFDeEQsSUFBSSxXQUFXLEVBQUU7b0JBQ2hCLE1BQU0sTUFBTSxHQUFHLFdBQVcsQ0FBQyxNQUFNLENBQUM7b0JBQ2xDLElBQUksTUFBTSxFQUFFO3dCQUNYLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO3dCQUNoRCxJQUFJLGdCQUFnQixFQUFFOzRCQUNyQixNQUFNLGtCQUFrQixHQUFHLGdCQUFnQixDQUFDLFFBQVEsQ0FBQzs0QkFDckQsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUU7Z0NBQzVCLEtBQUssTUFBTSxpQkFBaUIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUU7b0NBQ3hELElBQUksa0JBQWtCLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFO3dDQUN2RCxTQUFTLGVBQWUsQ0FBQztxQ0FDekI7aUNBQ0Q7NkJBQ0Q7NEJBQ0QsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUU7Z0NBQy9CLEtBQUssTUFBTSxvQkFBb0IsSUFBSSxJQUFJLENBQUMscUJBQXFCLEVBQUU7b0NBQzlELElBQUksa0JBQWtCLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFO3dDQUMxRCxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxHQUFHLFVBQVUsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQzt3Q0FFdEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzREFBc0QsSUFBSSxXQUFXLG9CQUFvQixxQkFBcUIsSUFBSSxDQUFDLE1BQU0sTUFBTSxVQUFVLENBQUMsUUFBUSxLQUFLLElBQUksR0FBRyxDQUFDLElBQUksU0FBUyxHQUFHLENBQUMsdUhBQXVILENBQUMsQ0FBQzt3Q0FFclQsU0FBUyxHQUFHLElBQUksQ0FBQzt3Q0FDakIsT0FBTztxQ0FDUDtpQ0FDRDs2QkFDRDt5QkFDRDtxQkFDRDtpQkFDRDthQUNEO1NBQ0Q7SUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLFlBQW9CO0lBQzFDLE1BQU0sUUFBUSxHQUFHLEVBQUUsQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFbEUsTUFBTSxnQkFBZ0IsR0FBdUIsRUFBRSxVQUFVLEVBQUUsZUFBVSxFQUFFLGFBQWEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFBLGlCQUFZLEVBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFLHlCQUF5QixFQUFFLE9BQU8sQ0FBQyxRQUFRLEtBQUssT0FBTyxFQUFFLENBQUM7SUFDcE4sTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLEVBQUUsSUFBQSxjQUFPLEVBQUMsSUFBQSxjQUFPLEVBQUMsWUFBWSxDQUFDLENBQUMsRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBRTFJLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRXpFLE9BQU8sRUFBRSxDQUFDLGFBQWEsQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFLGNBQWMsQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDekYsQ0FBQztBQUVELEVBQUU7QUFDRixvQ0FBb0M7QUFDcEMsRUFBRTtBQUNGLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUU5QyxLQUFLLE1BQU0sVUFBVSxJQUFJLE9BQU8sQ0FBQyxjQUFjLEVBQUUsRUFBRTtJQUNsRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRTtRQUN6QixJQUFJLElBQUEsaUJBQUssRUFBQyxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUN6RCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDZixTQUFTLENBQUMsT0FBTyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQzthQUNyQztZQUVELE1BQU07U0FDTjtLQUNEO0NBQ0Q7QUFFRCxJQUFJLFNBQVMsRUFBRTtJQUNkLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Q0FDaEIifQ==