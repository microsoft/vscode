"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCommandsWithAlias = exports.getTopLevelCommands = exports.getCommand = exports.expandCommand = exports.substituteAlias = exports.createTextToken = void 0;
const parser_js_1 = require("./parser.js");
const errors_js_1 = require("./errors.js");
__exportStar(require("./errors.js"), exports);
const descendantAtIndex = (node, index, type) => {
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
const createTextToken = (command, index, text, originalNode) => {
    const { tree, originalTree, tokens } = command;
    let indexDiff = 0;
    const tokenIndex = tokens.findIndex((token) => index < token.originalNode.startIndex);
    const token = tokens[tokenIndex];
    if (tokenIndex === 0) {
        indexDiff = token.node.startIndex - token.originalNode.startIndex;
    }
    else if (tokenIndex === -1) {
        indexDiff = tree.text.length - originalTree.text.length;
    }
    else {
        indexDiff = token.node.endIndex - token.originalNode.endIndex;
    }
    return {
        originalNode: originalNode || (0, parser_js_1.createTextNode)(originalTree.text, index, text),
        node: (0, parser_js_1.createTextNode)(text, index + indexDiff, text),
        text,
    };
};
exports.createTextToken = createTextToken;
const convertCommandNodeToCommand = (tree) => {
    if (tree.type !== parser_js_1.NodeType.Command) {
        throw new errors_js_1.ConvertCommandError('Cannot get tokens from non-command node');
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
    if (+(children.length === 0 || children[children.length - 1].endIndex) <
        endIndex &&
        text.endsWith(' ')) {
        command.tokens.push((0, exports.createTextToken)(command, endIndex, ''));
    }
    return command;
};
const shiftByAmount = (node, shift) => ({
    ...node,
    startIndex: node.startIndex + shift,
    endIndex: node.endIndex + shift,
    children: node.children.map((child) => shiftByAmount(child, shift)),
});
const substituteAlias = (command, token, alias) => {
    if (command.tokens.find((t) => t === token) === undefined) {
        throw new errors_js_1.SubstituteAliasError('Token not in command');
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
    const parseTree = shiftByAmount((0, parser_js_1.parse)(commandBuffer), tree.startIndex);
    if (parseTree.children.length !== 1) {
        throw new errors_js_1.SubstituteAliasError('Invalid alias');
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
        const tokenInAlias = aliasStart < newToken.node.endIndex &&
            newToken.node.startIndex < aliasEnd;
        tokenIndexDiff += tokenInAlias && lastTokenInAlias ? 1 : 0;
        const { originalNode } = command.tokens[index - tokenIndexDiff];
        lastTokenInAlias = tokenInAlias;
        return { ...newToken, originalNode };
    });
    if (newCommand.tokens.length - command.tokens.length !== tokenIndexDiff) {
        throw new errors_js_1.SubstituteAliasError('Error substituting alias');
    }
    return {
        originalTree: command.originalTree,
        tree: newCommand.tree,
        tokens,
    };
};
exports.substituteAlias = substituteAlias;
const expandCommand = (command, _cursorIndex, aliases) => {
    let expanded = command;
    const usedAliases = new Set();
    // Check for aliases
    let [name] = expanded.tokens;
    while (expanded.tokens.length > 1 &&
        name &&
        aliases[name.text] &&
        !usedAliases.has(name.text)) {
        // Remove quotes
        const aliasValue = aliases[name.text].replace(/^'(.*)'$/g, '$1');
        try {
            expanded = (0, exports.substituteAlias)(expanded, name, aliasValue);
        }
        catch (_err) {
            // TODO(refactoring): add logger again
            // console.error('Error substituting alias');
        }
        usedAliases.add(name.text);
        [name] = expanded.tokens;
    }
    return expanded;
};
exports.expandCommand = expandCommand;
const getCommand = (buffer, aliases, cursorIndex) => {
    const index = cursorIndex === undefined ? buffer.length : cursorIndex;
    const parseTree = (0, parser_js_1.parse)(buffer);
    const commandNode = descendantAtIndex(parseTree, index, parser_js_1.NodeType.Command);
    if (commandNode === null) {
        return null;
    }
    const command = convertCommandNodeToCommand(commandNode);
    return (0, exports.expandCommand)(command, index, aliases);
};
exports.getCommand = getCommand;
const statements = [
    parser_js_1.NodeType.Program,
    parser_js_1.NodeType.CompoundStatement,
    parser_js_1.NodeType.Subshell,
    parser_js_1.NodeType.Pipeline,
    parser_js_1.NodeType.List,
    parser_js_1.NodeType.Command,
];
const getTopLevelCommands = (parseTree) => {
    if (parseTree.type === parser_js_1.NodeType.Command) {
        return [convertCommandNodeToCommand(parseTree)];
    }
    if (!statements.includes(parseTree.type)) {
        return [];
    }
    const commands = [];
    for (let i = 0; i < parseTree.children.length; i += 1) {
        commands.push(...(0, exports.getTopLevelCommands)(parseTree.children[i]));
    }
    return commands;
};
exports.getTopLevelCommands = getTopLevelCommands;
const getAllCommandsWithAlias = (buffer, aliases) => {
    const parseTree = (0, parser_js_1.parse)(buffer);
    const commands = (0, exports.getTopLevelCommands)(parseTree);
    return commands.map((command) => (0, exports.expandCommand)(command, command.tree.text.length, aliases));
};
exports.getAllCommandsWithAlias = getAllCommandsWithAlias;
//# sourceMappingURL=command.js.map