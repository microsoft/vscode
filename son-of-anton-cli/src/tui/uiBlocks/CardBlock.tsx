/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';
import { MarkdownText } from '../MarkdownText';
import type { CardProps } from './types';

const VARIANT_COLOR: Record<NonNullable<NonNullable<CardProps['actions']>[number]['variant']>, string> = {
	primary: 'cyan',
	secondary: 'gray',
	danger: 'red',
};

/**
 * Card block: title + markdown body + optional action button row. Action
 * clicks aren't wired in v1 — the TUI just shows them so the LLM's intent
 * surfaces. Hooking actions back to the agent (the IDE's `helpers.onAction`
 * path) is part of the larger CLI4 approval-flow phase.
 */
export function CardBlock(props: { props: CardProps }): JSX.Element {
	const { title, body, actions } = props.props;
	return (
		<Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} marginY={0}>
			{title ? (
				<Text color="cyan" bold>
					{title}
				</Text>
			) : null}
			{body ? <MarkdownText>{body}</MarkdownText> : null}
			{actions && actions.length > 0 ? (
				<Box flexDirection="row" marginTop={1}>
					{actions.map((a) => (
						<Box key={a.name} marginRight={2}>
							<Text color={VARIANT_COLOR[a.variant ?? 'secondary']} bold>
								{`[ ${a.label} ]`}
							</Text>
						</Box>
					))}
				</Box>
			) : null}
		</Box>
	);
}
