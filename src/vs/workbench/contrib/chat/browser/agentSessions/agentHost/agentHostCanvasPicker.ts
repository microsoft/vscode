/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { AgentCanvasInput, IAgentCanvasType, isAgentCanvasInput } from '../../../../../../platform/agentHost/common/meta/agentCanvasMeta.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';

interface ICanvasPick extends IQuickPickItem {
	readonly canvas?: IAgentCanvasType;
}

function parseCanvasInput(text: string): AgentCanvasInput {
	const input: unknown = JSON.parse(text);
	if (!isAgentCanvasInput(input)) {
		throw new TypeError(localize('canvas.invalidInputValue', "Canvas input must contain only JSON values and finite numbers."));
	}
	return input;
}

export async function pickAgentHostCanvas(quickInputService: IQuickInputService, list: () => Promise<readonly IAgentCanvasType[]>): Promise<{ canvas: IAgentCanvasType; input?: AgentCanvasInput } | undefined> {
	let canvas: IAgentCanvasType;
	while (true) {
		const selection = await quickInputService.pick<ICanvasPick>(list().then(canvases => [
			...canvases.map(canvas => ({
				label: canvas.displayName,
				description: canvas.extensionId,
				detail: canvas.description,
				canvas,
			})),
			{ type: 'separator', label: '' },
			{
				label: localize('canvas.refresh', "Refresh Canvases"),
				description: canvases.length ? undefined : localize('canvas.empty', "No Canvas extensions available yet"),
				detail: localize('canvas.refresh.detail', "Refresh after extensions finish loading or after installing a compatible Canvas extension."),
			},
		]), {
			title: localize('canvas.open', "Open Canvas"),
			placeHolder: localize('canvas.select', "Select a canvas to open in the current chat"),
			matchOnDescription: true,
			matchOnDetail: true,
		});
		if (!selection) {
			return undefined;
		}
		if (selection.canvas) {
			canvas = selection.canvas;
			break;
		}
	}

	if (!canvas.inputSchema) {
		return { canvas };
	}
	const text = await quickInputService.input({
		title: canvas.displayName,
		prompt: localize('canvas.input', "Enter the canvas input as JSON. The Canvas extension validates this input."),
		placeHolder: canvas.description,
		value: JSON.stringify(canvas.inputSchema.default ?? {}),
		validateInput: async value => {
			try {
				parseCanvasInput(value);
				return undefined;
			} catch (error) {
				if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) {
					throw error;
				}
				return localize('canvas.invalidInput', "Enter valid JSON.");
			}
		},
	});
	if (text === undefined) {
		return undefined;
	}
	return { canvas, input: parseCanvasInput(text) };
}
