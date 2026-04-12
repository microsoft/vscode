/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWindows } from '../../../base/common/platform.js';
import { EnvironmentVariableMutatorType } from './environmentVariable.js';
const mutatorTypeToLabelMap = new Map([
    [EnvironmentVariableMutatorType.Append, 'APPEND'],
    [EnvironmentVariableMutatorType.Prepend, 'PREPEND'],
    [EnvironmentVariableMutatorType.Replace, 'REPLACE']
]);
const PYTHON_ACTIVATION_VARS_PATTERN = /^VSCODE_PYTHON_(PWSH|ZSH|BASH|FISH)_ACTIVATE/;
const PYTHON_ENV_EXTENSION_ID = 'ms-python.vscode-python-envs';
export class MergedEnvironmentVariableCollection {
    constructor(collections) {
        this.collections = collections;
        this.map = new Map();
        this.descriptionMap = new Map();
        collections.forEach((collection, extensionIdentifier) => {
            this.populateDescriptionMap(collection, extensionIdentifier);
            const it = collection.map.entries();
            let next = it.next();
            while (!next.done) {
                const mutator = next.value[1];
                const key = next.value[0];
                if (this.blockPythonActivationVar(key, extensionIdentifier)) {
                    next = it.next();
                    continue;
                }
                let entry = this.map.get(key);
                if (!entry) {
                    entry = [];
                    this.map.set(key, entry);
                }
                // If the first item in the entry is replace ignore any other entries as they would
                // just get replaced by this one.
                if (entry.length > 0 && entry[0].type === EnvironmentVariableMutatorType.Replace) {
                    next = it.next();
                    continue;
                }
                const extensionMutator = {
                    extensionIdentifier,
                    value: mutator.value,
                    type: mutator.type,
                    scope: mutator.scope,
                    variable: mutator.variable,
                    options: mutator.options
                };
                if (!extensionMutator.scope) {
                    delete extensionMutator.scope; // Convenient for tests
                }
                // Mutators get applied in the reverse order than they are created
                entry.unshift(extensionMutator);
                next = it.next();
            }
        });
    }
    async applyToProcessEnvironment(env, scope, variableResolver) {
        let lowerToActualVariableNames;
        if (isWindows) {
            lowerToActualVariableNames = {};
            Object.keys(env).forEach(e => lowerToActualVariableNames[e.toLowerCase()] = e);
        }
        for (const [variable, mutators] of this.getVariableMap(scope)) {
            const actualVariable = isWindows ? lowerToActualVariableNames[variable.toLowerCase()] || variable : variable;
            for (const mutator of mutators) {
                const value = variableResolver ? await variableResolver(mutator.value) : mutator.value;
                if (this.blockPythonActivationVar(mutator.variable, mutator.extensionIdentifier)) {
                    continue;
                }
                // Default: true
                if (mutator.options?.applyAtProcessCreation ?? true) {
                    switch (mutator.type) {
                        case EnvironmentVariableMutatorType.Append:
                            env[actualVariable] = (env[actualVariable] || '') + value;
                            break;
                        case EnvironmentVariableMutatorType.Prepend:
                            env[actualVariable] = value + (env[actualVariable] || '');
                            break;
                        case EnvironmentVariableMutatorType.Replace:
                            env[actualVariable] = value;
                            break;
                    }
                }
                // Default: false
                if (mutator.options?.applyAtShellIntegration ?? false) {
                    const key = `VSCODE_ENV_${mutatorTypeToLabelMap.get(mutator.type)}`;
                    env[key] = (env[key] ? env[key] + ':' : '') + variable + '=' + this._encodeColons(value);
                }
            }
        }
    }
    _encodeColons(value) {
        return value.replaceAll(':', '\\x3a');
    }
    blockPythonActivationVar(variable, extensionIdentifier) {
        // Only Python env extension can modify Python activate env var.
        if (PYTHON_ACTIVATION_VARS_PATTERN.test(variable) && PYTHON_ENV_EXTENSION_ID !== extensionIdentifier) {
            return true;
        }
        return false;
    }
    diff(other, scope) {
        const added = new Map();
        const changed = new Map();
        const removed = new Map();
        // Find added
        other.getVariableMap(scope).forEach((otherMutators, variable) => {
            const currentMutators = this.getVariableMap(scope).get(variable);
            const result = getMissingMutatorsFromArray(otherMutators, currentMutators);
            if (result) {
                added.set(variable, result);
            }
        });
        // Find removed
        this.getVariableMap(scope).forEach((currentMutators, variable) => {
            const otherMutators = other.getVariableMap(scope).get(variable);
            const result = getMissingMutatorsFromArray(currentMutators, otherMutators);
            if (result) {
                removed.set(variable, result);
            }
        });
        // Find changed
        this.getVariableMap(scope).forEach((currentMutators, variable) => {
            const otherMutators = other.getVariableMap(scope).get(variable);
            const result = getChangedMutatorsFromArray(currentMutators, otherMutators);
            if (result) {
                changed.set(variable, result);
            }
        });
        if (added.size === 0 && changed.size === 0 && removed.size === 0) {
            return undefined;
        }
        return { added, changed, removed };
    }
    getVariableMap(scope) {
        const result = new Map();
        for (const mutators of this.map.values()) {
            const filteredMutators = mutators.filter(m => filterScope(m, scope));
            if (filteredMutators.length > 0) {
                // All of these mutators are for the same variable because they are in the same scope, hence choose anyone to form a key.
                result.set(filteredMutators[0].variable, filteredMutators);
            }
        }
        return result;
    }
    getDescriptionMap(scope) {
        const result = new Map();
        for (const mutators of this.descriptionMap.values()) {
            const filteredMutators = mutators.filter(m => filterScope(m, scope, true));
            for (const mutator of filteredMutators) {
                result.set(mutator.extensionIdentifier, mutator.description);
            }
        }
        return result;
    }
    populateDescriptionMap(collection, extensionIdentifier) {
        if (!collection.descriptionMap) {
            return;
        }
        const it = collection.descriptionMap.entries();
        let next = it.next();
        while (!next.done) {
            const mutator = next.value[1];
            const key = next.value[0];
            let entry = this.descriptionMap.get(key);
            if (!entry) {
                entry = [];
                this.descriptionMap.set(key, entry);
            }
            const extensionMutator = {
                extensionIdentifier,
                scope: mutator.scope,
                description: mutator.description
            };
            if (!extensionMutator.scope) {
                delete extensionMutator.scope; // Convenient for tests
            }
            entry.push(extensionMutator);
            next = it.next();
        }
    }
}
/**
 * Returns whether a mutator matches with the scope provided.
 * @param mutator Mutator to filter
 * @param scope Scope to be used for querying
 * @param strictFilter If true, mutators with global scope is not returned when querying for workspace scope.
 * i.e whether mutator scope should always exactly match with query scope.
 */
function filterScope(mutator, scope, strictFilter = false) {
    if (!mutator.scope) {
        if (strictFilter) {
            return scope === mutator.scope;
        }
        return true;
    }
    // If a mutator is scoped to a workspace folder, only apply it if the workspace
    // folder matches.
    if (mutator.scope.workspaceFolder && scope?.workspaceFolder && mutator.scope.workspaceFolder.index === scope.workspaceFolder.index) {
        return true;
    }
    return false;
}
function getMissingMutatorsFromArray(current, other) {
    // If it doesn't exist, all are removed
    if (!other) {
        return current;
    }
    // Create a map to help
    const otherMutatorExtensions = new Set();
    other.forEach(m => otherMutatorExtensions.add(m.extensionIdentifier));
    // Find entries removed from other
    const result = [];
    current.forEach(mutator => {
        if (!otherMutatorExtensions.has(mutator.extensionIdentifier)) {
            result.push(mutator);
        }
    });
    return result.length === 0 ? undefined : result;
}
function getChangedMutatorsFromArray(current, other) {
    // If it doesn't exist, none are changed (they are removed)
    if (!other) {
        return undefined;
    }
    // Create a map to help
    const otherMutatorExtensions = new Map();
    other.forEach(m => otherMutatorExtensions.set(m.extensionIdentifier, m));
    // Find entries that exist in both but are not equal
    const result = [];
    current.forEach(mutator => {
        const otherMutator = otherMutatorExtensions.get(mutator.extensionIdentifier);
        if (otherMutator && (mutator.type !== otherMutator.type || mutator.value !== otherMutator.value || mutator.scope?.workspaceFolder?.index !== otherMutator.scope?.workspaceFolder?.index)) {
            // Return the new result, not the old one
            result.push(otherMutator);
        }
    });
    return result.length === 0 ? undefined : result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUF1QixTQUFTLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRixPQUFPLEVBQUUsOEJBQThCLEVBQXFPLE1BQU0sMEJBQTBCLENBQUM7QUFJN1MsTUFBTSxxQkFBcUIsR0FBZ0QsSUFBSSxHQUFHLENBQUM7SUFDbEYsQ0FBQyw4QkFBOEIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDO0lBQ2pELENBQUMsOEJBQThCLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQztJQUNuRCxDQUFDLDhCQUE4QixDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUM7Q0FDbkQsQ0FBQyxDQUFDO0FBQ0gsTUFBTSw4QkFBOEIsR0FBRyw4Q0FBOEMsQ0FBQztBQUN0RixNQUFNLHVCQUF1QixHQUFHLDhCQUE4QixDQUFDO0FBRS9ELE1BQU0sT0FBTyxtQ0FBbUM7SUFJL0MsWUFDVSxXQUFnRTtRQUFoRSxnQkFBVyxHQUFYLFdBQVcsQ0FBcUQ7UUFKekQsUUFBRyxHQUE2RCxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzFFLG1CQUFjLEdBQWdFLElBQUksR0FBRyxFQUFFLENBQUM7UUFLeEcsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxtQkFBbUIsRUFBRSxFQUFFO1lBQ3ZELElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxVQUFVLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztZQUM3RCxNQUFNLEVBQUUsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3BDLElBQUksSUFBSSxHQUFHLEVB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