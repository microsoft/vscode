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
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CONTEXT_VARIABLE_NAME, CONTEXT_VARIABLE_TYPE, CONTEXT_VARIABLE_VALUE } from './debug.js';
import { getContextForVariable } from './debugContext.js';
import { Scope, Variable, VisualizedExpression } from './debugModel.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
export const IDebugVisualizerService = createDecorator('debugVisualizerService');
export class DebugVisualizer {
    get name() {
        return this.viz.name;
    }
    get iconPath() {
        return this.viz.iconPath;
    }
    get iconClass() {
        return this.viz.iconClass;
    }
    constructor(handle, viz) {
        this.handle = handle;
        this.viz = viz;
    }
    async resolve(token) {
        return this.viz.visualization ??= await this.handle.resolveDebugVisualizer(this.viz, token);
    }
    async execute() {
        await this.handle.executeDebugVisualizerCommand(this.viz.id);
    }
}
const emptyRef = { object: [], dispose: () => { } };
let DebugVisualizerService = class DebugVisualizerService {
    constructor(contextKeyService, extensionService, logService) {
        this.contextKeyService = contextKeyService;
        this.extensionService = extensionService;
        this.logService = logService;
        this.handles = new Map();
        this.trees = new Map();
        this.didActivate = new Map();
        this.registrations = [];
        visualizersExtensionPoint.setHandler((_, { added, removed }) => {
            this.registrations = this.registrations.filter(r => !removed.some(e => ExtensionIdentifier.equals(e.description.identifier, r.extensionId)));
            added.forEach(e => this.processExtensionRegistration(e.description));
        });
    }
    /** @inheritdoc */
    async getApplicableFor(variable, token) {
        if (!(variable instanceof Variable)) {
            return emptyRef;
        }
        const threadId = variable.getThreadId();
        if (threadId === undefined) { // an expression, not a variable
            return emptyRef;
        }
        const context = this.getVariableContext(threadId, variable);
        const overlay = getContextForVariable(this.contextKeyService, variable, [
            [CONTEXT_VARIABLE_NAME.key, variable.name],
            [CONTEXT_VARIABLE_VALUE.key, variable.value],
            [CONTEXT_VARIABLE_TYPE.key, variable.type],
        ]);
        const maybeVisualizers = await Promise.all(this.registrations.map(async (registration) => {
            if (!overlay.contextMatchesRules(registration.expr)) {
                return;
            }
            let prom = this.didActivate.get(registration.id);
            if (!prom) {
                prom = this.extensionService.activateByEvent(`onDebugVisualizer:${registration.id}`);
                this.didActivate.set(registration.id, prom);
            }
            await prom;
            if (token.isCancellationRequested) {
                return;
            }
            const handle = this.handles.get(toKey(registration.extensionId, registration.id));
            return handle && { handle, result: await handle.provideDebugVisualizers(context, token) };
        }));
        const ref = {
            object: maybeVisualizers.filter(isDefined).flatMap(v => v.result.map(r => new DebugVisualizer(v.handle, r))),
            dispose: () => {
                for (const viz of maybeVisualizers) {
                    viz?.handle.disposeDebugVisualizers(viz.result.map(r => r.id));
                }
            },
        };
        if (token.isCancellationRequested) {
            ref.dispose();
        }
        return ref;
    }
    /** @inheritdoc */
    register(handle) {
        const key = toKey(handle.extensionId, handle.id);
        this.handles.set(key, handle);
        return toDisposable(() => this.handles.delete(key));
    }
    /** @inheritdoc */
    registerTree(treeId, handle) {
        this.trees.set(treeId, handle);
        return toDisposable(() => this.trees.delete(treeId));
    }
    /** @inheritdoc */
    async getVisualizedNodeFor(treeId, expr) {
        if (!(expr instanceof Variable)) {
            return;
        }
        const threadId = expr.getThreadId();
        if (threadId === undefined) {
            return;
        }
        const tree = this.trees.get(treeId);
        if (!tree) {
            return;
        }
        try {
            const treeItem = await tree.getTreeItem(this.getVariableContext(threadId, expr));
            if (!treeItem) {
                return;
            }
            return new VisualizedExpression(expr.getSession(), this, treeId, treeItem, expr);
        }
        catch (e) {
            this.logService.warn('Failed to get visualized node', e);
            return;
        }
    }
    /** @inheritdoc */
    async getVisualizedChildren(session, treeId, treeElementId) {
        const node = this.trees.get(treeId);
        const children = await node?.getChildren(treeElementId) || [];
        return children.map(c => new VisualizedExpression(session, this, treeId, c, undefined));
    }
    /** @inheritdoc */
    async editTreeItem(treeId, treeItem, newValue) {
        const newItem = await this.trees.get(treeId)?.editItem?.(treeItem.id, newValue);
        if (newItem) {
            Object.assign(treeItem, newItem); // replace in-place so rerenders work
        }
    }
    getVariableContext(threadId, variable) {
        const context = {
            sessionId: variable.getSession()?.getId() || '',
            containerId: (variable.parent instanceof Variable ? variable.reference : undefined),
            threadId,
            variable: {
                name: variable.name,
                value: variable.value,
                type: variable.type,
                evaluateName: variable.evaluateName,
                variablesReference: variable.reference || 0,
                indexedVariables: variable.indexedVariables,
                memoryReference: variable.memoryReference,
                namedVariables: variable.namedVariables,
                presentationHint: variable.presentationHint,
            }
        };
        for (let p = variable; p instanceof Variable; p = p.parent) {
            if (p.parent instanceof Scope) {
                context.frameId = p.parent.stackFrame.frameId;
            }
        }
        return context;
    }
    processExtensionRegistration(ext) {
        const viz = ext.contributes?.debugVisualizers;
        if (!(viz instanceof Array)) {
            return;
        }
        for (const { when, id } of viz) {
            try {
                const expr = ContextKeyExpr.deserialize(when);
                if (expr) {
                    this.registrations.push({ expr, id, extensionId: ext.identifier });
                }
            }
            catch (e) {
                this.logService.error(`Error processing debug visualizer registration from extension '${ext.identifier.value}'`, e);
            }
        }
    }
};
DebugVisualizerService = __decorate([
    __param(0, IContextKeyService),
    __param(1, IExtensionService),
    __param(2, ILogService)
], DebugVisualizerService);
export { DebugVisualizerService };
const toKey = (extensionId, id) => `${ExtensionIdentifier.toKey(extensionId)}\0${id}`;
const visualizersExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'debugVisualizers',
    jsonSchema: {
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Name of the debug visualizer'
                },
                when: {
                    type: 'string',
                    description: 'Condition when the debug visualizer is applicable'
                }
            },
            required: ['id', 'when']
        }
    },
    activationEventsGenerator: function* (contribs) {
        for (const contrib of contribs) {
            if (contrib.id) {
                yield `onDebugVisualizer:${contrib.id}`;
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVidWdWaXN1YWxpemVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Z1Zpc3VhbGl6ZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBMkIsWUFBWSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxjQUFjLEVBQXdCLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDaEksT0FBTyxFQUFFLG1CQUFtQixFQUF5QixNQUFNLHNEQUFzRCxDQUFDO0FBQ2xILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM3RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLHFCQUFxQixFQUFFLHNCQUFzQixFQUFnSyxNQUFNLFlBQVksQ0FBQztBQUNoUSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQ3hFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRS9GLE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLGVBQWUsQ0FBMEIsd0JBQXdCLENBQUMsQ0FBQztBQWtCMUcsTUFBTSxPQUFPLGVBQWU7SUFDM0IsSUFBVyxJQUFJO1FBQ2QsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztJQUN0QixD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