/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IDisposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { isDefined } from '../../../../base/common/types.js';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CONTEXT_VARIABLE_NAME, CONTEXT_VARIABLE_TYPE, CONTEXT_VARIABLE_VALUE, MainThreadDebugVisualization, IDebugVisualization, IDebugVisualizationContext, IExpression, IExpressionContainer, IDebugVisualizationTreeItem, IDebugSession } from './debug.js';
import { getContextForVariable } from './debugContext.js';
import { Scope, Variable, VisualizedExpression } from './debugModel.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';

export const IDebugVisualizerService = createDecorator<IDebugVisualizerService>('debugVisualizerService');

interface VisualizerHandle {
	id: string;
	extensionId: ExtensionIdentifier;
	provideDebugVisualizers(context: IDebugVisualizationContext, token: CancellationToken): Promise<IDebugVisualization[]>;
	resolveDebugVisualizer(viz: IDebugVisualization, token: CancellationToken): Promise<MainThreadDebugVisualization>;
	executeDebugVisualizerCommand(id: number): Promise<void>;
	disposeDebugVisualizers(ids: number[]): void;
}

interface VisualizerTreeHandle {
	getTreeItem(element: IDebugVisualizationContext): Promise<IDebugVisualizationTreeItem | undefined>;
	getChildren(element: number): Promise<IDebugVisualizationTreeItem[]>;
	disposeItem(element: number): void;
	editItem?(item: number, value: string): Promise<IDebugVisualizationTreeItem | undefined>;
}

export class DebugVisualizer {
	public get name() {
		return this.viz.name;
	}

	public get iconPath() {
		return this.viz.iconPath;
	}

	public get iconClass() {
		return this.viz.iconClass;
	}

	constructor(private readonly handle: VisualizerHandle, private readonly viz: IDebugVisualization) { }

	public async resolve(token: CancellationToken) {
		return this.viz.visualization ??= await this.handle.resolveDebugVisualizer(this.viz, token);
	}

	public async execute() {
		await this.handle.executeDebugVisualizerCommand(this.viz.id);
	}
}

export interface IDebugVisualizerService {
	_serviceBrand: undefined;

	/**
	 * Gets visualizers applicable for the given Expression.
	 */
	getApplicableFor(expression: IExpression, token: CancellationToken): Promise<IReference<DebugVisualizer[]>>;

	/**
	 * Registers a new visualizer (called from the main thread debug service)
	 */
	register(handle: VisualizerHandle): IDisposable;

	/**
	 * Registers a new visualizer tree.
	 */
	registerTree(treeId: string, handle: VisualizerTreeHandle): IDisposable;

	/**
	 * Sets that a certa tree should be used for the visualized node
	 */
	getVisualizedNodeFor(treeId: string, expr: IExpression): Promise<VisualizedExpression | undefined>;

	/**
	 * Gets children for a visualized tree node.
	 */
	getVisualizedChildren(session: IDebugSession | undefined, treeId: string, treeElementId: number): Promise<IExpression[]>;

	/**
	 * Gets children for a visualized tree node.
	 */
	editTreeItem(treeId: string, item: IDebugVisualizationTreeItem, newValue: string): Promise<void>;
}

const emptyRef: IReference<DebugVisualizer[]> = { object: [], dispose: () => { } };

export class DebugVisualizerService implements IDebugVisualizerService {
	declare public readonly _serviceBrand: undefined;

	private readonly handles = new Map</* extId + \0 + vizId */ string, VisualizerHandle>();
	private readonly trees = new Map</* extId + \0 + treeId */ string, VisualizerTreeHandle>();
	private readonly didActivate = new Map<string, Promise<void>>();
	private registrations: { expr: ContextKeyExpression; id: string; extensionId: ExtensionIdentifier }[] = [];

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ILogService private readonly logService: ILogService,
	) {
		visualizersExtensionPoint.setHandler((_, { added, removed }) => {
			this.registrations = this.registrations.filter(r =>
				!removed.some(e => ExtensionIdentifier.equals(e.description.identifier, r.extensionId)));
			added.forEach(e => this.processExtensionRegistration(e.description));
		});
	}

	/** @inheritdoc */
	public async getApplicableFor(variable: IExpression, token: CancellationToken): Promise<IReference<DebugVisualizer[]>> {
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

		const maybeVisualizers = await Promise.all(this.registrations.map(async registration => {
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
	public register(handle: VisualizerHandle): IDisposable {
		const key = toKey(handle.extensionId, handle.id);
		this.handles.set(key, handle);
		return toDisposable(() => this.handles.delete(key));
	}

	/** @inheritdoc */
	public registerTree(treeId: string, handle: VisualizerTreeHandle): IDisposable {
		this.trees.set(treeId, handle);
		return toDisposable(() => this.trees.delete(treeId));
	}

	/** @inheritdoc */
	public async getVisualizedNodeFor(treeId: string, expr: IExpression): Promise<VisualizedExpression | undefined> {
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
		} catch (e) {
			this.logService.warn('Failed to get visualized node', e);
			return;
		}
	}

	/** @inheritdoc */
	public async getVisualizedChildren(session: IDebugSession | undefined, treeId: string, treeElementId: number): Promise<IExpression[]> {
		const node = this.trees.get(treeId);
		const children = await node?.getChildren(treeElementId) || [];
		return children.map(c => new VisualizedExpression(session, this, treeId, c, undefined));
	}

	/** @inheritdoc */
	public async editTreeItem(treeId: string, treeItem: IDebugVisualizationTreeItem, newValue: string): Promise<void> {
		const newItem = await this.trees.get(treeId)?.editItem?.(treeItem.id, newValue);
		if (newItem) {
			Object.assign(treeItem, newItem); // replace in-place so rerenders work
		}
	}

	private getVariableContext(threadId: number, variable: Variable) {
		const context: IDebugVisualizationContext = {
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

		for (let p: IExpressionContainer = variable; p instanceof Variable; p = p.parent) {
			if (p.parent instanceof Scope) {
				context.frameId = p.parent.stackFrame.frameId;
			}
		}

		return context;
	}

	private processExtensionRegistration(ext: IExtensionDescription) {
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
			} catch (e) {
				this.logService.error(`Error processing debug visualizer registration from extension '${ext.identifier.value}'`, e);
			}
		}
	}
}

const toKey = (extensionId: ExtensionIdentifier, id: string) => `${ExtensionIdentifier.toKey(extensionId)}\0${id}`;

const visualizersExtensionPoint = ExtensionsRegistry.registerExtensionPoint<{ id: string; when: string }[]>({
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
