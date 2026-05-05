/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { splitLinesIncludeSeparators } from '../../../../base/common/strings.js';
import { parse, type YamlMapNode, type YamlNode, type YamlParseError } from '../../../../base/common/yaml.js';

export interface IParsedCustomAgentMarkdown {
	readonly name?: string;
	readonly description?: string;
	readonly tools?: string[];
	readonly infer?: boolean;
	readonly body: string;
}

/**
 * Parses the lightweight `.agent.md` subset needed by the Agent Host.
 */
export function parseCustomAgentMarkdown(content: string): IParsedCustomAgentMarkdown {
	const linesWithEOL = splitLinesIncludeSeparators(content);
	let bodyStartLine = 0;
	let headerContent: string | undefined;

	if (linesWithEOL.length > 0 && isFrontMatterDelimiter(linesWithEOL[0])) {
		let headerEndLine = linesWithEOL.findIndex((line, index) => index > 0 && isFrontMatterDelimiter(line));
		if (headerEndLine === -1) {
			headerEndLine = linesWithEOL.length;
			bodyStartLine = linesWithEOL.length;
		} else {
			bodyStartLine = headerEndLine + 1;
		}
		headerContent = linesWithEOL.slice(1, headerEndLine).join('');
	}

	const body = bodyStartLine < linesWithEOL.length ? linesWithEOL.slice(bodyStartLine).join('') : '';
	return { ...parseCustomAgentHeader(headerContent), body };
}

function isFrontMatterDelimiter(line: string): boolean {
	return /^---[\s\r\n]*$/.test(line);
}

function parseCustomAgentHeader(headerContent: string | undefined): Omit<IParsedCustomAgentMarkdown, 'body'> {
	if (headerContent === undefined) {
		return {};
	}

	const yamlErrors: YamlParseError[] = [];
	const node = parse(headerContent, yamlErrors);
	if (node?.type !== 'map') {
		return {};
	}

	const name = getScalarAttribute(node, 'name');
	const description = getScalarAttribute(node, 'description');
	const tools = getToolsAttribute(node);
	const infer = getBooleanAttribute(node, 'infer');
	return {
		...(name !== undefined ? { name } : {}),
		...(description !== undefined ? { description } : {}),
		...(tools !== undefined ? { tools } : {}),
		...(infer !== undefined ? { infer } : {}),
	};
}

function getAttribute(node: YamlMapNode, key: string): YamlNode | undefined {
	return node.properties.find(property => property.key.value === key)?.value;
}

function getScalarAttribute(node: YamlMapNode, key: string): string | undefined {
	const attribute = getAttribute(node, key);
	if (attribute?.type === 'scalar') {
		return attribute.value;
	}
	return undefined;
}

function getBooleanAttribute(node: YamlMapNode, key: string): boolean | undefined {
	const value = getScalarAttribute(node, key);
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}
	return undefined;
}

function getToolsAttribute(node: YamlMapNode): string[] | undefined {
	const attribute = getAttribute(node, 'tools');
	if (!attribute) {
		return undefined;
	}
	if (attribute.type === 'scalar') {
		return parseCommaSeparatedTools(attribute.value);
	}
	if (attribute.type === 'sequence') {
		const tools: string[] = [];
		for (const item of attribute.items) {
			if (item.type === 'scalar' && item.value) {
				tools.push(item.value);
			}
		}
		return tools;
	}
	return undefined;
}

function parseCommaSeparatedTools(input: string): string[] {
	const tools: string[] = [];
	let pos = 0;
	const isWhitespace = (char: string): boolean => char === ' ' || char === '\t';

	while (pos < input.length) {
		while (pos < input.length && isWhitespace(input[pos])) {
			pos++;
		}

		if (pos >= input.length) {
			break;
		}

		let value = '';
		const char = input[pos];
		if (char === '"' || char === `'`) {
			const quote = char;
			pos++;

			while (pos < input.length && input[pos] !== quote) {
				value += input[pos];
				pos++;
			}

			if (pos < input.length) {
				pos++;
			}
		} else {
			while (pos < input.length && input[pos] !== ',') {
				value += input[pos];
				pos++;
			}
			value = value.trimEnd();
		}

		if (value) {
			tools.push(value);
		}

		while (pos < input.length && isWhitespace(input[pos])) {
			pos++;
		}

		if (pos < input.length && input[pos] === ',') {
			pos++;
		}
	}

	return tools;
}
