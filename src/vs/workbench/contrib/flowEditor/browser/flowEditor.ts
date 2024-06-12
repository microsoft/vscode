/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as L from 'litegraph.js';
import type { LiteGraph as LG } from 'litegraph.js';
import * as dom from 'vs/base/browser/dom';
import { ActionBar, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { renderIcon } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { Action } from 'vs/base/common/actions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorPane } from 'vs/workbench/browser/parts/editor/editorPane';
import { IEditorOpenContext } from 'vs/workbench/common/editor';
import { FlowEditorInput } from 'vs/workbench/contrib/flowEditor/common/flowEditorInput';
import * as G from 'vs/workbench/contrib/flowEditor/common/flowEditorTypes';
import { IEditorGroup } from 'vs/workbench/services/editor/common/editorGroupsService';

declare const LGraph: typeof L.LGraph;
declare const LGraphCanvas: typeof L.LGraphCanvas;
declare const LGraphNode: typeof L.LGraphNode;
declare const LiteGraph: typeof LG;

const TOOLBAR_HEIGHT = 28;

export class FlowEditor extends EditorPane {
	public static readonly ID = 'flowEditor';
	private readonly graph = new LGraph();
	private canvas!: L.LGraphCanvas;
	private isRestoring = false;
	private readonly el = dom.h('div.monaco-flow-editor', [
		dom.h('div.toolbar@toolbar'),
		dom.h('canvas.graph@graph'),
	]);

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private readonly instaService: IInstantiationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super(FlowEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected override createEditor(parent: HTMLElement): void {
		parent.appendChild(this.el.root);
		this.createToolbar();
		this.createGraph();

		const input = this.getInput();
		if (input) {
			this.restoreGraph(input);
		}
	}

	public override async setInput(input: FlowEditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken) {
		await super.setInput(input, options, context, token);
		if (input) {
			this.restoreGraph(input);
		}
	}

	private getInput() {
		return this.input as FlowEditorInput | undefined;
	}

	private createToolbar() {
		const actionBar = this._register(this.instaService.createInstance(ActionBar, this.el.toolbar, {
			orientation: ActionsOrientation.HORIZONTAL,
			actionViewItemProvider: (action, options) => {
				const vm = new CodiconActionViewItem(undefined, action, options);
				if (action instanceof ActionWithIcon) {
					vm.themeIcon = action.icon;
				}
				return vm;
			}
		}));

		actionBar.push(new ActionWithIcon('Add Trigger',
			localize('addTrigger', "Add Trigger"),
			Codicon.githubAction,
			undefined,
			() => this.addNodeOfKind([G.NodeKind.Command, G.NodeKind.OwnedCommand]),
		));

		actionBar.push(new ActionWithIcon('Add Transform',
			localize('addFilter', "Add Transform"),
			Codicon.filter,
			undefined,
			() => this.addNodeOfKind([G.NodeKind.Prompt, G.NodeKind.Regex, G.NodeKind.Condition, G.NodeKind.Value, G.NodeKind.SpawnProcess, G.NodeKind.Fetch, G.NodeKind.ExtractJson]),
		));

		actionBar.push(new ActionWithIcon('Add Action',
			localize('addAction', "Add Action"),
			Codicon.run,
			undefined,
			() => this.addNodeOfKind([G.NodeKind.RunCommand, G.NodeKind.Notify, G.NodeKind.SpawnProcess, G.NodeKind.StartChat]),
		));
	}

	private async addNodeOfKind(kinds: readonly G.NodeKind[]) {
		const name = await this.quickInputService.pick(
			kinds.map(kind => ({ label: nodeTitles[kind], kind })),
			{ title: 'Select Node Kind' }
		);

		if (!name) {
			return;
		}

		const n = LiteGraph.createNode(nodeTypes[name.kind]) as VSCodeNode<G.FlowNode>;
		n.instaService = this.instaService;
		const [x1, y1, x2, y2] = this.canvas.visible_area;
		n.pos = [(x1 + x2) / 2 / this.window.devicePixelRatio, (y1 + y2) / 2 / this.window.devicePixelRatio];
		this.graph.add(n);
	}

	private createGraph() {
		const { graph, el } = this;
		this.doLayout();
		this.canvas = new LGraphCanvas(el.graph, graph);
		graph.start();

		graph.afterChange = () => {
			if (this.isRestoring) {
				return;
			}

			const nodes: G.IFlowNode[] = [];
			// casts are needed because findNodesByClass unnecessarily restricts constructor arguments
			for (const node of (graph as any)._nodes as VSCodeNode<G.FlowNode>[]) {
				nodes.push({
					node: nodeSerializers[node.kind](node as any, graph.links),
					x: node.pos[0],
					y: node.pos[1],
					id: node.id,
				});
			}

			const flowGraph: G.IFlowGraphData = { nodes };

			this.getInput()?.flowGraph.replace(flowGraph);
		};
	}

	private restoreGraph(input: FlowEditorInput) {
		const fg = input.flowGraph;
		const { graph } = this;
		this.isRestoring = true;
		graph.clear();

		const nodeMap = new Map<number, { actual: G.IActualizedNode; gnode: L.LGraphNode }>();
		for (const node of fg.data.get().nodes) {
			const gnode = LiteGraph.createNode(nodeTypes[node.node.kind]) as VSCodeNode<G.FlowNode>;
			gnode.instaService = this.instaService;
			const actual = G.IActualizedNode.create(node.node);
			for (const property of actual.properties) {
				gnode.setProperty(property, (node.node as any)[property]);
			}
			gnode.pos = [node.x, node.y];

			this.graph.add(gnode);
			nodeMap.set(node.id, { gnode, actual });
		}

		for (const { actual, gnode } of nodeMap.values()) {
			for (const [i, input] of (actual.inputs || []).entries()) {
				if (input) {
					const from = nodeMap.get(input.sourceId)!;
					from.gnode.connect(input.sourceIndex, gnode, i);
				}
			}
		}

		this.isRestoring = false;
	}

	public override layout(): void {
		this.doLayout();
	}

	private doLayout() {
		const { graph, root } = this.el;
		const height = root.clientHeight - TOOLBAR_HEIGHT;
		const width = root.clientWidth;

		graph.style.width = `${width}px`;
		graph.style.height = `${height}px`;

		const dpr = dom.getWindow(graph).devicePixelRatio || 1;
		graph.width = root.clientWidth * dpr;
		graph.height = height * dpr;
		graph.getContext('2d')!.scale(dpr, dpr);
	}
}

class ActionWithIcon extends Action {
	constructor(id: string, title: string, public readonly icon: ThemeIcon, enabled: boolean | undefined, run: () => void) {
		super(id, title, undefined, enabled, run);
	}
}

class CodiconActionViewItem extends ActionViewItem {

	public themeIcon?: ThemeIcon;

	protected override updateLabel(): void {
		if (this.options.label && this.label && this.themeIcon) {
			dom.reset(this.label, renderIcon(this.themeIcon), this.action.label);
		}
	}
}

const nodeTitles: { [K in G.NodeKind]: string } = {
	[G.NodeKind.Command]: 'When Command Runs',
	[G.NodeKind.OwnedCommand]: 'Custom Command Trigger',
	[G.NodeKind.Prompt]: 'AI Prompt',
	[G.NodeKind.Regex]: 'Match Regex',
	[G.NodeKind.Condition]: 'Check Condition',
	[G.NodeKind.RunCommand]: 'Run Command',
	[G.NodeKind.Notify]: 'Send Notification',
	[G.NodeKind.SpawnProcess]: 'Spawn Process',
	[G.NodeKind.Value]: 'Template Value',
	[G.NodeKind.Fetch]: 'Fetch URL',
	[G.NodeKind.ExtractJson]: 'Extract JSON',
	[G.NodeKind.StartChat]: 'Start AI Chat',
};

const serLink = (link: L.LLink | undefined): G.IFlowConnection | null => link ? ({ sourceId: link.origin_id, sourceIndex: link.origin_slot }) : null;

const nodeSerializers: { [K in G.NodeKind]: (node: VSCodeNode<G.FlowNode & { kind: K }>, links: Record<number, L.LLink | undefined>) => G.FlowNode & { kind: K } } = {
	[G.NodeKind.Command]: node => ({ kind: G.NodeKind.Command, command: node.properties.command }),
	[G.NodeKind.OwnedCommand]: node => ({ kind: G.NodeKind.OwnedCommand, command: node.properties.command, label: node.properties.label }),

	[G.NodeKind.Prompt]: (node, links) => ({
		kind: G.NodeKind.Prompt,
		prompt: node.properties.prompt,
		family: node.properties.family,
		inputs: node.inputs.map(i => links[i.link!]).map(serLink)
	}),
	[G.NodeKind.Regex]: (node, links) => ({
		kind: G.NodeKind.Regex,
		flags: node.properties.flags,
		re: node.properties.re,
		input: serLink(links[node.inputs[0].link!]),
	}),
	[G.NodeKind.Condition]: (node, links) => ({
		kind: G.NodeKind.Condition,
		condition: node.properties.condition,
		inputs: node.inputs.map(i => links[i.link!]).map(serLink)
	}),
	[G.NodeKind.SpawnProcess]: (node, links) => ({
		kind: G.NodeKind.SpawnProcess,
		command: serLink(links[node.inputs[0].link!]),
		cwd: serLink(links[node.inputs[1].link!]),
	}),
	[G.NodeKind.Value]: (node, links) => ({
		kind: G.NodeKind.Value,
		value: node.properties.value,
		inputs: node.inputs.map(i => links[i.link!]).map(serLink)
	}),
	[G.NodeKind.Fetch]: (node, links) => ({
		kind: G.NodeKind.Fetch,
		url: serLink(links[node.inputs[0].link!]),
	}),
	[G.NodeKind.ExtractJson]: (node, links) => ({
		kind: G.NodeKind.ExtractJson,
		input: serLink(links[node.inputs[0].link!]),
		path: node.properties.path,
	}),

	[G.NodeKind.RunCommand]: (node, links) => ({
		kind: G.NodeKind.RunCommand,
		command: serLink(links[node.inputs[0].link!]),
		args: node.inputs.slice(1).map(i => links[i.link!]).map(serLink)
	}),
	[G.NodeKind.Notify]: (node, links) => ({
		kind: G.NodeKind.Notify,
		message: serLink(links[node.inputs[0].link!]),
	}),
	[G.NodeKind.StartChat]: (node, links) => ({
		kind: G.NodeKind.StartChat,
		query: serLink(links[node.inputs[0].link!]),
	}),
};

class VSCodeNode<N extends G.FlowNode> extends LGraphNode {
	public instaService!: IInstantiationService;
	private propertyButtons: Record<string, L.IButtonWidget> = {};

	constructor(public readonly kind: N['kind']) {
		super();
		this.title = nodeTitles[kind];
	}

	protected addPropWidget<T extends L.IWidget>(type: T['type'], name: string, property: keyof N, defaultValue = '') {
		const cast = property as string;
		this.properties[cast] = defaultValue;
		super.addWidget(type, name, defaultValue, undefined, { property, multiline: true });
	}

	protected addButtonPickWidget(name: string, property: keyof N, onPick: (accessor: ServicesAccessor) => Promise<unknown | undefined>, defaultValue = '') {
		const cast = property as string;
		this.properties[cast] = defaultValue;

		this.propertyButtons[cast] = super.addWidget('button', name, null, () => {
			this.instaService.invokeFunction(onPick).then(value => {
				if (value !== undefined) {
					this.setProperty(cast, value);
				}
			});
		}, { property });
	}

	protected addCommandPickWidget(name: string, property: keyof N) {
		this.addButtonPickWidget(name, property, async (accessor) => {
			const picked = await accessor.get(IQuickInputService).pick(
				[...CommandsRegistry.getCommands()].map(([id, cmd]) => {
					const label = cmd.metadata?.description;
					if (label) {
						return { id, label: typeof label === 'string' ? label : label.value, description: id };
					} else {
						return { id, label: id };
					}
				}),
				{},
			);

			return picked?.id;
		});
	}

	override onPropertyChanged(property: string, value: any, prevValue: any): void | boolean {
		const btn = this.propertyButtons[property];
		if (btn) {
			btn.name = value;
		}
	}
}

const nodeTypes: { [K in G.NodeKind]: string } = {
	//#region Triggers
	[G.NodeKind.Command]: (() => {
		const t = `vscode/${G.NodeKind.Command}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.ICommandTrigger> {
			constructor() {
				super(G.NodeKind.Command);
				this.addCommandPickWidget('Command ID', 'command');
				this.addOutput('Result', 'any');
			}
		});
		return t;
	})(),

	[G.NodeKind.OwnedCommand]: (() => {
		const t = `vscode/${G.NodeKind.OwnedCommand}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IOwnedCommandTrigger> {
			constructor() {
				super(G.NodeKind.OwnedCommand);
				this.addPropWidget('text', 'Command ID', 'command');
				this.addPropWidget('text', 'Command Name', 'label');
				this.addOutput('Result', 'any');
			}
		});
		return t;
	})(),
	//#endregion

	//#region Filters
	[G.NodeKind.Prompt]: (() => {
		const t = `vscode/${G.NodeKind.Prompt}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IPromptFilter> {
			constructor() {
				super(G.NodeKind.Prompt);
				this.addPropWidget('text', 'Prompt Template', 'prompt');
				this.addInput('{0}', 'any');
			}

			override onConnectInput(inputIndex: number): boolean {
				if (inputIndex === this.inputs.length - 1) {
					this.addInput(`{${this.inputs.length}}`, 'any');
				}
				return true;
			}
		});
		return t;
	})(),

	[G.NodeKind.Regex]: (() => {
		const t = `vscode/${G.NodeKind.Regex}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IRegexFilter> {
			constructor() {
				super(G.NodeKind.Regex);
				this.addPropWidget('text', 'Regular Expression', 're');
				this.addPropWidget('text', 'Flags', 'flags');
				this.addInput('String', 'any');
			}

			override onPropertyChanged(property: string, value: any, prevValue: any): void {
				super.onPropertyChanged(property, value, prevValue);

				if (property === 're') {
					const groups = new RegExp(`${this.properties.re}|`).exec('')!.length;
					while (this.outputs.length > groups) {
						this.removeOutput(this.outputs.length - 1);
					}
					while (this.outputs.length < groups) {
						this.addOutput(`Group ${this.outputs.length}`, 'any');
					}
				}
			}
		});

		return t;
	})(),

	[G.NodeKind.Condition]: (() => {
		const t = `vscode/${G.NodeKind.Condition}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IConditionFilter> {
			constructor() {
				super(G.NodeKind.Condition);
				this.addPropWidget('text', 'Condition', 'condition', '!!arg0');
				this.addInput('arg0', 'any');
				this.addOutput('arg0', 'any');
			}

			override onConnectInput(inputIndex: number): boolean {
				if (inputIndex === this.inputs.length - 1) {
					this.addInput(`arg${this.inputs.length}`, 'any');
					this.addOutput(`arg${this.inputs.length}`, 'any');
				}
				return true;
			}
		});

		return t;
	})(),

	[G.NodeKind.Value]: (() => {
		const t = `vscode/${G.NodeKind.Value}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IValueFilter> {
			constructor() {
				super(G.NodeKind.Value);
				this.addPropWidget('text', 'Value', 'value', 'hello {0}!');
				this.addInput('{0}', 'any');
				this.addOutput('value', 'any');
			}

			override onConnectInput(inputIndex: number): boolean {
				if (inputIndex === this.inputs.length - 1) {
					this.addInput(`{${this.inputs.length}}`, 'any');
				}
				return true;
			}
		});

		return t;
	})(),

	[G.NodeKind.Fetch]: (() => {
		const t = `vscode/${G.NodeKind.Fetch}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IFetchURLFilter> {
			constructor() {
				super(G.NodeKind.Fetch);
				this.addInput('url', 'any');
				this.addOutput('text', 'any');
			}
		});

		return t;
	})(),

	[G.NodeKind.StartChat]: (() => {
		const t = `vscode/${G.NodeKind.StartChat}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IStartChatAction> {
			constructor() {
				super(G.NodeKind.StartChat);
				this.addInput('query', 'any');
			}
		});

		return t;
	})(),

	[G.NodeKind.ExtractJson]: (() => {
		const t = `vscode/${G.NodeKind.ExtractJson}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.IExtractJsonFilter> {
			constructor() {
				super(G.NodeKind.ExtractJson);
				this.addInput('JSON', 'any');
				this.addOutput('value', 'any');
				this.addPropWidget('text', 'Path', 'path', 'foo.bar');
			}
		});

		return t;
	})(),

	[G.NodeKind.SpawnProcess]: (() => {
		const t = `vscode/${G.NodeKind.SpawnProcess}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.ISpawnProcessFilter> {
			constructor() {
				super(G.NodeKind.SpawnProcess);
				this.addInput('command', 'any');
				this.addInput('cwd', 'any');
				this.addOutput('stdout', 'any');
				this.addOutput('stderr', 'any');
			}
		});

		return t;
	})(),

	[G.NodeKind.RunCommand]: (() => {
		const t = `vscode/${G.NodeKind.RunCommand}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.ICommandAction> {
			constructor() {
				super(G.NodeKind.RunCommand);
				this.addCommandPickWidget('Command ID', 'command');
				this.addInput('arg0', 'any');
			}

			override onConnectInput(inputIndex: number): boolean {
				if (inputIndex === this.inputs.length - 1) {
					this.addInput(`arg${this.inputs.length}`, 'any');
				}
				return true;
			}
		});

		return t;
	})(),

	[G.NodeKind.Notify]: (() => {
		const t = `vscode/${G.NodeKind.Notify}`;
		LiteGraph.registerNodeType(t, class extends VSCodeNode<G.INotifyAction> {
			constructor() {
				super(G.NodeKind.Notify);
				this.addInput('message', 'any');
			}
		});

		return t;
	})(),
	//#endregion
};
