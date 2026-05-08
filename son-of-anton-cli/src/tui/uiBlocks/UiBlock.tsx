/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';
import { CardBlock } from './CardBlock';
import { ChartBlock } from './ChartBlock';
import { ConfirmBlock } from './ConfirmBlock';
import { FormBlock } from './FormBlock';
import { ProgressBlock } from './ProgressBlock';
import { TableBlock } from './TableBlock';
import type { CardProps, ChartProps, ConfirmProps, FormProps, ProgressProps, TableProps, UiBlockComponent, UiBlockResponse } from './types';

interface UiBlockState {
	settled: boolean;
	value?: { kind: 'confirm'; value: boolean } | { kind: 'form'; values: Record<string, string | boolean> };
}

interface UiBlockProps {
	component: string;
	props: unknown;
	blockId?: string;
	onResponse?(response: UiBlockResponse, blockId?: string): void;
	state?: UiBlockState;
}

const SUPPORTED: ReadonlyArray<UiBlockComponent> = ['card', 'form', 'confirm', 'table', 'chart', 'progress'];

/**
 * Discriminator that picks the right Ink renderer for a `ui-block` payload
 * emitted by the agent's `emit_ui_block` builtin tool. Falls back to a
 * compact error card when the component name is unrecognised, the props
 * are missing, or the renderer throws — the transcript should never crash
 * because of a malformed agent emission.
 */
export function UiBlock(props: UiBlockProps): JSX.Element {
	if (!isSupported(props.component) || !isObject(props.props)) {
		return <FallbackCard component={props.component} />;
	}
	const settled = !!props.state?.settled;
	const handleResponse = (response: UiBlockResponse): void => {
		props.onResponse?.(response, props.blockId);
	};

	// The agent emits these props as untyped JSON; each renderer normalises
	// its own shape so the unknown→Strict cast here is safe by construction.
	const blockProps = props.props as unknown;
	try {
		switch (props.component) {
			case 'card':
				return <CardBlock props={blockProps as CardProps} />;
			case 'table':
				return <TableBlock props={blockProps as TableProps} />;
			case 'chart':
				return <ChartBlock props={blockProps as ChartProps} />;
			case 'progress':
				return <ProgressBlock props={blockProps as ProgressProps} />;
			case 'confirm':
				return (
					<ConfirmBlock
						props={blockProps as ConfirmProps}
						settled={settled}
						settledValue={props.state?.value?.kind === 'confirm' ? props.state.value.value : undefined}
						onResponse={handleResponse}
					/>
				);
			case 'form':
				return (
					<FormBlock
						props={blockProps as FormProps}
						settled={settled}
						settledValues={props.state?.value?.kind === 'form' ? props.state.value.values : undefined}
						onResponse={handleResponse}
					/>
				);
			default:
				return <FallbackCard component={props.component} />;
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return (
			<Box borderStyle="round" borderColor="red" flexDirection="column" paddingX={1}>
				<Text color="red" bold>
					{`ui-block render failed: ${props.component}`}
				</Text>
				<Text color="gray">{message}</Text>
			</Box>
		);
	}
}

function isSupported(component: string): component is UiBlockComponent {
	return (SUPPORTED as ReadonlyArray<string>).includes(component);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function FallbackCard({ component }: { component: string }): JSX.Element {
	return (
		<Box borderStyle="round" borderColor="red" paddingX={1}>
			<Text color="red">{`unsupported ui-block: ${component}`}</Text>
		</Box>
	);
}
