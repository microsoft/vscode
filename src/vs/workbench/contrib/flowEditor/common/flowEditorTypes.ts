/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from 'vs/base/common/assert';

export const enum NodeKind {
	Command = 'command',
	OwnedCommand = 'ownedCommand',

	Prompt = 'prompt',
	Regex = 'regex',
	Condition = 'condition',
	SpawnProcess = 'spawn',
	Value = 'value',
	Fetch = 'fetch',
	ExtractJson = 'extractJson',

	RunCommand = 'runCommand',
	Notify = 'notify',
	StartChat = 'startChat',
}

//#region Triggers
export const enum TriggerKind {
}

export interface ICommandTrigger {
	kind: NodeKind.Command;
	command: string;
}

export interface IOwnedCommandTrigger {
	kind: NodeKind.OwnedCommand;
	command: string;
	label: string;
}

export type FlowTrigger = ICommandTrigger | IOwnedCommandTrigger;
//#endregion

//#region Filters
export interface IPromptFilter {
	kind: NodeKind.Prompt;
	family?: string;
	prompt: string;
	inputs: (IFlowConnection | null)[];
}

export interface IRegexFilter {
	kind: NodeKind.Regex;
	re: string;
	flags: string;
	input: IFlowConnection | null;
}

export interface IConditionFilter {
	kind: NodeKind.Condition;
	condition: string;
	inputs: (IFlowConnection | null)[];
}

export interface IValueFilter {
	kind: NodeKind.Value;
	value: string;
	inputs: (IFlowConnection | null)[];
}

export interface ISpawnProcessFilter {
	kind: NodeKind.SpawnProcess;
	command: IFlowConnection | null;
	cwd: IFlowConnection | null;
}

export interface IFetchURLFilter {
	kind: NodeKind.Fetch;
	url: IFlowConnection | null;
}

export interface IExtractJsonFilter {
	kind: NodeKind.ExtractJson;
	path: string;
	input: IFlowConnection | null;
}

export type FlowFilter = IPromptFilter | IRegexFilter | IConditionFilter | ISpawnProcessFilter | IValueFilter | IFetchURLFilter | IExtractJsonFilter;
//#endregion

//#region Actions
export interface ICommandAction {
	kind: NodeKind.RunCommand;
	command: IFlowConnection | null;
	args: (IFlowConnection | null)[];
}

export interface INotifyAction {
	kind: NodeKind.Notify;
	message: IFlowConnection | null;
}

export interface IStartChatAction {
	kind: NodeKind.StartChat;
	query: IFlowConnection | null;
}

export type FlowAction = ICommandAction | INotifyAction | IStartChatAction;
//#endregion

//#region General
export interface IFlowConstant { value: unknown }
export interface IFlowConnection { sourceId: number; sourceIndex: number }

export type FlowNode = FlowTrigger | FlowFilter | FlowAction;

export interface IFlowNode<T = FlowNode> {
	node: T;
	id: number;
	x: number;
	y: number;
}

export interface IFlowGraphData {
	nodes: IFlowNode[];
}

export namespace IFlowGraphData {
	export function empty(): IFlowGraphData {
		return { nodes: [] };
	}
}
//#endregion

//#region Actualized nodes

export interface IFlowNodeOutputDescriptor {
	name: string;
}

export interface IActualizedNode<T = FlowNode> {
	readonly node: T;
	resetOutputAfterFire?: boolean;
	/** Whether there are unlimited inputs to this node type */
	properties: string[];
	/** A list of node inputs. These contain real edge data as defined by the user */
	inputs?: (IFlowConnection | null)[];
}

const trimUndefinedFromEnd = <T>(arr: T[]): T[] => {
	let i = arr.length;
	while (i > 0 && (arr[i - 1] === undefined || arr[i - 1] === null)) {
		i--;
	}
	return arr.slice(0, i);
};

export namespace IActualizedNode {
	export const create = <T extends FlowNode>(node: T): IActualizedNode<T> => {
		switch (node.kind) {
			case NodeKind.Command:
				return { node, properties: ['command'], resetOutputAfterFire: true };
			case NodeKind.OwnedCommand:
				return { node, properties: ['command', 'label'], resetOutputAfterFire: true };

			case NodeKind.Prompt:
				return { node, properties: ['prompt', 'family'], inputs: trimUndefinedFromEnd(node.inputs) };
			case NodeKind.Regex: {
				return {
					node,
					inputs: [node.input],
					properties: ['re', 'flags'],
				};
			}
			case NodeKind.Condition:
				return {
					node,
					inputs: trimUndefinedFromEnd(node.inputs),
					properties: ['condition'],
				};
			case NodeKind.Value:
				return {
					node,
					inputs: trimUndefinedFromEnd(node.inputs),
					properties: ['value'],
				};
			case NodeKind.SpawnProcess:
				return {
					node,
					inputs: [node.command, node.cwd],
					properties: [],
				};
			case NodeKind.Fetch:
				return {
					node,
					inputs: [node.url],
					properties: [],
				};
			case NodeKind.ExtractJson:
				return {
					node,
					inputs: [node.input],
					properties: ['path'],
				};
			case NodeKind.StartChat:
				return {
					node,
					inputs: [node.query],
					properties: [],
				};

			case NodeKind.RunCommand:
				return {
					node,
					properties: ['command'],
					inputs: trimUndefinedFromEnd(node.args),
				};
			case NodeKind.Notify:
				return {
					node,
					properties: [],
					inputs: [node.message],
				};

			default:
				assertNever(node);
		}
	};

}
