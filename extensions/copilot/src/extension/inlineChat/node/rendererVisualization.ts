/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptRenderer } from '@vscode/prompt-tsx';
import { IDebugValueEditorGlobals } from '../../../util/common/debugValueEditorGlobals';

export class RendererVisualizations {
	public static getIfVisualizationTestIsRunning(): RendererVisualizations | undefined {
		if (VisualizationTestRun.instance) {
			return new RendererVisualizations();
		}
		return undefined;
	}

	/**
	 * Exposes the rendering to the visualization extension.
	 * Also overrides the render method so that we can show the tree once rendering is done.
	*/
	public decorateAndRegister<T extends PromptRenderer<any, any>>(renderer: T, label: string): T {
		let first = false;
		renderer.render = async function (this: unknown, ...args: any[]) {
			const result = await Object.getPrototypeOf(renderer).render.apply(this, ...args);
			if (!first) {
				first = true;
				new RendererVisualization(renderer, label);
				VisualizationTestRun.instance?.reload();
			}

			return result;
		} as any;
		return renderer;
	}
}

/**
 * Describes the visualization of a prompt renderer.
 * Only used for debugging.
*/
class RendererVisualization {
	constructor(
		private readonly _renderer: PromptRenderer<any, any>,
		label: string,
	) {
		VisualizationTestRun.instance?.addData(`Prompt ${label}`, () => this.getData());
	}

	getData() {
		class RenderedNode {
			constructor(
				public readonly label: string,
				private readonly children: RenderedNode[],
				private readonly range: [number, number] | undefined,
			) {
				if (!range) {
					const childrenRanges = children.map(c => c.range).filter(r => !!r);
					if (childrenRanges.length > 0) {
						range = [Number.MAX_SAFE_INTEGER, 0];
						for (const crange of childrenRanges) {
							range[0] = Math.min(range[0], crange[0]);
							range[1] = Math.max(range[1], crange[1]);
						}
						this.range = range;
					}
				}
			}

			toObj(): unknown {
				return {
					label: this.label,
					codicon: (this.label === 'Text' || this.label === 'LineBreak') ? 'text-size' : 'symbol-class',
					range: this.range,
					children: this.children.map(c => c.toObj()),
				};
			}
		}

		const data = this._renderer;
		let promptResult = '';

		function walk(item: /*PromptTreeElement |*/ any): RenderedNode {
			if (item.kind === 0 /* Piece */) {
				const messageClasses = [
					'SystemMessage',
					'UserMessage',
					'AssistantMessage',
				];
				const ctorName = item['_obj'].constructor.name;

				if (messageClasses.some(c => ctorName.indexOf(c) !== -1)) {
					promptResult += `\n======== ${ctorName} ========\n`;
				}

				const children = (item['_children'] as any[]).map(c => walk(c)).filter(c => c.label !== 'LineBreak');

				return new RenderedNode(ctorName, children, undefined);

			} else if (item.kind === 1 /* Text */) {
				const start = promptResult.length;
				promptResult = promptResult + item.text;
				return new RenderedNode('Text', [], [start, promptResult.length]);
			} else if (item.kind === 2 /* LineBreak */) {
				const start = promptResult.length;
				promptResult = promptResult + '\n';
				return new RenderedNode('LineBreak', [], [start, promptResult.length]);
			}
			throw new Error();
		}

		const n = walk(data['_root']);

		const d = {
			root: n.toObj(),
			source: promptResult,
			...{ $fileExtension: 'ast.w' },
		};

		return d;
	}
}

export class VisualizationTestRun {
	private static _instance: VisualizationTestRun | undefined = undefined;
	public static get instance() { return this._instance; }

	public static startRun() {
		this._instance = new VisualizationTestRun();
	}

	private readonly g = globalThis as any as IDebugValueEditorGlobals;

	private _data: readonly any[] = [];
	private _knownLabels: Set<string> = new Set();

	constructor() {
		this.g.$$debugValueEditor_properties = [];
	}

	public addData(label: string, getData: () => unknown, suffix?: string, property?: string): void {
		const propertyName = 'debugValueProperty###' + label;
		(globalThis as any)[propertyName] = () => {
			const data = getData();
			if (suffix) {
				return { [suffix]: data };
			}
			return data;
		};

		if (!this._knownLabels.has(propertyName)) {
			this._knownLabels.add(propertyName);
			const suffixStr = suffix ? `.${suffix}` : '';
			this._data = [...this._data, { label, expression: `globalThis[${JSON.stringify(propertyName)}]()${suffixStr}${property ?? ''}` }];
			this.g.$$debugValueEditor_properties = this._data;
		} else {
			this.g.$$debugValueEditor_refresh?.('{}');
		}
	}

	public reload(): void {
		this.g.$$debugValueEditor_refresh?.('{}');
	}
}
