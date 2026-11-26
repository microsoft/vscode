/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The schema of a native components block: a composition that an agent authors in a fenced code
 * block and that VS Code renders with its own components. The agent supplies content, data and
 * composition only; every component's implementation and appearance belongs to the renderer.
 */

/** The language of the fenced code block that holds a native components block. */
export const NATIVE_COMPONENTS_LANGUAGE_ID = 'vscode-ui';

/** The schema version. A fence that declares no version is version 1. */
export const NATIVE_COMPONENTS_SCHEMA_VERSION = 1;

/** Bounds of a block. A block that exceeds one is rejected as a whole rather than truncated. */
export const NativeComponentsLimits = {
	/** UTF-16 code units of the block's source. */
	sourceLength: 32_000,
	/** Nesting depth of components; a top-level component has depth 1. */
	depth: 8,
	/** Components in the block, counting every tag. */
	components: 2_000,
	tableColumns: 12,
	tableRows: 100,
	bars: 24,
} as const;

/**
 * The meaning of a value, chosen by the agent. The renderer maps it to theme colors and pairs it
 * with an icon and a label, so that it is never conveyed by color alone.
 */
export type NativeComponentTone = 'neutral' | 'positive' | 'negative' | 'warning';

export type NativeTextVariant = 'body' | 'heading' | 'caption';

export type NativeColumnAlignment = 'start' | 'end';

/** Lays its children out from top to bottom. */
export interface INativeStack {
	readonly type: 'stack';
	readonly children: readonly NativeComponent[];
}

/** Lays its children out side by side in equal columns, which wrap when space runs out. */
export interface INativeColumns {
	readonly type: 'columns';
	readonly children: readonly NativeComponent[];
}

export interface INativeText {
	readonly type: 'text';
	readonly variant: NativeTextVariant;
	readonly text: string;
}

export interface INativeMetric {
	readonly type: 'metric';
	readonly label: string;
	readonly value: string;
	/** A change or comparison shown beside the value, such as `-85%`. */
	readonly delta: string | undefined;
	readonly tone: NativeComponentTone;
}

export interface INativeBadge {
	readonly type: 'badge';
	readonly text: string;
	readonly tone: NativeComponentTone;
}

export interface INativeTableColumn {
	readonly header: string;
	readonly align: NativeColumnAlignment;
}

export interface INativeTable {
	readonly type: 'table';
	readonly caption: string | undefined;
	readonly columns: readonly INativeTableColumn[];
	/** Every row has one cell per column. */
	readonly rows: readonly (readonly string[])[];
}

export interface INativeBar {
	readonly label: string;
	/** A finite number that is not negative. */
	readonly value: number;
	/** The value as it was authored, which is what the chart displays. */
	readonly valueText: string;
}

export interface INativeBarChart {
	readonly type: 'barChart';
	readonly title: string;
	/** The unit of every value, such as `s`. */
	readonly unit: string | undefined;
	readonly bars: readonly INativeBar[];
}

/** Content that is hidden until the user expands its summary. */
export interface INativeDisclosure {
	readonly type: 'disclosure';
	readonly summary: string;
	readonly children: readonly NativeComponent[];
}

export type NativeComponent = INativeStack | INativeColumns | INativeText | INativeMetric | INativeBadge | INativeTable | INativeBarChart | INativeDisclosure;

export interface INativeComponentsDocument {
	readonly version: typeof NATIVE_COMPONENTS_SCHEMA_VERSION;
	readonly children: readonly NativeComponent[];
}
