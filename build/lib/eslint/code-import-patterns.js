"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require("path");
const minimatch = require("minimatch");
const utils_1 = require("./utils");
const REPO_ROOT = path.normalize(path.join(__dirname, '../../../'));
/**
 * Returns the filename relative to the project root and using `/` as separators
 */
function getRelativeFilename(context) {
    const filename = path.normalize(context.getFilename());
    return filename.substring(REPO_ROOT.length).replace(/\\/g, '/');
}
module.exports = new class {
    constructor() {
        this.meta = {
            messages: {
                badImport: 'Imports violates \'{{restrictions}}\' restrictions. See https://github.com/microsoft/vscode/wiki/Source-Code-Organization',
                badFilename: 'Missing definition in `code-import-patterns` for this file. Define rules at https://github.com/microsoft/vscode/blob/main/.eslintrc.json'
            },
            docs: {
                url: 'https://github.com/microsoft/vscode/wiki/Source-Code-Organization'
            }
        };
        this._optionsCache = new WeakMap();
    }
    create(context) {
        const options = context.options;
        const { configs, warnings } = this._processOptions(options);
        const relativeFilename = getRelativeFilename(context);
        if (warnings.length > 0) {
            // configuration warnings
            context.report({
                loc: { line: 1, column: 0 },
                message: warnings.join('\n')
            });
            return {};
        }
        for (const config of configs) {
            if (minimatch(relativeFilename, config.target)) {
                return (0, utils_1.createImportRuleListener)((node, value) => this._checkImport(context, config, node, value));
            }
        }
        context.report({
            loc: { line: 1, column: 0 },
            messageId: 'badFilename'
        });
        return {};
    }
    _processOptions(options) {
        if (this._optionsCache.has(options)) {
            return this._optionsCache.get(options);
        }
        const configs = [];
        const warnings = [];
        for (const option of options) {
            const target = option.target;
            const restrictions = (typeof option.restrictions === 'string' ? [option.restrictions] : option.restrictions.slice(0));
            if (/^src\/vs\/.*\/\*\*/.test(target)) {
                const amdTarget = target.substring('src/'.length);
                // Allow importing itself
                if (restrictions.includes(amdTarget)) {
                    warnings.push(`target ${target}: '${amdTarget}' is automatically included in restrictions.`);
                }
                restrictions.push(amdTarget);
            }
            configs.push({ target, restrictions });
        }
        const result = { configs, warnings };
        this._optionsCache.set(options, result);
        return result;
    }
    _checkImport(context, config, node, importPath) {
        // resolve relative paths
        if (importPath[0] === '.') {
            const relativeFilename = getRelativeFilename(context);
            importPath = path.join(path.dirname(relativeFilename), importPath);
            if (/^src\/vs\//.test(importPath)) {
                // resolve using AMD base url
                importPath = importPath.substring('src/'.length);
            }
        }
        const restrictions = config.restrictions;
        let matched = false;
        for (const pattern of restrictions) {
            if (minimatch(importPath, pattern)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            // None of the restrictions matched
            context.report({
                loc: node.loc,
                messageId: 'badImport',
                data: {
                    restrictions: restrictions.join(' or ')
                }
            });
        }
    }
};
