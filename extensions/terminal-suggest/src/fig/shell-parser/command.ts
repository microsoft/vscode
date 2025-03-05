/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NodeType, BaseNode, createTextNode, parse } from './parser.js';
import { ConvertCommandError, SubstituteAliasError } from './errors.js';

export * from './errors.js';

export type Token = {
	text: string;
	node: BaseNode;
	originalNode: BaseNode;
};

export type Command = {
	tokens: Token[];
	tree: BaseNode;

	originalTree: BaseNode;
};

export type AliasMap = Record<string, string>;

const descendantAtIndex = (
	node: BaseNode,
	index: number,
	type?: NodeType,
): BaseNode | null => {
	if (node.startIndex <= index && index <= node.endIndex) {
		const descendant = node.children
			.map((child) => descendantAtIndex(child, index, type))
			.find(Boolean);
		if (descendant) {
			return descendant;
		}
		return !type || node.type === type ? node : null;
	}
	return null;
};

export const createTextToken = (
	command: Command,
	index: number,
	text: string,
	originalNode?: BaseNode,
): Token => {
	const { tree, originalTree, tokens } = command;

	let indexDiff = 0;
	const tokenIndex = tokens.findIndex(
		(token) => index < token.originalNode.startIndex,
	);
	const token = tokens[tokenIndex];
	if (tokenIndex === 0) {
		indexDiff = token.node.startIndex - token.originalNode.startIndex;
	} else if (tokenIndex === -1) {
		indexDiff = tree.text.length - originalTree.text.length;
	} else {
		indexDiff = token.node.endIndex - token.originalNode.endIndex;
	}

	return {
		originalNode:
			originalNode || createTextNode(originalTree.text, index, text),
		node: createTextNode(text, index + indexDiff, text),
		text,
	};
};

const convertCommandNodeToCommand = (tree: BaseNode): Command => {
	if (tree.type !== NodeType.Command) {
		throw new ConvertCommandError('Cannot get tokens from non-command node');
	}

	const command = {
		originalTree: tree,
		tree,
		tokens: tree.children.map((child) => ({
			originalNode: child,
			node: child,
			text: child.innerText,
		})),
	};

	const { children, endIndex, text } = tree;
	if (
		+(children.length === 0 || children[children.length - 1].endIndex) <
		endIndex &&
		text.endsWith(' ')
	) {
		command.tokens.push(createTextToken(command, endIndex, ''));
	}
	return command;
};

const shiftByAmount = (node: BaseNode, shift: number): BaseNode => ({
	...node,
	startIndex: node.startIndex + shift,
	endIndex: node.endIndex + shift,
	children: node.children.map((child) => shiftByAmount(child, shift)),
});

export const substituteAlias = (
	command: Command,
	token: Token,
	alias: string,
): Command => {
	if (command.tokens.find((t) => t === token) === undefined) {
		throw new SubstituteAliasError('Token not in command');
	}
	const { tree } = command;

	const preAliasChars = token.node.startIndex - tree.startIndex;
	const postAliasChars = token.node.endIndex - tree.endIndex;

	const preAliasText = `${tree.text.slice(0, preAliasChars)}`;
	const postAliasText = postAliasChars
		? `${tree.text.slice(postAliasChars)}`
		: '';

	const commandBuffer = `${preAliasText}${alias}${postAliasText}`;

	// Parse command and shift indices to align with original command.
	const parseTree = shiftByAmount(parse(commandBuffer), tree.startIndex);

	if (parseTree.children.length !== 1) {
		throw new SubstituteAliasError('Invalid alias');
	}

	const newCommand = convertCommandNodeToCommand(parseTree.children[0]);

	const [aliasStart, aliasEnd] = [
		token.node.startIndex,
		token.node.startIndex + alias.length,
	];

	let tokenIndexDiff = 0;
	let lastTokenInAlias = false;
	// Map tokens from new command back to old command to attributing the correct original nodes.
	const tokens = newCommand.tokens.map((newToken, index) => {
		const tokenInAlias =
			aliasStart < newToken.node.endIndex &&
			newToken.node.startIndex < aliasEnd;
		tokenIndexDiff += tokenInAlias && lastTokenInAlias ? 1 : 0;
		const { originalNode } = command.tokens[index - tokenIndexDiff];
		lastTokenInAlias = tokenInAlias;
		return { ...newToken, originalNode };
	});

	if (newCommand.tokens.length - command.tokens.length !== tokenIndexDiff) {
		throw new SubstituteAliasError('Error substituting alias');
	}

	return {
		originalTree: command.originalTree,
		tree: newCommand.tree,
		tokens,
	};
};

export const expandCommand = (
	command: Command,
	_cursorIndex: number,
	aliases: AliasMap,
): Command => {
	let expanded = command;
	const usedAliases = new Set();

	// Check for aliases
	let [name] = expanded.tokens;
	while (
		expanded.tokens.length > 1 &&
		name &&
		aliases[name.text] &&
		!usedAliases.has(name.text)
	) {
		// Remove quotes
		const aliasValue = aliases[name.text].replace(/^'(.*)'$/g, '$1');
		try {
			expanded = substituteAlias(expanded, name, aliasValue);
		} catch (_err) {
			// TODO(refactoring): add logger again
			// console.error('Error substituting alias');
		}
		usedAliases.add(name.text);
		[name] = expanded.tokens;
	}

	return expanded;
};

export const getCommand = (
	buffer: string,
	aliases: AliasMap,
	cursorIndex?: number,
): Command | null => {
	const index = cursorIndex === undefined ? buffer.length : cursorIndex;
	const parseTree = parse(buffer);
	const commandNode = descendantAtIndex(parseTree, index, NodeType.Command);
	if (commandNode === null) {
		return null;
	}
	const command = convertCommandNodeToCommand(commandNode);
	return expandCommand(command, index, aliases);
};

const statements = [
	NodeType.Program,
	NodeType.CompoundStatement,
	NodeType.Subshell,
	NodeType.Pipeline,
	NodeType.List,
	NodeType.Command,
];

export const getTopLevelCommands = (parseTree: BaseNode): Command[] => {
	if (parseTree.type === NodeType.Command) {
		return [convertCommandNodeToCommand(parseTree)];
	}
	if (!statements.includes(parseTree.type)) {
		return [];
	}
	const commands: Command[] = [];
	for (let i = 0; i < parseTree.children.length; i += 1) {
		commands.push(...getTopLevelCommands(parseTree.children[i]));
	}
	return commands;
};

export const getAllCommandsWithAlias = (
	buffer: string,
	aliases: AliasMap,
): Command[] => {
	const parseTree = parse(buffer);
	const commands = getTopLevelCommands(parseTree);
	return commands.map((command) =>
		expandCommand(command, command.tree.text.length, aliases),
	);
};
