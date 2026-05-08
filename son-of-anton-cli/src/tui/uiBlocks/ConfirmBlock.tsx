/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text, useInput } from 'ink';
import * as React from 'react';
import { MarkdownText } from '../MarkdownText';
import type { ConfirmProps, UiBlockResponse } from './types';

interface ConfirmBlockProps {
	props: ConfirmProps;
	settled: boolean;
	settledValue?: boolean;
	onResponse(response: UiBlockResponse): void;
}

/**
 * Yes/No confirmation block. Highlights the active option, accepts:
 *   ←/→ to swap,
 *   y / n to commit directly,
 *   Enter on the highlighted option.
 *
 * Once a response has been emitted the block is locked into its
 * post-response state — re-rendering the transcript shouldn't ask the user
 * to confirm twice. The settled flag is owned by the dispatcher so the
 * decision survives a transcript scrollback re-render.
 */
export function ConfirmBlock(props: ConfirmBlockProps): JSX.Element {
	const { title, body, yesLabel, noLabel } = props.props;
	const [highlight, setHighlight] = React.useState<'yes' | 'no'>('yes');

	useInput(
		(input, key) => {
			if (props.settled) {
				return;
			}
			if (key.leftArrow) {
				setHighlight('yes');
			} else if (key.rightArrow) {
				setHighlight('no');
			} else if (input === 'y' || input === 'Y') {
				props.onResponse({ kind: 'confirm', value: true });
			} else if (input === 'n' || input === 'N') {
				props.onResponse({ kind: 'confirm', value: false });
			} else if (key.return) {
				props.onResponse({ kind: 'confirm', value: highlight === 'yes' });
			}
		},
		{ isActive: !props.settled },
	);

	const yes = yesLabel ?? 'Yes';
	const no = noLabel ?? 'No';

	return (
		<Box borderStyle="double" borderColor="yellow" flexDirection="column" paddingX={1} marginY={0}>
			{title ? (
				<Text color="yellow" bold>
					{title}
				</Text>
			) : null}
			{body ? <MarkdownText>{body}</MarkdownText> : null}
			{props.settled ? (
				<Text color={props.settledValue ? 'green' : 'red'}>
					{props.settledValue ? `→ ${yes}` : `→ ${no}`}
				</Text>
			) : (
				<Box flexDirection="row" marginTop={1}>
					<Text color={highlight === 'yes' ? 'green' : 'gray'} bold={highlight === 'yes'}>
						{highlight === 'yes' ? `[ ${yes} ]` : `  ${yes}  `}
					</Text>
					<Text color="gray">{'   '}</Text>
					<Text color={highlight === 'no' ? 'red' : 'gray'} bold={highlight === 'no'}>
						{highlight === 'no' ? `[ ${no} ]` : `  ${no}  `}
					</Text>
					<Text color="gray">{'    ←/→ to choose · Enter to confirm · y/n shortcut'}</Text>
				</Box>
			)}
		</Box>
	);
}
