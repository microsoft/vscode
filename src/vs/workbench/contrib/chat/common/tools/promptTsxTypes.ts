/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This is a subset of the types export from jsonTypes.d.ts in @vscode/prompt-tsx.
 * It's just the types needed to stringify prompt-tsx tool results.
 * It should be kept in sync with the types in that file.
 */

export declare const enum PromptNodeType {
	Piece = 1,
	Text = 2
}
export interface TextJSON {
	type: PromptNodeType.Text;
	text: string;
	lineBreakBefore: boolean | undefined;
}
/**
 * Constructor kind of the node represented by {@link PieceJSON}. This is
 * less descriptive than the actual constructor, as we only care to preserve
 * the element data that the renderer cares about.
 */
export declare const enum PieceCtorKind {
	BaseChatMessage = 1,
	Other = 2,
	ImageChatMessage = 3
}
export interface BasePieceJSON {
	type: PromptNodeType.Piece;
	ctor: PieceCtorKind.BaseChatMessage | PieceCtorKind.Other;
	children: PromptNodeJSON[];
}
export interface ImageChatMessagePieceJSON {
	type: PromptNodeType.Piece;
	ctor: PieceCtorKind.ImageChatMessage;
	children: PromptNodeJSON[];
	props: {
		src: string;
		detail?: 'low' | 'high';
	};
}
export type PieceJSON = BasePieceJSON | ImageChatMessagePieceJSON;
export type PromptNodeJSON = PieceJSON | TextJSON;
export interface PromptElementJSON {
	node: PieceJSON;
}

export function stringifyPromptElementJSON(element: PromptElementJSON): string {
	const strs: string[] = [];
	stringifyPromptNodeJSON(element.node, strs);
	return strs.join('');
}

function stringifyPromptNodeJSON(node: PromptNodeJSON, strs: string[]): void {
	if (node.type === PromptNodeType.Text) {
		if (node.lineBreakBefore) {
			strs.push('\n');
		}

		if (typeof node.text === 'string') {
			strs.push(node.text);
		}
	} else if (node.ctor === PieceCtorKind.ImageChatMessage) {
		// This case currently can't be hit by prompt-tsx
		strs.push('<image>');
	} else if (node.ctor === PieceCtorKind.BaseChatMessage || node.ctor === PieceCtorKind.Other) {
		for (const child of node.children) {
			stringifyPromptNodeJSON(child, strs);
		}
	}
}
