/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';

interface ToolCardProps {
	name: string;
	input?: unknown;
}

/**
 * Categorise a tool by its conventional name so the card can pick a fitting
 * accent colour and icon. Mirrors the four auto-approval categories used in
 * the IDE (read / write / shell / mcp) so the visual grouping a user learns
 * here transfers to the policy controls in `sota config set`.
 */
function categorise(name: string): { tone: 'read' | 'write' | 'shell' | 'mcp' | 'misc'; icon: string; label: string } {
	const lower = name.toLowerCase();
	if (/(read|get|list|search|find|fetch|grep|cat|view)/.test(lower)) {
		return { tone: 'read', icon: '○', label: 'read' };
	}
	if (/(write|edit|patch|apply|create|update|delete|rm)/.test(lower)) {
		return { tone: 'write', icon: '●', label: 'write' };
	}
	if (/(shell|run|exec|bash|terminal|command)/.test(lower)) {
		return { tone: 'shell', icon: '▶', label: 'shell' };
	}
	if (/(mcp|graph|qdrant|falkor|server)/.test(lower)) {
		return { tone: 'mcp', icon: '◈', label: 'mcp' };
	}
	return { tone: 'misc', icon: '·', label: 'tool' };
}

const TONE_COLOR: Record<ReturnType<typeof categorise>['tone'], string> = {
	read: 'green',
	write: 'yellow',
	shell: 'red',
	mcp: 'cyan',
	misc: 'gray',
};

/**
 * Compact, multi-line preview of a tool call's input arguments. Strings are
 * shown as `key: "value"`, numbers / booleans inline, complex types collapse
 * to `[object]` with their JSON length so the card stays scannable but the
 * user still sees what tools are being asked to do.
 */
function previewInput(input: unknown): ReadonlyArray<string> {
	if (input === undefined || input === null) {
		return [];
	}
	if (typeof input !== 'object') {
		return [String(input)];
	}
	const entries = Object.entries(input as Record<string, unknown>);
	if (entries.length === 0) {
		return ['(no arguments)'];
	}
	return entries.slice(0, 6).map(([k, v]) => {
		if (v === null || v === undefined) {
			return `${k}: ∅`;
		}
		if (typeof v === 'string') {
			const trimmed = v.length > 80 ? `${v.slice(0, 79)}…` : v;
			return `${k}: ${JSON.stringify(trimmed)}`;
		}
		if (typeof v === 'number' || typeof v === 'boolean') {
			return `${k}: ${v}`;
		}
		const json = JSON.stringify(v);
		const summary = json.length > 80 ? `[${typeof v} · ${json.length}b]` : json;
		return `${k}: ${summary}`;
	});
}

/**
 * Single tool-call card shown inline in the transcript under an assistant
 * message. Visually distinct from the assistant text (rounded border) so the
 * agentic actions stand out, with category-coloured accent + icon to make
 * categories scannable.
 */
export function ToolCard(props: ToolCardProps): JSX.Element {
	const { name, input } = props;
	const cat = categorise(name);
	const color = TONE_COLOR[cat.tone];
	const lines = previewInput(input);

	return (
		<Box borderStyle="round" borderColor={color} flexDirection="column" paddingX={1} marginY={0}>
			<Box flexDirection="row">
				<Text color={color}>{cat.icon} </Text>
				<Text color={color} bold>
					{name}
				</Text>
				<Text color="gray">{`  · ${cat.label}`}</Text>
			</Box>
			{lines.length > 0 ? (
				<Box flexDirection="column" paddingLeft={2}>
					{lines.map((line, i) => (
						<Text key={i} color="gray">
							{line}
						</Text>
					))}
				</Box>
			) : null}
		</Box>
	);
}
