/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from '../../../../base/common/iterator.js';
import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
export class ConfigurationResolverExpression {
    static { this.VARIABLE_LHS = '${'; }
    constructor(object) {
        this.locations = new Map();
        /**
         * Callbacks when a new replacement is made, so that nested resolutions from
         * `expr.unresolved()` can be fulfilled in the same iteration.
         */
        this.newReplacementNotifiers = new Set();
        // If the input is a string, wrap it in an object so we can use the same logic
        if (typeof object === 'string') {
            this.stringRoot = true;
            // eslint-disable-next-line local/code-no-any-casts
            this.root = { value: object };
        }
        else {
            this.stringRoot = false;
            this.root = structuredClone(object);
        }
    }
    /**
     * Creates a new {@link ConfigurationResolverExpression} from an object.
     * Note that platform-specific keys (i.e. `windows`, `osx`, `linux`) are
     * applied during parsing.
     */
    static parse(object) {
        if (object instanceof ConfigurationResolverExpression) {
            return object;
        }
        const expr = new ConfigurationResolverExpression(object);
        expr.applyPlatformSpecificKeys();
        expr.parseObject(expr.root);
        return expr;
    }
    applyPlatformSpecificKeys() {
        // eslint-disable-next-line local/code-no-any-casts
        const config = this.root; // already cloned by ctor, safe to change
        const key = isWindows ? 'windows' : isMacintosh ? 'osx' : isLinux ? 'linux' : undefined;
        if (key && config && typeof config === 'object' && config.hasOwnProperty(key)) {
            Object.keys(config[key]).forEach(k => config[k] = config[key][k]);
        }
        delete config.windows;
        delete config.osx;
        delete config.linux;
    }
    parseVariable(str, start) {
        if (str[start] !== '$' || str[start + 1] !== '{') {
            return undefined;
        }
        let end = start + 2;
        let braceCount = 1;
        while (end < str.length) {
            if (str[end] === '{') {
                braceCount++;
            }
            else if (str[end] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    break;
                }
            }
            end++;
        }
        if (braceCount !== 0) {
            return undefined;
        }
        const id = str.slice(start, end + 1);
        const inner = str.substring(start + 2, end);
        const colonIdx = inner.indexOf(':');
        if (colonIdx === -1) {
            return { replacement: { id, name: inner, inner }, end };
        }
        return {
            replacement: {
                id,
                inner,
                name: inner.slice(0, colonIdx),
                arg: inner.slice(colonIdx + 1)
            },
            end
        };
    }
    parseObject(obj) {
        if (typeof obj !== 'object' || obj === null) {
            return;
        }
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const value = obj[i];
                if (typeof value === 'string') {
                    this.parseString(obj, i, value);
                }
                else {
                    this.parseObject(value);
                }
            }
            return;
        }
        for (const [key, value] of Object.entries(obj)) {
            this.parseString(obj, key, key, true); // parse key
            if (typeof value === 'string') {
                this.parseString(obj, key, value);
            }
            else {
                this.parseObject(value);
            }
        }
    }
    parseString(object, propertyName, value, replaceKeyName, replacementPath) {
        let pos = 0;
        while (pos < value.length) {
            const match = value.indexOf('${', pos);
            if (match === -1) {
                break;
            }
            const parsed = this.parseVariable(value, match);
            if (parsed) {
                pos = parsed.end + 1;
                if (replacementPath?.includes(parsed.replacement.id)) {
                    continue;
                }
                const locations = this.locations.get(parsed.replacement.id) || { locations: [], replacement: parsed.replacement };
                const newLocation = { object, propertyName, replaceKeyName };
                locations.locations.push(newLocation);
                this.locations.set(parsed.replacement.id, locations);
                if (locations.resolved) {
                    this._resolveAtLocation(parsed.replacement, newLocation, locations.resolved, replacementPath);
                }
                else {
                    this.newReplacementNotifiers.forEach(n => n(parsed.replacement));
                }
            }
            else {
                pos = match + 2;
            }
        }
    }
    *unresolved() {
        const newReplacements = new Map();
        const notifier = (replacement) => {
            newReplacements.set(replacement.id, replacement);
        };
        for (const location of this.locations.values()) {
            if (location.resolved === undefined) {
                newReplacements.set(location.replacement.id, location.replacement);
            }
        }
        this.newReplacementNotifiers.add(notifier);
        while (true) {
            const next = Iterable.first(newReplacements);
            if (!next) {
                break;
            }
            const [key, value] = next;
            yield value;
            newReplacements.delete(key);
        }
        this.newReplacementNotifiers.delete(notifier);
    }
    resolved() {
        return Iterable.map(Iterable.filter(this.locations.values(), l => !!l.resolved), l => [l.replacement, l.resolved]);
    }
    resolve(replacement, data) {
        if (typeof data !== 'object') {
            data = { value: String(data) };
        }
        const location = this.locations.get(replacement.id);
        if (!location) {
            return;
        }
        location.resolved = data;
        if (data.value !== undefined) {
            for (const l of location.locations || Iterable.empty()) {
                this._resolveAtLocation(replacement, l, data);
            }
        }
    }
    _resolveAtLocation(replacement, { replaceKeyName, propertyName, object }, data, path = []) {
        if (data.value === undefined) {
            return;
        }
        // avoid recursive resolution, e.g. ${env:FOO} -> ${env:BAR}=${env:FOO}
        path.push(replacement.id);
        // note: in nested `this.parseString`, parse only the new substring for any replacements, don't reparse the whole string
        if (replaceKeyName && typeof propertyName === 'string') {
            const value = object[propertyName];
            const newKey = propertyName.replaceAll(replacement.id, data.value);
            delete object[propertyName];
            object[newKey] = value;
            this._renameKeyInLocations(object, propertyName, newKey);
            this.parseString(object, newKey, data.value, true, path);
        }
        else {
            object[propertyName] = object[propertyName].replaceAll(replacement.id, data.value);
            this.parseString(object, propertyName, data.value, false, path);
        }
        path.pop();
    }
    _renameKeyInLocations(obj, oldKey, newKey) {
        for (const location of this.locations.values()) {
            for (const loc of location.locations) {
                if (loc.object === obj && loc.propertyName === oldKey) {
                    loc.propertyName = newKey;
                }
            }
        }
    }
    toObject() {
        // If we wrapped a string, unwrap it
        if (this.stringRoot) {
            // eslint-disable-next-line local/code-no-any-casts
            return this.root.value;
        }
        return this.root;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBMER0RixNQUFNLE9BQU8sK0JBQStCO2FBQ3BCLGlCQUFZLEdBQUcsSUFBSSxBQUFQLENBQVE7SUFXM0MsWUFBb0IsTUFBUztRQVRaLGNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBZ0MsQ0FBQztRQUdyRTs7O1dBR0c7UUFDSyw0QkFBdUIsR0FBRyxJQUFJLEdBQUcsRUFBNEIsQ0FBQztRQUdyRSw4RUFBOEU7UUFDOUUsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLEVBQUUsQ0FBQztZQUNoQyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztZQUN2QixtREFBbUQ7WUFDbkQsSUFBSSxDQUFDLElBQUksR0FBRyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQVMsQ0FBQztRQUN0QyxDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3JDLENBQUM7SUFDRixDQUFDO0lBRUQ7Ozs7T0FJRztJQUNJLE1BQU0sQ0FBQyxLQUFLLENBQUksTUFBUztRQUMvQixJQUFJLE1BQU0sWUFBWSwrQkFBK0IsRUFBRSxDQUFDO1lBQ3ZELE9BQU8sTUFBTSxD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