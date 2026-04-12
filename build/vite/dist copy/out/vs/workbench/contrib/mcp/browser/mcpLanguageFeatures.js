/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { computeLevenshteinDistance } from '../../../../base/common/diff/diff.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createMarkdownCommandLink, MarkdownString } from '../../../../base/common/htmlContent.js';
import { findNodeAtLocation, parseTree } from '../../../../base/common/json.js';
import { Disposable, DisposableStore, dispose, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { Range } from '../../../../editor/common/core/range.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { localize } from '../../../../nls.js';
import { IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { mcpConfigurationSection } from '../common/mcpConfiguration.js';
import { IMcpRegistry } from '../common/mcpRegistryTypes.js';
import { IMcpService, IMcpWorkbenchService } from '../common/mcpTypes.js';
const diagnosticOwner = 'vscode.mcp';
let McpLanguageFeatures = class McpLanguageFeatures extends Disposable {
    constructor(languageFeaturesService, _mcpRegistry, _mcpWorkbenchService, _mcpService, _markerService, _configurationResolverService) {
        super();
        this._mcpRegistry = _mcpRegistry;
        this._mcpWorkbenchService = _mcpWorkbenchService;
        this._mcpService = _mcpService;
        this._markerService = _markerService;
        this._configurationResolverService = _configurationResolverService;
        this._cachedMcpSection = this._register(new MutableDisposable());
        const patterns = [
            { pattern: '**/mcp.json' },
            { pattern: '**/workspace.json' },
        ];
        const onDidChangeCodeLens = this._register(new Emitter());
        const codeLensProvider = {
            onDidChange: onDidChangeCodeLens.event,
            provideCodeLenses: (model, range) => this._provideCodeLenses(model, () => onDidChangeCodeLens.fire(codeLensProvider)),
        };
        this._register(languageFeaturesService.codeLensProvider.register(patterns, codeLensProvider));
        this._register(languageFeaturesService.inlayHintsProvider.register(patterns, {
            onDidChangeInlayHints: _mcpRegistry.onDidChangeInputs,
            provideInlayHints: (model, range) => this._provideInlayHints(model, range),
        }));
    }
    /** Simple mechanism to avoid extra json parsing for hints+lenses */
    async _parseModel(model) {
        if (this._cachedMcpSection.value?.model === model) {
            return this._cachedMcpSection.value;
        }
        const uri = model.uri;
        const inConfig = await this._mcpWorkbenchService.getMcpConfigPath(model.uri);
        if (!inConfig) {
            return undefined;
        }
        const value = model.getValue();
        const tree = parseTree(value);
        const listeners = [
            model.onDidChangeContent(() => this._cachedMcpSection.clear()),
            model.onWillDispose(() => this._cachedMcpSection.clear()),
        ];
        this._addDiagnostics(model, value, tree, inConfig);
        return this._cachedMcpSection.value = {
            model,
            tree,
            inConfig,
            dispose: () => {
                this._markerService.remove(diagnosticOwner, [uri]);
                dispose(listeners);
            }
        };
    }
    _addDiagnostics(tm, value, tree, inConfig) {
        const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, 'servers'] : ['servers']);
        if (!serversNode) {
            return;
        }
        const getClosestMatchingVariable = (name) => {
            let bestValue = '';
            let bestDistance = Infinity;
            for (const variable of this._configurationResolverService.resolvableVariables) {
                const distance = computeLevenshteinDistance(name, variable);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestValue = variable;
                }
            }
            return bestValue;
        };
        const diagnostics = [];
        forEachPropertyWithReplacement(serversNode, node => {
            const expr = ConfigurationResolverExpression.parse(node.value);
            for (const { id, name, arg } of expr.unresolved()) {
                if (!this._configurationResolverService.resolvableVariables.has(name)) {
                    const position = value.indexOf(id, node.offset);
                    if (position === -1) {
                        continue;
                    } // unreachable?
                    const start = tm.getPositionAt(position);
                    const end = tm.getPositionAt(position + id.length);
                    diagnostics.push({
                        severity: MarkerSeverity.Warning,
                        message: localize('mcp.variableNotFound', 'Variable `{0}` not found, did you mean ${{1}}?', name, getClosestMatchingVariable(name) + (arg ? `:${arg}` : '')),
                        startLineNumber: start.lineNumber,
                        startColumn: start.column,
                        endLineNumber: end.lineNumber,
                        endColumn: end.column,
                        modelVersionId: tm.getVersionId(),
                    });
                }
            }
        });
        if (diagnostics.length) {
            this._markerService.changeOne(diagnosticOwner, tm.uri, diagnostics);
        }
        else {
            this._markerService.remove(diagnosticOwner, [tm.uri]);
        }
    }
    async _provideCodeLenses(model, onDidChangeCodeLens) {
        const parsed = await this._parseModel(model);
        if (!parsed) {
            return undefined;
        }
        const { tree, inConfig } = parsed;
        const serversNode = findNodeAtLocation(tree, inConfig.section ? [...inConfig.section, 'servers'] : ['servers']);
        if (!serversNode) {
            return undefined;
        }
        const store = new DisposableStore();
        const lenses = [];
        const lensList = { lenses, dispose: () => store.dispose() };
        const read = (observable) => {
            store.add(Event.fromObservableLight(observable)(onDidChangeCodeLens));
            return observable.get();
        };
        const collection = read(this._mcpRegistry.collections).find(c => isEqual(c.presentation?.origin, model.uri));
        if (!collection) {
            return lensList;
        }
        const mcpServers = read(this._mcpService.servers).filter(s => s.collection.id === collection.id);
        for (const node of serversNode.children || []) {
            if (node.type !== 'property' || node.children?.[0]?.type !== 'string') {
                continue;
            }
            const name = node.children[0].value;
            const server = mcpServers.find(s => s.definition.label === name);
            if (!server) {
                continue;
            }
            const range = Range.fromPositions(model.getPositionAt(node.children[0].offset));
            const canDebug = !!server.readDefinitions().get().server?.devMode?.debug;
            const state = read(server.connectionState).state;
            switch (state) {
                case 3 /* McpConnectionState.Kind.Error */:
                    lenses.push({
                        range,
                        command: {
                            id: "workbench.mcp.showOutput" /* McpCommandIds.ShowOutput */,
                            title: '$(error) ' + localize('server.error', 'Error'),
                            arguments: [server.definition.id],
                        },
                    }, {
                        range,
                        command: {
                            id: "workbench.mcp.restartServer" /* McpCommandIds.RestartServer */,
                            title: localize('mcp.restart', "Restart"),
                            arguments: [server.definition.id, { autoTrustChanges: true }],
                        },
                    });
                    if (canDebug) {
                        lenses.push({
                            range,
                            command: {
                                id: "workbench.mcp.restartServer" /* McpCommandIds.RestartServer */,
                                title: localize('mcp.debug', "Debug"),
                                arguments: [server.definition.id, { debug: true, autoTrustChanges: true }],
                            },
                        });
                    }
                    break;
                case 1 /* McpConnectionState.Kind.Starting */:
                    lenses.push({
                        range,
                        command: {
                            id: "workbench.mcp.showOutput" /* McpCommandIds.ShowOutput */,
                            title: '$(loading~spin) ' + localize('server.starting', 'Starting'),
                            arguments: [server.definition.id],
                        },
                    }, {
                        range,
                        command: {
                            id: "workbench.mcp.stopServer" /* McpCommandIds.StopServer */,
                            title: localize('cancel', "Cancel"),
                            arguments: [server.definition.id],
                        },
                    });
                    break;
                case 2 /* McpConnectionState.Kind.Running */:
                    lenses.push({
                        range,
                        command: {
                            id: "workbench.mcp.showOutput" /* McpCommandIds.ShowOutput */,
                            title: '$(check) ' + localize('server.running', 'Running'),
                            arguments: [server.definition.id],
                        },
                    }, {
                        range,
                        command: {
                            id: "workbench.mcp.stopServer" /* McpCommandIds.StopServer */,
                            title: localize('mcp.stop', "Stop"),
                            arguments: [server.definition.id],
                        },
                    }, {
                        range,
                        command: {
                            id: "workbench.mcp.restartServer" /* McpCommandIds.RestartServer */,
                            title: localize('mcp.restart', "Restart"),
                            arguments: [server.definition.id, { autoTrustChanges: true }],
                        },
                    });
                    if (canDebug) {
                        lenses.push({
                            range,
                            command: {
                                id: "workbench.mcp.restartServer" /* McpCommandIds.RestartServer */,
                                title: localize('mcp.debug', "Debug"),
                                arguments: [server.definition.id, { autoTrustChanges: true, debug: true }],
                            },
                        });
                    }
                    break;
                case 0 /* McpConnectionState.Kind.Stopped */:
                    lenses.push({
                        range,
                        command: {
                            id: "workbench.mcp.startServer" /* McpCommandIds.StartServer */,
                            title: '$(debug-start) ' + localize('mcp.start', "Start"),
                            arguments: [server.definition.id, { autoTrustChanges: true }],
                        },
                    });
                    if (canDebug) {
                        lenses.push({
                            range,
                            command: {
                                id: "workbench.mcp.startServer" /* McpCommandIds.StartServer */,
                                title: localize('mcp.debug', "Debug"),
                                arguments: [server.definition.id, { autoTrustChanges: true, debug: true }],
                            },
                        });
                    }
            }
            if (state !== 3 /* McpConnectionState.Kind.Error */) {
                const toolCount = read(server.tools).length;
                if (toolCount) {
                    lenses.push({
                        range,
                        command: {
                            id: '',
                            title: localize('server.toolCount', '{0} tools', toolCount),
                        }
                    });
                }
                const promptCount = read(server.prompts).length;
                if (promptCount) {
                    lenses.push({
                        range,
                        command: {
                            id: "workbench.mcp.startPromptForServer" /* McpCommandIds.StartPromptForServer */,
                            title: localize('server.promptcount', '{0} prompts', promptCount),
                            arguments: [server],
                        }
                    });
                }
                lenses.push({
                    range,
                    command: {
                        id: "workbench.mcp.serverOptions" /* McpCommandIds.ServerOptions */,
                        title: localize('mcp.server.more', 'More...'),
                        arguments: [server.definition.id],
                    }
                });
            }
        }
        return lensList;
    }
    async _provideInlayHints(model, range) {
        const parsed = await this._parseModel(model);
        if (!parsed) {
            return undefined;
        }
        const { tree, inConfig } = parsed;
        const mcpSection = inConfig.section ? findNodeAtLocation(tree, [...inConfig.section]) : tree;
        if (!mcpSection) {
            return undefined;
        }
        const inputsNode = findNodeAtLocation(mcpSection, ['inputs']);
        if (!inputsNode) {
            return undefined;
        }
        const inputs = await this._mcpRegistry.getSavedInputs(inConfig.scope);
        const hints = [];
        const serversNode = findNodeAtLocation(mcpSection, ['servers']);
        if (serversNode) {
            annotateServers(serversNode);
        }
        annotateInputs(inputsNode);
        return { hints, dispose: () => { } };
        function annotateServers(servers) {
            forEachPropertyWithReplacement(servers, node => {
                const expr = ConfigurationResolverExpression.parse(node.value);
                for (const { id } of expr.unresolved()) {
                    const saved = inputs[id];
                    if (saved) {
                        pushAnnotation(id, node.offset + node.value.indexOf(id) + id.length, saved);
                    }
                }
            });
        }
        function annotateInputs(node) {
            if (node.type !== 'array' || !node.children) {
                return;
            }
            for (const input of node.children) {
                if (input.type !== 'object' || !input.children) {
                    continue;
                }
                const idProp = input.children.find(c => c.type === 'property' && c.children?.[0].value === 'id');
                if (!idProp) {
                    continue;
                }
                const id = idProp.children[1];
                if (!id || id.type !== 'string' || !id.value) {
                    continue;
                }
                const savedId = '${input:' + id.value + '}';
                const saved = inputs[savedId];
                if (saved) {
                    pushAnnotation(savedId, id.offset + 1 + id.length, saved);
                }
            }
        }
        function pushAnnotation(savedId, offset, saved) {
            const tooltip = new MarkdownString([
                createMarkdownCommandLink({ id: "workbench.mcp.editStoredInput" /* McpCommandIds.EditStoredInput */, text: localize('edit', 'Edit'), arguments: [savedId, model.uri, mcpConfigurationSection, inConfig.target], tooltip: localize('edit.savedValue.tooltip', 'Edit saved value') }),
                createMarkdownCommandLink({ id: "workbench.mcp.removeStoredInput" /* McpCommandIds.RemoveStoredInput */, text: localize('clear', 'Clear'), arguments: [inConfig.scope, savedId], tooltip: localize('clear.savedValue.tooltip', 'Clear saved value') }),
                createMarkdownCommandLink({ id: "workbench.mcp.removeStoredInput" /* McpCommandIds.RemoveStoredInput */, text: localize('clearAll', 'Clear All'), arguments: [inConfig.scope], tooltip: localize('clearAll.savedValues.tooltip', 'Clear all saved values') }),
            ].join(' | '), { isTrusted: true });
            const hint = {
                label: '= ' + (saved.input?.type === 'promptString' && saved.input.password ? '*'.repeat(10) : (saved.value || '')),
                position: model.getPositionAt(offset),
                tooltip,
                paddingLeft: true,
            };
            hints.push(hint);
            return hint;
        }
    }
};
McpLanguageFeatures = __decorate([
    __param(0, ILanguageFeaturesService),
    __param(1, IMcpRegistry),
    __param(2, IMcpWorkbenchService),
    __param(3, IMcpService),
    __param(4, IMarkerService),
    __param(5, IConfigurationResolverService)
], McpLanguageFeatures);
export { McpLanguageFeatures };
function forEachPropertyWithReplacement(node, callback) {
    if (node.type === 'string' && typeof node.value === 'string' && node.value.includes(ConfigurationResolverExpression.VARIABLE_LHS)) {
        callback(node);
    }
    else if (node.type === 'property') {
        // skip the property name
        node.children?.slice(1).forEach(n => forEachPropertyWithReplacement(n, callback));
    }
    else {
        node.children?.forEach(n => forEachPropertyWithReplacement(n, callback));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwTGFuZ3VhZ2VGZWF0dXJlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcExhbmd1YWdlRmVhdHVyZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEYsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGtCQUFrQixFQUFRLFNBQVMsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBZSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTVILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUMvRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHaEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDbEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBZSxjQUFjLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFN0csT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDeEgsT0FBTyxFQUFFLCtCQUErQixFQUFrQixNQUFNLG1GQUFtRixDQUFDO0FBRXBKLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0Is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