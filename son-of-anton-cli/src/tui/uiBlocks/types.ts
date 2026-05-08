/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Schemas for the six generative-UI components emitted by the agent's
 * `emit_ui_block` builtin tool. Mirrors the shape documented in
 * docs/generative-ui.md so the IDE webview and the Ink TUI render from a
 * single source of truth.
 *
 * These types are intentionally permissive (`unknown` for nested values
 * before validation) — the LLM is the producer and we don't want a single
 * malformed prop to crash the transcript. Each renderer normalises its own
 * props with a small zod-free guard at render time.
 */

export type UiBlockComponent = 'card' | 'form' | 'confirm' | 'table' | 'chart' | 'progress';

export interface CardProps {
	title?: string;
	body?: string;
	actions?: ReadonlyArray<{ name: string; label: string; variant?: 'primary' | 'secondary' | 'danger' }>;
}

export interface ConfirmProps {
	title?: string;
	body?: string;
	yesLabel?: string;
	noLabel?: string;
}

export interface FormField {
	name: string;
	label: string;
	type?: 'text' | 'textarea' | 'select' | 'checkbox';
	required?: boolean;
	placeholder?: string;
	options?: ReadonlyArray<string>;
	defaultValue?: string | boolean;
}

export interface FormProps {
	title?: string;
	submitLabel?: string;
	fields: ReadonlyArray<FormField>;
}

export interface TableProps {
	caption?: string;
	columns: ReadonlyArray<string>;
	rows: ReadonlyArray<Record<string, unknown>>;
}

export interface ChartProps {
	type?: 'bar';
	title?: string;
	labels: ReadonlyArray<string>;
	values: ReadonlyArray<number>;
}

export interface ProgressProps {
	steps: ReadonlyArray<string>;
	current: number;
}

/**
 * Captured response from a `form` or `confirm` block. The TUI's
 * `submitUiBlockResponse` callback turns this into a synthetic user turn
 * matching the IDE convention:
 *   `UI block response (block-xxxxxxxx): { ... }`
 * so an agent receiving the message sees the same shape regardless of which
 * surface rendered the block.
 */
export type UiBlockResponse =
	| { kind: 'confirm'; value: boolean }
	| { kind: 'form'; values: Record<string, string | boolean> };
