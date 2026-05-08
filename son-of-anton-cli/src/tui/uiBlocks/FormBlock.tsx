/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text, useInput } from 'ink';
import * as React from 'react';
import type { FormField, FormProps, UiBlockResponse } from './types';

interface FormBlockProps {
	props: FormProps;
	settled: boolean;
	settledValues?: Record<string, string | boolean>;
	onResponse(response: UiBlockResponse): void;
}

/**
 * Sequential form block. Each field becomes its own focused row; the user
 * walks through the form with `Tab` (next) / `Shift+Tab` (previous), edits
 * the active field with character / backspace input, toggles a checkbox
 * with space, and submits with Ctrl+S. v1 supports `text`, `textarea`,
 * `select`, and `checkbox` fields. Validation is light — required fields
 * must be non-empty before submit is accepted.
 *
 * Multi-line textareas in v1 are rendered as a single editable line; full
 * multi-line editing inside Ink is its own project that the form path
 * doesn't strictly need yet.
 */
export function FormBlock(props: FormBlockProps): JSX.Element {
	const { title, submitLabel, fields } = props.props;
	const [values, setValues] = React.useState<Record<string, string | boolean>>(() => initialValues(fields));
	const [focus, setFocus] = React.useState(0);
	const [error, setError] = React.useState<string | null>(null);

	const submit = (): void => {
		for (const field of fields) {
			if (field.required && !values[field.name]) {
				setError(`${field.label} is required.`);
				return;
			}
		}
		props.onResponse({ kind: 'form', values });
	};

	useInput(
		(input, key) => {
			if (props.settled) {
				return;
			}
			if (key.tab && !key.shift) {
				setFocus((f) => Math.min(fields.length, f + 1));
				setError(null);
				return;
			}
			if (key.tab && key.shift) {
				setFocus((f) => Math.max(0, f - 1));
				setError(null);
				return;
			}
			if (key.ctrl && input === 's') {
				submit();
				return;
			}
			if (focus >= fields.length) {
				if (key.return) {
					submit();
				}
				return;
			}

			const field = fields[focus];
			const current = values[field.name];

			if ((field.type ?? 'text') === 'checkbox') {
				if (input === ' ' || key.return) {
					setValues((prev) => ({ ...prev, [field.name]: !prev[field.name] }));
				}
				return;
			}
			if (field.type === 'select') {
				if (key.leftArrow || key.rightArrow) {
					const opts = field.options ?? [];
					const idx = opts.findIndex((o) => o === current) ?? 0;
					const delta = key.rightArrow ? 1 : -1;
					const nextIdx = (idx + delta + opts.length) % Math.max(opts.length, 1);
					if (opts.length > 0) {
						setValues((prev) => ({ ...prev, [field.name]: opts[nextIdx] }));
					}
				}
				return;
			}

			// text / textarea — single-line edit.
			const currentText = typeof current === 'string' ? current : '';
			if (key.backspace || key.delete) {
				setValues((prev) => ({ ...prev, [field.name]: currentText.slice(0, -1) }));
				return;
			}
			if (input && !key.ctrl && !key.meta && !key.tab) {
				setValues((prev) => ({ ...prev, [field.name]: currentText + input }));
			}
		},
		{ isActive: !props.settled },
	);

	const settledValues = props.settledValues;
	const submitFocused = focus >= fields.length;

	return (
		<Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} marginY={0}>
			{title ? (
				<Text color="cyan" bold>
					{title}
				</Text>
			) : null}
			{fields.map((field, i) => (
				<FormFieldRow
					key={field.name}
					field={field}
					value={(props.settled ? settledValues : values)?.[field.name]}
					focused={!props.settled && focus === i}
					settled={props.settled}
				/>
			))}
			{props.settled ? (
				<Text color="green">→ submitted</Text>
			) : (
				<Box flexDirection="column" marginTop={1}>
					{error ? <Text color="red">{error}</Text> : null}
					<Text color={submitFocused ? 'cyan' : 'gray'} bold={submitFocused}>
						{submitFocused ? `[ ${submitLabel ?? 'Submit'} ]` : `  ${submitLabel ?? 'Submit'}  `}
						<Text color="gray">{'    Tab to advance · Shift+Tab back · Ctrl+S to submit'}</Text>
					</Text>
				</Box>
			)}
		</Box>
	);
}

function FormFieldRow(props: { field: FormField; value: string | boolean | undefined; focused: boolean; settled: boolean }): JSX.Element {
	const { field, value, focused } = props;
	const display = renderValue(field, value);
	const arrow = focused ? '› ' : '  ';
	const labelColor = focused ? 'cyan' : 'gray';
	return (
		<Box flexDirection="row">
			<Text color={labelColor}>{`${arrow}${field.label.padEnd(16)}`}</Text>
			<Text color={focused ? 'white' : 'gray'} bold={focused}>
				{display}
			</Text>
			{field.required && !value ? <Text color="red"> *</Text> : null}
		</Box>
	);
}

function renderValue(field: FormField, value: string | boolean | undefined): string {
	const type = field.type ?? 'text';
	if (type === 'checkbox') {
		return value ? '[x]' : '[ ]';
	}
	if (type === 'select') {
		const opts = field.options ?? [];
		const current = typeof value === 'string' ? value : opts[0] ?? '';
		return opts.map((o) => (o === current ? `‹${o}›` : o)).join('  ');
	}
	const text = typeof value === 'string' ? value : '';
	return text || (field.placeholder ? `(${field.placeholder})` : '…');
}

function initialValues(fields: ReadonlyArray<FormField>): Record<string, string | boolean> {
	const result: Record<string, string | boolean> = {};
	for (const field of fields) {
		if (field.defaultValue !== undefined) {
			result[field.name] = field.defaultValue;
			continue;
		}
		if ((field.type ?? 'text') === 'checkbox') {
			result[field.name] = false;
			continue;
		}
		if (field.type === 'select') {
			result[field.name] = field.options?.[0] ?? '';
			continue;
		}
		result[field.name] = '';
	}
	return result;
}
