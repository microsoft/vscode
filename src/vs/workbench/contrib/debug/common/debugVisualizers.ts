/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { isDefined } from 'vs/base/common/types';
import { ContextKeyExpr, ContextKeyExpression, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ExtensionIdentifier, IRelaxedExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { CONTEXT_VARIABLE_NAME, CONTEXT_VARIABLE_TYPE, CONTEXT_VARIABLE_VALUE, MainThreadDebugVisualization, IDebugVisualization, IDebugVisualizationContext, IExpression, IExpressionContainer } from 'vs/workbench/contrib/debug/common/debug';
import { getContextForVariable } from 'vs/workbench/contrib/debug/common/debugContext';
import { Scope, Variable } from 'vs/workbench/contrib/debug/common/debugModel';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionsRegistry } from 'vs/workbench/services/extensions/common/extensionsRegistry';

export const IDebugVisualizerService = createDecorator<IDebugVisualizerService>('debugVisualizerService');

interface VisualizerHandle {
	id: string;
	extensionId: ExtensionIdentifier;
	provideDebugVisualizers(context: IDebugVisualizationContext, token: CancellationToken): Promise<IDebugVisualization[]>;
	resolveDebugVisualizer(viz: IDebugVisualization, token: CancellationToken): Promise<MainThreadDebugVisualization>;
	executeDebugVisualizerCommand(id: number): Promise<void>;
	disposeDebugVisualizers(ids: number[]): void;
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
}

export class DebugVisualizerService implements IDebugVisualizerService {
	declare public readonly _serviceBrand: undefined;

	private readonly handles = new Map</* extId + \0 + vizId */ string, VisualizerHandle>();
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
	public async getApplicableFor(variable: Variable, token: CancellationToken): Promise<IReference<DebugVisualizer[]>> {
		const threadId = variable.getThreadId();
		if (threadId === undefined) { // an expression, not a variable
			return { object: [], dispose: () => { } };
		}

		const context: IDebugVisualizationContext = {
			sessionId: variable.getSession()?.getId() || '',
			containerId: variable.parent.getId(),
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

	private processExtensionRegistration(ext: Readonly<IRelaxedExtensionDescription>) {
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
	activationEventsGenerator: (contribs, result: { push(item: string): void }) => {
		for (const contrib of contribs) {
			if (contrib.id) {
				result.push(`onDebugVisualizer:${contrib.id}`);
			}
		}
	}
});
