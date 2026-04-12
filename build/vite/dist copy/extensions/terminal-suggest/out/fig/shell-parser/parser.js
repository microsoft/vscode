"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = exports.printTree = exports.createTextNode = exports.NodeType = void 0;
// Loosely follows the following grammar:
// terminator = ";" | "&" | "&;"
// literal = string | ansi_c_string | raw_string | expansion | simple_expansion | word
// concatenation = literal literal
// command = (concatenation | literal)+
//
// variable_name = word
// subscript = variable_name"["literal"]"
// assignment = (word | subscript)("=" | "+=")literal
// assignment_list = assignment+ command?
//
// statement =
//    | "{" (statement terminator)+ "}"
//    | "(" statements ")"
//    | statement "||" statement
//    | statement "&&" statement
//    | statement "|" statement
//    | statement "|&" statement
//    | command
//    | assignment_list
//
// statements = (statement terminator)* statement terminator?
// program = statements
var NodeType;
(function (NodeType) {
    NodeType["Program"] = "program";
    NodeType["AssignmentList"] = "assignment_list";
    NodeType["Assignment"] = "assignment";
    NodeType["VariableName"] = "variable_name";
    NodeType["Subscript"] = "subscript";
    NodeType["CompoundStatement"] = "compound_statement";
    NodeType["Subshell"] = "subshell";
    NodeType["Command"] = "command";
    NodeType["Pipeline"] = "pipeline";
    NodeType["List"] = "list";
    // TODO: implement <(commands)
    NodeType["ProcessSubstitution"] = "process_substitution";
    // Primary expressions
    NodeType["Concatenation"] = "concatenation";
    NodeType["Word"] = "word";
    NodeType["String"] = "string";
    NodeType["Expansion"] = "expansion";
    NodeType["CommandSubstitution"] = "command_substitution";
    // Leaf Nodes
    NodeType["RawString"] = "raw_string";
    NodeType["AnsiCString"] = "ansi_c_string";
    NodeType["SimpleExpansion"] = "simple_expansion";
    NodeType["SpecialExpansion"] = "special_expansion";
    NodeType["ArithmeticExpansion"] = "arithmetic_expansion";
})(NodeType || (exports.NodeType = NodeType = {}));
const operators = [';', '&', '&;', '|', '|&', '&&', '||'];
const parseOperator = (str, index) => {
    const c = str.charAt(index);
    if (['&', ';', '|'].includes(c)) {
        const op = str.slice(index, index + 2);
        return operators.includes(op)
            ? op
            : c;
    }
    return null;
};
const getInnerText = (node) => {
    const { children, type, complete, text } = node;
    if (type === NodeType.Concatenation) {
        return children.reduce((current, child) => current + child.innerText, '');
    }
    const terminalCharsMapping = {
        [NodeType.String]: ['"', '"'],
        [NodeType.RawString]: ['\'', '\''],
        [NodeType.AnsiCString]: ['$\'', '\''],
    };
    const terminalChars = terminalCharsMapping[type] ?? ['', ''];
    const startChars = terminalChars[0];
    const endChars = !complete ? '' : terminalChars[1];
    let innerText = '';
    for (let i = startChars.length; i < text.length - endChars.length; i += 1) {
        const c = text.charAt(i);
        const isWordEscape = c === '\\' && type === NodeType.Word;
        const isStringEscape = c === '\\' &&
            type === NodeType.String &&
            '$`"\\\n'.includes(text.charAt(i + 1));
        if (isWordEscape || isStringEscape) {
            i += 1;
        }
        innerText += text.charAt(i);
    }
    return innerText;
};
const createNode = (str, partial) => {
    // eslint-disable-next-line local/code-no-dangerous-type-assertions
    const node = {
        startIndex: 0,
        type: NodeType.Word,
        endIndex: str.length,
        text: '',
        innerText: '',
        complete: true,
        children: [],
        ...partial,
    };
    const text = str.slice(node.startIndex, node.endIndex);
    const innerText = getInnerText({ ...node, text });
    return { ...node, text, innerText };
};
const createTextNode = (str, startIndex, text) => createNode(str, { startIndex, text, endIndex: startIndex + text.length });
exports.createTextNode = createTextNode;
const nextWordIndex = (str, index) => {
    const firstChar = str.slice(index).search(/\S/);
    if (firstChar === -1) {
        return -1;
    }
    return index + firstChar;
};
// Parse simple variable expansion ($foo or $$)
const parseSimpleExpansion = (str, index, terminalChars) => {
    const node = {
        startIndex: index,
        type: NodeType.SimpleExpansion,
    };
    if (str.length > index + 1 && '*@?-$0_'.includes(str.charAt(index + 1))) {
        return createNode(str, {
            ...node,
            type: NodeType.SpecialExpansion,
            endIndex: index + 2,
        });
    }
    const terminalSymbols = ['\t', ' ', '\n', '$', '\\', ...terminalChars];
    let i = index + 1;
    for (; i < str.length; i += 1) {
        if (terminalSymbols.includes(str.charAt(i))) {
            // Parse a literal $ if last token
            return i === index + 1
                ? null
                : createNode(str, {
                    ...node,
                    endIndex: i,
                });
        }
    }
    return createNode(str, {
        ...node,
        endIndex: i,
    });
};
// Parse command substitution $(foo) or `foo`
function parseCommandSubstitution(str, startIndex, terminalChar) {
    const index = str.charAt(startIndex) === '`' ? startIndex + 1 : startIndex + 2;
    const { statements: children, terminatorIndex } = parseStatements(str, index, terminalChar);
    const terminated = terminatorIndex !== -1;
    return createNode(str, {
        startIndex,
        type: NodeType.CommandSubstitution,
        complete: terminated && children.length !== 0,
        endIndex: terminated ? terminatorIndex + 1 : str.length,
        children,
    });
}
const parseString = parseLiteral(NodeType.String, '"', '"');
const parseRawString = parseLiteral(NodeType.RawString, '\'', '\'');
const parseExpansion = parseLiteral(NodeType.Expansion, '${', '}');
const parseAnsiCString = parseLiteral(NodeType.AnsiCString, '$\'', '\'');
const parseArithmeticExpansion = parseLiteral(NodeType.ArithmeticExpansion, '$((', '))');
function childAtIndex(str, index, inString, terminators) {
    const lookahead = [
        str.charAt(index),
        str.charAt(index + 1),
        str.charAt(index + 2),
    ];
    switch (lookahead[0]) {
        case '$':
            if (lookahead[1] === '(') {
                return lookahead[2] === '('
                    ? parseArithmeticExpansion(str, index)
                    : parseCommandSubstitution(str, index, ')');
            }
            if (lookahead[1] === '{') {
                return parseExpansion(str, index);
            }
            if (!inString && lookahead[1] === '\'') {
                return parseAnsiCString(str, index);
            }
            return parseSimpleExpansion(str, index, terminators);
        case '`':
            return parseCommandSubstitution(str, index, '`');
        case '\'':
            return inString ? null : parseRawString(str, index);
        case '"':
            return inString ? null : parseString(str, index);
        default:
            return null;
    }
}
function parseLiteral(type, startChars, endChars) {
    const canHaveChildren = type === NodeType.Expansion || type === NodeType.String;
    const isString = type === NodeType.String;
    return (str, startIndex) => {
        const children = [];
        for (let i = startIndex + startChars.length; i < str.length; i += 1) {
            const child = canHaveChildren
                ? childAtIndex(str, i, isString, [endChars])
                : null;
            if (child !== null) {
                children.push(child);
                i = child.endIndex - 1;
            }
            else if (str.charAt(i) === '\\' && type !== NodeType.RawString) {
                i += 1;
            }
            else if (str.slice(i, i + endChars.length) === endChars) {
                return createNode(str, {
                    startIndex,
                    type,
                    children,
                    endIndex: i + endChars.length,
                });
            }
        }
        return createNode(str, {
            startIndex,
            type,
            children,
            complete: false,
        });
    };
}
function parseStatements(str, index, terminalChar, mustTerminate = false) {
    const statements = [];
    let i = index;
    while (i < str.length) {
        // Will only exit on EOF, terminalChar or terminator symbol (;, &, &;)
        let statement = parseStatement(str, i, mustTerminate ? '' : terminalChar);
        const opIndex = nextWordIndex(str, statement.endIndex);
        const reachedEnd = opIndex === -1;
        if (!mustTerminate && !reachedEnd && terminalChar === str.charAt(opIndex)) {
            statements.push(statement);
            return { statements, terminatorIndex: opIndex };
        }
        if (reachedEnd) {
            statements.push(statement);
            break;
        }
        const op = !reachedEnd && parseOperator(str, opIndex);
        if (op) {
            // Terminator symbol, ; | & | &;
            i = opIndex + op.length;
            const nextIndex = nextWordIndex(str, i);
            statements.push(statement);
            if (nextIndex !== -1 && str.charAt(nextIndex) === terminalChar) {
                return { statements, terminatorIndex: nextIndex };
            }
        }
        else {
            // Missing terminator but still have tokens left.
            // assignments do not require terminators
            statement = createNode(str, {
                ...statement,
                complete: statement.type === NodeType.AssignmentList
                    ? statement.complete
                    : false,
            });
            statements.push(statement);
            i = opIndex;
        }
    }
    return { statements, terminatorIndex: -1 };
}
const parseConcatenationOrLiteralNode = (str, startIndex, terminalChar) => {
    const children = [];
    let argumentChildren = [];
    let wordStart = -1;
    const endWord = (endIndex) => {
        if (wordStart !== -1) {
            const word = createNode(str, {
                startIndex: wordStart,
                endIndex,
            });
            argumentChildren.push(word);
        }
        wordStart = -1;
    };
    const endArgument = (endIndex) => {
        endWord(endIndex);
        let [argument] = argumentChildren;
        if (argumentChildren.length > 1) {
            const finalPart = argumentChildren[argumentChildren.length - 1];
            argument = createNode(str, {
                startIndex: argumentChildren[0].startIndex,
                type: NodeType.Concatenation,
                endIndex: finalPart.endIndex,
                complete: finalPart.complete,
                children: argumentChildren,
            });
        }
        if (argument) {
            children.push(argument);
        }
        argumentChildren = [];
    };
    const terminators = ['&', '|', ';', '\n', '\'', '"', '`'];
    if (terminalChar) {
        terminators.push(terminalChar);
    }
    let i = startIndex;
    for (; i < str.length; i += 1) {
        const c = str.charAt(i);
        const op = parseOperator(str, i);
        if (op !== null || c === terminalChar) {
            // TODO: handle terminator like ; as first token.
            break;
        }
        const childNode = childAtIndex(str, i, false, terminators);
        if (childNode !== null) {
            endWord(i);
            argumentChildren.push(childNode);
            i = childNode.endIndex - 1;
        }
        else if ([' ', '\t'].includes(c)) {
            endArgument(i);
        }
        else {
            if (c === '\\') {
                i += 1;
            }
            if (wordStart === -1) {
                wordStart = i;
            }
        }
    }
    endArgument(i);
    return { children, endIndex: i };
};
function parseCommand(str, idx, terminalChar) {
    const startIndex = Math.max(nextWordIndex(str, idx), idx);
    const { children, endIndex } = parseConcatenationOrLiteralNode(str, startIndex, terminalChar);
    return createNode(str, {
        startIndex,
        type: NodeType.Command,
        complete: children.length > 0,
        // Extend command up to separator.
        endIndex: children.length > 0 ? endIndex : str.length,
        children,
    });
}
const parseAssignmentNode = (str, startIndex) => {
    const equalsIndex = str.indexOf('=', startIndex);
    const operator = str.charAt(equalsIndex - 1) === '+' ? '+=' : '=';
    const firstOperatorCharIndex = operator === '=' ? equalsIndex : equalsIndex - 1;
    const firstSquareBracketIndex = str
        .slice(startIndex, firstOperatorCharIndex)
        .indexOf('[');
    let nameNode;
    const variableName = createNode(str, {
        type: NodeType.VariableName,
        startIndex,
        endIndex: firstSquareBracketIndex !== -1
            ? firstSquareBracketIndex
            : firstOperatorCharIndex,
    });
    if (firstSquareBracketIndex !== -1) {
        const index = createNode(str, {
            type: NodeType.Word,
            startIndex: firstSquareBracketIndex + 1,
            endIndex: firstOperatorCharIndex - 1,
        });
        nameNode = createNode(str, {
            type: NodeType.Subscript,
            name: variableName,
            startIndex,
            endIndex: index.endIndex + 1,
            children: [index],
        });
    }
    else {
        nameNode = variableName;
    }
    const { children, endIndex } = parseConcatenationOrLiteralNode(str, equalsIndex + 1, ' ');
    return createNode(str, {
        name: nameNode,
        startIndex,
        endIndex,
        type: NodeType.Assignment,
        operator,
        children,
        complete: children[children.length - 1].complete,
    });
};
const parseAssignments = (str, index) => {
    const variables = [];
    let lastVariableEnd = index;
    while (lastVariableEnd < str.length) {
        const nextTokenStart = nextWordIndex(str, lastVariableEnd);
        if (/^[\w[\]]+\+?=.*/.test(str.slice(nextTokenStart))) {
            const assignmentNode = parseAssignmentNode(str, nextTokenStart);
            variables.push(assignmentNode);
            lastVariableEnd = assignmentNode.endIndex;
        }
        else {
            return variables;
        }
    }
    return variables;
};
const parseAssignmentListNodeOrCommandNode = (str, startIndex, terminalChar) => {
    const assignments = parseAssignments(str, startIndex);
    if (assignments.length > 0) {
        const lastAssignment = assignments[assignments.length - 1];
        const operator = parseOperator(str, nextWordIndex(str, lastAssignment.endIndex));
        let command;
        if (!operator &&
            lastAssignment.complete &&
            lastAssignment.endIndex !== str.length) {
            command = parseCommand(str, lastAssignment.endIndex, terminalChar);
        }
        // if it makes sense to parse a command here do it else return the list
        return createNode(str, {
            type: NodeType.AssignmentList,
            startIndex,
            endIndex: command ? command.endIndex : lastAssignment.endIndex,
            hasCommand: !!command,
            children: command ? [...assignments, command] : assignments,
        });
    }
    return parseCommand(str, startIndex, terminalChar);
};
const reduceStatements = (str, lhs, rhs, type) => createNode(str, {
    type,
    startIndex: lhs.startIndex,
    children: rhs.type === type ? [lhs, ...rhs.children] : [lhs, rhs],
    endIndex: rhs.endIndex,
    complete: lhs.complete && rhs.complete,
});
function parseStatement(str, index, terminalChar) {
    let i = nextWordIndex(str, index);
    i = i === -1 ? index : i;
    let statement = null;
    if (['{', '('].includes(str.charAt(i))) {
        // Parse compound statement or subshell
        const isCompound = str.charAt(i) === '{';
        const endChar = isCompound ? '}' : ')';
        const { statements: children, terminatorIndex } = parseStatements(str, i + 1, endChar, isCompound);
        const hasChildren = children.length > 0;
        const terminated = terminatorIndex !== -1;
        let endIndex = terminatorIndex + 1;
        if (!terminated) {
            endIndex = hasChildren
                ? children[children.length - 1].endIndex
                : str.length;
        }
        statement = createNode(str, {
            startIndex: i,
            type: isCompound ? NodeType.CompoundStatement : NodeType.Subshell,
            endIndex,
            complete: terminated && hasChildren,
            children,
        });
    }
    else {
        // statement = parseAssignmentListNodeOrCommandNode(str, i, terminalChar)
        statement = parseAssignmentListNodeOrCommandNode(str, i, terminalChar);
    }
    i = statement.endIndex;
    const opIndex = nextWordIndex(str, i);
    const op = opIndex !== -1 && parseOperator(str, opIndex);
    if (!op ||
        op === ';' ||
        op === '&' ||
        op === '&;' ||
        (opIndex !== -1 && terminalChar && str.charAt(opIndex) === terminalChar)) {
        return statement;
    }
    // Recursively parse rightHandStatement if theres an operator.
    const rightHandStatement = parseStatement(str, opIndex + op.length, terminalChar);
    if (op === '&&' || op === '||') {
        return reduceStatements(str, statement, rightHandStatement, NodeType.List);
    }
    if (op === '|' || op === '|&') {
        if (rightHandStatement.type === NodeType.List) {
            const [oldFirstChild, ...otherChildren] = rightHandStatement.children;
            const newFirstChild = reduceStatements(str, statement, oldFirstChild, NodeType.Pipeline);
            return createNode(str, {
                type: NodeType.List,
                startIndex: newFirstChild.startIndex,
                children: [newFirstChild, ...otherChildren],
                endIndex: rightHandStatement.endIndex,
                complete: newFirstChild.complete && rightHandStatement.complete,
            });
        }
        return reduceStatements(str, statement, rightHandStatement, NodeType.Pipeline);
    }
    return statement;
}
const printTree = (root) => {
    const getNodeText = (node, level = 0) => {
        const indent = ' '.repeat(level);
        let nodeText = `${indent}${node.type} [${node.startIndex},  ${node.endIndex}] - ${node.text}`;
        const childrenText = node.children
            .map((child) => getNodeText(child, level + 1))
            .join('\n');
        if (childrenText) {
            nodeText += `\n${childrenText}`;
        }
        if (!node.complete) {
            nodeText += `\n${indent}INCOMPLETE`;
        }
        return nodeText;
    };
    console.log(getNodeText(root));
};
exports.printTree = printTree;
const parse = (str) => createNode(str, {
    startIndex: 0,
    type: NodeType.Program,
    children: parseStatements(str, 0, '').statements,
});
exports.parse = parse;
//# sourceMappingURL=parser.js.map