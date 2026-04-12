/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../base/common/event.js';
import { TernarySearchTree } from '../../../../base/common/ternarySearchTree.js';
import { getConfigurationValue, isConfigurationOverrides } from '../../common/configuration.js';
import { Extensions } from '../../common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
export class TestConfigurationService {
    constructor(configuration) {
        this.onDidChangeConfigurationEmitter = new Emitter();
        this.onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;
        this.configurationByRoot = TernarySearchTree.forPaths();
        this.overrideIdentifiers = new Map();
        this.configuration = configuration || Object.create(null);
    }
    reloadConfiguration() {
        return Promise.resolve(this.getValue());
    }
    getValue(arg1, arg2) {
        let configuration;
        const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
        if (overrides) {
            if (overrides.resource) {
                configuration = this.configurationByRoot.findSubstr(overrides.resource.fsPath);
            }
        }
        configuration = configuration ? configuration : this.configuration;
        if (arg1 && typeof arg1 === 'string') {
            return (configuration[arg1] ?? getConfigurationValue(configuration, arg1));
        }
        return configuration;
    }
    updateValue(key, value) {
        return Promise.resolve(undefined);
    }
    setUserConfiguration(key, value, root) {
        if (root) {
            const configForRoot = this.configurationByRoot.get(root.fsPath) || Object.create(null);
            configForRoot[key] = value;
            this.configurationByRoot.set(root.fsPath, configForRoot);
        }
        else {
            this.configuration[key] = value;
        }
        return Promise.resolve(undefined);
    }
    setOverrideIdentifiers(key, identifiers) {
        this.overrideIdentifiers.set(key, identifiers);
    }
    inspect(key, overrides) {
        const value = this.getValue(key, overrides);
        return {
            value,
            defaultValue: undefined,
            userValue: value,
            userLocalValue: value,
            overrideIdentifiers: this.overrideIdentifiers.get(key)
        };
    }
    keys() {
        return {
            default: Object.keys(Registry.as(Extensions.Configuration).getConfigurationProperties()),
            policy: [],
            user: Object.keys(this.configuration),
            workspace: [],
            workspaceFolder: []
        };
    }
    getConfigurationData() {
        return null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWpGLE9BQU8sRUFBRSxxQkFBcUIsRUFBa0csd0JBQXdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoTSxPQUFPLEVBQUUsVUFBVSxFQUEwQixNQUFNLHVDQUF1QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRSxNQUFNLE9BQU8sd0JBQXdCO0lBT3BDLFlBQVksYUFBdUM7UUFIMUMsb0NBQStCLEdBQUcsSUFBSSxPQUFPLEVBQTZCLENBQUM7UUFDM0UsNkJBQXdCLEdBQUcsSUFBSSxDQUFDLCtCQUErQixDQUFDLEtBQUssQ0FBQztRQU12RSx3QkFBbUIsR0FBdUQsaUJBQWlCLENBQUMsUUFBUSxFQUEyQixDQUFDO1FBcUNoSSx3QkFBbUIsR0FBMEIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQXhDOUQsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBSU0sbUJBQW1CO1FBQ3pCLE9BQU8sT0FBTyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFPLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRU0sUUFBUSxDQUFJLElBQXVDLEVBQUUsSUFBOEI7UUFDekYsSUFBSSxhQUFhLENBQUM7UUFDbEIsTUFB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