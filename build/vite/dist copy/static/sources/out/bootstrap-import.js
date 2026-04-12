/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// *********************************************************************
// *                                                                   *
// *  We need this to redirect to node_modules from the remote-folder. *
// *  This ONLY applies when running out of source.                   *
// *                                                                   *
// *********************************************************************
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promises } from 'node:fs';
import { join } from 'node:path';
// SEE https://nodejs.org/docs/latest/api/module.html#initialize
const _specifierToUrl = {};
const _specifierToFormat = {};
export async function initialize(injectPath) {
    // populate mappings
    const injectPackageJSONPath = fileURLToPath(new URL('../package.json', pathToFileURL(injectPath)));
    const packageJSON = JSON.parse(String(await promises.readFile(injectPackageJSONPath)));
    for (const [name] of Object.entries(packageJSON.dependencies)) {
        try {
            const path = join(injectPackageJSONPath, `../node_modules/${name}/package.json`);
            const pkgJson = JSON.parse(String(await promises.readFile(path)));
            // Determine the entry point: prefer exports["."].import for ESM, then main.
            // Handle conditional export targets where exports["."].import/default
            // can be a string or an object with a string `default` field.
            // (Added for copilot-sdk)
            let main;
            if (pkgJson.exports?.['.']) {
                const dotExport = pkgJson.exports['.'];
                if (typeof dotExport === 'string') {
                    main = dotExport;
                }
                else if (typeof dotExport === 'object' && dotExport !== null) {
                    const resolveCondition = (v) => {
                        if (typeof v === 'string') {
                            return v;
                        }
                        if (typeof v === 'object' && v !== null) {
                            const d = v.default;
                            if (typeof d === 'string') {
                                return d;
                            }
                        }
                        return undefined;
                    };
                    main = resolveCondition(dotExport.import) ?? resolveCondition(dotExport.default);
                }
            }
            if (typeof main !== 'string') {
                main = typeof pkgJson.main === 'string' ? pkgJson.main : undefined;
            }
            if (!main) {
                main = 'index.js';
            }
            if (!main.endsWith('.js') && !main.endsWith('.mjs') && !main.endsWith('.cjs')) {
                main += '.js';
            }
            const mainPath = join(injectPackageJSONPath, `../node_modules/${name}/${main}`);
            _specifierToUrl[name] = pathToFileURL(mainPath).href;
            // Determine module format: .mjs is always ESM, .cjs always CJS, otherwise check type field
            const isModule = main.endsWith('.mjs')
                ? true
                : main.endsWith('.cjs')
                    ? false
                    : pkgJson.type === 'module';
            _specifierToFormat[name] = isModule ? 'module' : 'commonjs';
        }
        catch (err) {
            console.error(name);
            console.error(err);
        }
    }
    console.log(`[bootstrap-import] Initialized node_modules redirector for: ${injectPath}`);
}
export async function resolve(specifier, context, nextResolve) {
    const newSpecifier = _specifierToUrl[specifier];
    if (newSpecifier !== undefined) {
        return {
            format: _specifierToFormat[specifier] ?? 'commonjs',
            shortCircuit: true,
            url: newSpecifier
        };
    }
    // Defer to the next hook in the chain, which would be the
    // Node.js default resolve if this is the last user-specified loader.
    return nextResolve(specifier, context);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLWltcG9ydC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbImJvb3RzdHJhcC1pbXBvcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsd0VBQXdFO0FBQ3hFLHdFQUF3RTtBQUN4RSx3RUFBd0U7QUFDeEUsdUVBQXVFO0FBQ3ZFLHdFQUF3RTtBQUN4RSx3RUFBd0U7QUFFeEUsT0FBTyxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLFNBQVMsQ0FBQztBQUNuQyxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sV0FBVyxDQUFDO0FBRWpDLGdFQUFnRTtBQUVoRSxNQUFNLGVBQWUsR0FBMkIsRUFBRSxDQUFDO0FBQ25ELE1BQU0sa0JBQWtCLEdBQTJCLEVBQUUsQ0FBQztBQUV0RCxNQUFNLENBQUMsS0FBSyxVQUFVLFVBQVUsQ0FBQyxVQUFrQjtJQUNsRCxvQkFBb0I7SUFFcEIsTUFBTSxxQkFBcUIsR0FBRyxhQUFhLENBQUMsSUFBSSxHQUFHLENBQUMsaUJBQWlCLEVBQUUsYUFBYSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNuRyxNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLFFBQVEsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFdkYsS0FBSyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztRQUMvRCxJQUFJLENBQUM7WUFDSixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMscUJBQXFCLEVBQUUsbUJBQW1CLElBQUksZUFBZSxDQUFDLENBQUM7WUFDakYsTUFBTSxPQUFPLEdB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