/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Extensions as JSONExtensions } from '../../jsonschemas/common/jsonContributionRegistry.js';
import * as platform from '../../registry/common/platform.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../base/common/async.js';
/**
 * Returns the css variable name for the given size identifier. Dots (`.`) are replaced with hyphens (`-`) and
 * everything is prefixed with `--vscode-`.
 *
 * @sample `editor.fontSize` is `--vscode-editor-fontSize`.
 */
export function asCssVariableName(sizeIdent) {
    return `--vscode-${sizeIdent.replace(/\./g, '-')}`;
}
export function asCssVariable(size) {
    return `var(${asCssVariableName(size)})`;
}
export function asCssVariableWithDefault(size, defaultCssValue) {
    return `var(${asCssVariableName(size)}, ${defaultCssValue})`;
}
export function isSizeDefaults(value) {
    return value !== null && typeof value === 'object' && 'light' in value && 'dark' in value;
}
/**
 * Helper function to create a size value
 */
export function size(value, unit = 'px') {
    return { value, unit };
}
/**
 * Helper function to create size defaults that use the same value for all themes
 */
export function sizeForAllThemes(value, unit = 'px') {
    const sizeValue = size(value, unit);
    return {
        light: sizeValue,
        dark: sizeValue,
        hcDark: sizeValue,
        hcLight: sizeValue
    };
}
/**
 * Convert a size value to a CSS string
 */
export function sizeValueToCss(sizeValue) {
    return `${sizeValue.value}${sizeValue.unit}`;
}
// size registry
export const Extensions = {
    SizeContribution: 'base.contributions.sizes'
};
export const DEFAULT_SIZE_CONFIG_VALUE = 'default';
class SizeRegistry extends Disposable {
    constructor() {
        super();
        this._onDidChangeSchema = this._register(new Emitter());
        this.onDidChangeSchema = this._onDidChangeSchema.event;
        this.sizeSchema = { type: 'object', properties: {} };
        this.sizeReferenceSchema = { type: 'string', enum: [], enumDescriptions: [] };
        this.sizesById = {};
    }
    notifyThemeUpdate(theme) {
        for (const key of Object.keys(this.sizesById)) {
            const sizeVal = this.resolveDefaultSize(key, theme);
            if (sizeVal) {
                this.sizeSchema.properties[key].default = sizeValueToCss(sizeVal);
            }
        }
        this._onDidChangeSchema.fire();
    }
    registerSize(id, defaults, description, deprecationMessage) {
        const sizeContribution = { id, description, defaults, deprecationMessage };
        this.sizesById[id] = sizeContribution;
        const propertySchema = {
            type: 'string',
            pattern: '^(\\d+(\\.\\d+)?(px|rem|em|%))|default$',
            patternErrorMessage: 'Size must be a number followed by px, rem, em, or % (e.g., "12px", "1.5rem") or "default"'
        };
        if (deprecationMessage) {
            propertySchema.deprecationMessage = deprecationMessage;
        }
        this.sizeSchema.properties[id] = {
            description,
            ...propertySchema
        };
        this.sizeReferenceSchema.enum.push(id);
        this.sizeReferenceSchema.enumDescriptions.push(description);
        this._onDidChangeSchema.fire();
        return id;
    }
    deregisterSize(id) {
        delete this.sizesById[id];
        delete this.sizeSchema.properties[id];
        const index = this.sizeReferenceSchema.enum.indexOf(id);
        if (index !== -1) {
            this.sizeReferenceSchema.enum.splice(index, 1);
            this.sizeReferenceSchema.enumDescriptions.splice(index, 1);
        }
        this._onDidChangeSchema.fire();
    }
    getSizes() {
        return Object.keys(this.sizesById).map(id => this.sizesById[id]);
    }
    resolveDefaultSize(id, theme) {
        const sizeDesc = this.sizesById[id];
        if (sizeDesc?.defaults) {
            const sizeValue = isSizeDefaults(sizeDesc.defaults) ? sizeDesc.defaults[theme.type] : sizeDesc.defaults;
            return sizeValue ?? undefined;
        }
        return undefined;
    }
    getSizeSchema() {
        return this.sizeSchema;
    }
    getSizeReferenceSchema() {
        return this.sizeReferenceSchema;
    }
    toString() {
        const sorter = (a, b) => {
            const cat1 = a.indexOf('.') === -1 ? 0 : 1;
            const cat2 = b.indexOf('.') === -1 ? 0 : 1;
            if (cat1 !== cat2) {
                return cat1 - cat2;
            }
            return a.localeCompare(b);
        };
        return Object.keys(this.sizesById).sort(sorter).map(k => `- \`${k}\`: ${this.sizesById[k].description}`).join('\n');
    }
}
const sizeRegistry = new SizeRegistry();
platform.Registry.add(Extensions.SizeContribution, sizeRegistry);
export function registerSize(id, defaults, description, deprecationMessage) {
    return sizeRegistry.registerSize(id, defaults, description, deprecationMessage);
}
export function getSizeRegistry() {
    return sizeRegistry;
}
export const workbenchSizesSchemaId = 'vscode://schemas/workbench-sizes';
const schemaRegistry = platform.Registry.as(JSONExtensions.JSONContribution);
schemaRegistry.registerSchema(workbenchSizesSchemaId, sizeRegistry.getSizeSchema());
const delayer = new RunOnceScheduler(() => schemaRegistry.notifySchemaChanged(workbenchSizesSchemaId), 200);
sizeRegistry.onDidChangeSchema(() => {
    if (!delayer.isScheduled()) {
        delayer.schedule();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2l6ZVV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGhlbWUvY29tbW9uL3NpemVVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFFL0QsT0FBTyxFQUE2QixVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDL0gsT0FBTyxLQUFLLFFBQVEsTUFBTSxtQ0FBbUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUEwQmpFOzs7OztHQUtHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFDLFNBQXlCO0lBQzFELE9BQU8sWUFBWSxTQUFTLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQ3BELENBQUM7QUFFRCxNQUFNLFVBQVUsYUFBYSxDQUFDLElBQW9CO0lBQ2pELE9BQU8sT0FBTyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO0FBQzFDLENBQUM7QUFFRCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsSUFBb0IsRUFBRSxlQUF1QjtJQUNyRixPQUFPLE9BQU8saUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQUssZUFBZSxHQUFHLENBQUM7QUFDOUQsQ0FBQztBQVNELE1BQU0sVUFBVSxjQUFjLENBQUMsS0FBYztJQUM1QyxPQUFPLEtBQUssS0FBSyxJQUFJLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLE9BQU8sSUFBSSxLQUFLLElBQUksTUFBTSxJQUFJLEtBQUssQ0FBQztBQUMzRixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsSUFBSSxD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