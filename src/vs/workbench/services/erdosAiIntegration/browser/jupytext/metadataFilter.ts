/**
 * Notebook and cell metadata filtering
 * Converted from src/jupytext/metadata_filter.py
 */

import { _JUPYTEXT_CELL_METADATA, isValidMetadataKey } from './cellMetadata.js';

// Constants (lines 7-21)
export const _DEFAULT_NOTEBOOK_METADATA = [
    // Preserve Jupytext section
    "jupytext",
    // Preserve kernel specs
    "kernelspec", 
    // Kernel_info found in Nteract notebooks
    "kernel_info",
    // Used in MyST notebooks
    "orphan",
    "tocdepth"
].join(",");

export const _JUPYTER_METADATA_NAMESPACE = "jupyter";
export const _DEFAULT_ROOT_LEVEL_METADATA = "-all";

// Type definitions
interface MetadataFilter {
    additional?: string[] | "all";
    excluded?: string[] | "all";
}

// Core functions (lines 24-281)

export function metadataFilterAsDict(metadataConfig: any): MetadataFilter {
    /**
     * Return the metadata filter represented as either None (no filter),
     * or a dictionary with at most two keys: 'additional' and 'excluded',
     * which contain either a list of metadata names, or the string 'all'
     */
    if (metadataConfig === null || metadataConfig === undefined) {
        return {};
    }

    if (metadataConfig === true) {
        return { additional: "all" };
    }

    if (metadataConfig === false) {
        return { excluded: "all" };
    }

    if (typeof metadataConfig === 'object' && !Array.isArray(metadataConfig)) {
        const keys = Object.keys(metadataConfig);
        const validKeys = ["additional", "excluded"];
        if (!keys.every(key => validKeys.includes(key))) {
            throw new Error(`Invalid metadata config keys: ${keys}. Must be subset of ${validKeys}`);
        }
        return metadataConfig as MetadataFilter;
    }

    const metadataKeys = metadataConfig.split(",");
    const config: MetadataFilter = {};

    for (let key of metadataKeys) {
        key = key.trim();
        if (key.startsWith("-")) {
            if (!config.excluded) {
                config.excluded = [];
            }
            if (Array.isArray(config.excluded)) {
                config.excluded.push(key.slice(1).trim());
            }
        } else if (key.startsWith("+")) {
            if (!config.additional) {
                config.additional = [];
            }
            if (Array.isArray(config.additional)) {
                config.additional.push(key.slice(1).trim());
            }
        } else {
            if (!config.additional) {
                config.additional = [];
            }
            if (Array.isArray(config.additional)) {
                config.additional.push(key);
            }
        }
    }

    for (const section of Object.keys(config) as (keyof MetadataFilter)[]) {
        const value = config[section];
        if (Array.isArray(value)) {
            if (value.includes("all")) {
                config[section] = "all";
            } else {
                config[section] = value.filter(k => k);
            }
        }
    }

    return config;
}

export function metadataFilterAsString(metadataFilter: any): string {
    /**
     * Convert a filter, represented as a dictionary with 'additional' and 'excluded' entries, to a string
     */
    if (typeof metadataFilter !== 'object' || metadataFilter === null) {
        return metadataFilter;
    }

    const additional = metadataFilter.additional || [];
    let entries: string[] = [];
    
    if (additional === "all") {
        entries = ["all"];
    } else if (Array.isArray(additional)) {
        entries = additional.filter(key => !_JUPYTEXT_CELL_METADATA.includes(key));
    }

    const excluded = metadataFilter.excluded || [];
    if (excluded === "all") {
        entries.push("-all");
    } else if (Array.isArray(excluded)) {
        entries.push(...excluded.map(e => "-" + e));
    }

    return entries.join(",");
}

export function updateMetadataFilters(
    metadata: Record<string, any>, 
    jupyterMd: Record<string, any>, 
    cellMetadata: Set<string>
): void {
    /**
     * Update or set the notebook and cell metadata filters
     */
    if (!jupyterMd || Object.keys(jupyterMd).length === 0) {
        // Set a metadata filter equal to the current metadata in script
        if (!metadata.jupytext) {
            metadata.jupytext = {};
        }
        metadata.jupytext.notebook_metadata_filter = "-all";
        
        if (!metadata.jupytext.cell_metadata_filter) {
            metadata.jupytext.cell_metadata_filter = metadataFilterAsString({
                additional: Array.from(cellMetadata),
                excluded: "all"
            });
        }
    } else if (metadata.jupytext?.cell_metadata_filter) {
        // Update the existing metadata filter
        let metadataFilter = metadataFilterAsDict(metadata.jupytext.cell_metadata_filter);
        
        if (Array.isArray(metadataFilter.excluded)) {
            metadataFilter.excluded = metadataFilter.excluded.filter(
                key => !cellMetadata.has(key)
            );
        }
        
        if (!metadataFilter.additional) {
            metadataFilter.additional = [];
        }
        
        if (Array.isArray(metadataFilter.additional)) {
            for (const key of cellMetadata) {
                if (!metadataFilter.additional.includes(key)) {
                    metadataFilter.additional.push(key);
                }
            }
        }
        
        if (!metadata.jupytext) {
            metadata.jupytext = {};
        }
        metadata.jupytext.cell_metadata_filter = metadataFilterAsString(metadataFilter);
    } else {
        // Update the notebook metadata filter to include existing entries
        let nbMdFilter = (metadata.jupytext?.notebook_metadata_filter || "").split(",");
        nbMdFilter = nbMdFilter.filter((key: string) => key);
        
        if (nbMdFilter.includes("all") || nbMdFilter.includes("-all")) {
            return;
        }
        
        for (const key of Object.keys(metadata)) {
            if (_DEFAULT_NOTEBOOK_METADATA.split(",").includes(key) ||
                nbMdFilter.includes(key) ||
                nbMdFilter.includes("-" + key)) {
                continue;
            }
            nbMdFilter.push(key);
        }
        
        if (nbMdFilter.length > 0) {
            if (!metadata.jupytext) {
                metadata.jupytext = {};
            }
            metadata.jupytext.notebook_metadata_filter = nbMdFilter.join(",");
        }
    }
}

export function filterMetadata(
    metadata: Record<string, any>,
    userFilter: any,
    defaultFilter: any = "",
    unsupportedKeys?: Set<string>,
    remove: boolean = false
): Record<string, any> {
    /**
     * Filter the cell or notebook metadata, according to the user preference
     */
    const defaultFilterDict = metadataFilterAsDict(defaultFilter) || {};
    const userFilterDict = metadataFilterAsDict(userFilter) || {};

    let defaultExclude = defaultFilterDict.excluded || [];
    let defaultInclude = defaultFilterDict.additional || [];

    if (defaultExclude === "all" && defaultInclude === "all") {
        throw new Error("Cannot have both default exclude and include as 'all'");
    }
    
    if (Array.isArray(defaultInclude) && defaultInclude.length > 0 && 
        Array.isArray(defaultExclude) && defaultExclude.length === 0) {
        defaultFilterDict.excluded = "all";
        defaultExclude = "all";  // Update the local variable too!
    }

    const userExclude = userFilterDict.excluded || [];
    const userInclude = userFilterDict.additional || [];

    // notebook default filter = include only few metadata
    if (defaultExclude === "all") {
        if (userInclude === "all") {
            return subsetMetadata(
                metadata,
                { exclude: userExclude },
                unsupportedKeys
            );
        }
        if (userExclude === "all") {
            return subsetMetadata(
                metadata,
                { keepOnly: userInclude },
                unsupportedKeys
            );
        }
        const keepOnlyList = Array.isArray(defaultInclude) 
            ? [...new Set([
                ...(Array.isArray(userInclude) ? userInclude : []),
                ...defaultInclude
            ])]
            : userInclude;
        return subsetMetadata(
            metadata,
            { 
                keepOnly: keepOnlyList,
                exclude: userExclude 
            },
            unsupportedKeys
        );
    }

    // cell default filter = all metadata but removed ones
    if (userInclude === "all") {
        return subsetMetadata(
            metadata,
            { exclude: userExclude },
            unsupportedKeys
        );
    }
    
    if (userExclude === "all") {
        return subsetMetadata(
            metadata,
            { keepOnly: userInclude },
            unsupportedKeys
        );
    }
    
    // Do not serialize empty tags
    if ("tags" in metadata && Array.isArray(metadata.tags) && metadata.tags.length === 0) {
        metadata = { ...metadata };
        delete metadata.tags;
    }
    
    const excludeSet = new Set([
        ...(Array.isArray(userExclude) ? userExclude : []),
        ...(Array.isArray(defaultExclude) ? defaultExclude.filter(
            key => !Array.isArray(userInclude) || !userInclude.includes(key)
        ) : [])
    ]);
    
    return subsetMetadata(
        metadata,
        { exclude: Array.from(excludeSet) },
        unsupportedKeys
    );
}

function secondLevel(keys: string[]): Record<string, string[]> {
    /**
     * Return a dictionary with the nested keys, e.g. returns {'I':['a', 'b']} when keys=['I.a', 'I.b']
     */
    const subKeys: Record<string, string[]> = {};
    for (const key of keys) {
        if (key.includes(".")) {
            const [left, right] = key.split(".", 2);
            if (!subKeys[left]) {
                subKeys[left] = [];
            }
            subKeys[left].push(right);
        }
    }
    return subKeys;
}

function suppressUnsupportedKeys(
    metadata: Record<string, any>, 
    unsupportedKeys?: Set<string>
): string[] {
    if (unsupportedKeys) {
        for (const key of Object.keys(metadata)) {
            if (!isValidMetadataKey(key)) {
                unsupportedKeys.add(key);
            }
        }
    }
    return Object.keys(metadata).filter(key => isValidMetadataKey(key));
}

interface SubsetOptions {
    keepOnly?: string[] | "all";
    exclude?: string[] | "all";
    remove?: boolean;
}

function subsetMetadata(
    metadata: Record<string, any>,
    options: SubsetOptions = {},
    unsupportedKeys?: Set<string>
): Record<string, any> {
    /**
     * Filter the metadata
     */
    const { keepOnly, exclude, remove = false } = options;
    
    const supportedKeys = suppressUnsupportedKeys(metadata, unsupportedKeys);
    let include: string[];
    let filteredMetadata: Record<string, any>;

    if (keepOnly !== undefined) {
        if (keepOnly === "all") {
            include = supportedKeys;
            filteredMetadata = Object.fromEntries(
                supportedKeys.map(key => [key, metadata[key]])
            );
        } else {
            include = supportedKeys.filter(key => keepOnly.includes(key));
            filteredMetadata = Object.fromEntries(
                include.map(key => [key, metadata[key]])
            );
            
            const subKeepOnly = secondLevel(keepOnly);
            const keys = supportedKeys.filter(key => key in subKeepOnly);
            for (const key of keys) {
                filteredMetadata[key] = subsetMetadata(
                    metadata[key],
                    { keepOnly: subKeepOnly[key] },
                    unsupportedKeys
                );
            }
        }
    } else {
        include = supportedKeys;
        filteredMetadata = Object.fromEntries(
            supportedKeys.map(key => [key, metadata[key]])
        );
    }

    if (exclude !== undefined) {
        const excludeArray = exclude === "all" ? Object.keys(filteredMetadata) : exclude;
        for (const key of excludeArray) {
            if (key in filteredMetadata) {
                delete filteredMetadata[key];
            }
        }
        
        if (exclude !== "all") {
            const subExclude = secondLevel(exclude);
            for (const key of Object.keys(subExclude)) {
                if (key in filteredMetadata) {
                    filteredMetadata[key] = subsetMetadata(
                        filteredMetadata[key],
                        { exclude: subExclude[key] },
                        unsupportedKeys
                    );
                }
            }
        }
    }

    if (remove) {
        const excludeSet = new Set(exclude === "all" ? [] : exclude || []);
        for (const key of new Set(include).difference(excludeSet)) {
            delete metadata[key];
        }
    }

    return filteredMetadata;
}

export function restoreFilteredMetadata(
    filteredMetadata: Record<string, any>,
    unfilteredMetadata: Record<string, any>,
    userFilter: any,
    defaultFilter: any
): Record<string, any> {
    /**
     * Update the filtered metadata with the part of the unfiltered one that matches the filter
     */
    const filteredUnfilteredMetadata = filterMetadata(
        unfilteredMetadata, userFilter, defaultFilter
    );

    const metadata = { ...filteredMetadata };
    for (const key of Object.keys(unfilteredMetadata)) {
        if (!(key in filteredUnfilteredMetadata)) {
            // We don't want to restore the line_to_next_cell metadata from the ipynb file, see #761
            if (!_JUPYTEXT_CELL_METADATA.includes(key)) {
                metadata[key] = unfilteredMetadata[key];
            }
        }
    }

    return metadata;
}

// Polyfill for Set.prototype.difference (not available in all environments)
if (!Set.prototype.difference) {
    Set.prototype.difference = function<T>(this: Set<T>, other: Set<T>): Set<T> {
        const result = new Set<T>();
        for (const item of this) {
            if (!other.has(item)) {
                result.add(item);
            }
        }
        return result;
    };
}

declare global {
    interface Set<T> {
        difference(other: Set<T>): Set<T>;
    }
}
