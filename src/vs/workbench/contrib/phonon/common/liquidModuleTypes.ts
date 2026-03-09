/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Liquid Module Types - Pure type surface for the Phonon Module Manifest System.
 *
 * Relationship graph:
 *   Contribution types (raw from package.json)
 *     -> Resolved types (after extension point processing, enriched with extensionId + resolved resources)
 *   Canvas composition types (independent subgraph)
 *   Capability summary (projection over resolved entities + views, consumed by AI)
 *
 * Zero runtime code. Every export is a type or interface.
 */

import { URI } from '../../../../base/common/uri.js';

// ==================== Extension Point Contribution Types ====================
// Raw shapes declared in extension package.json manifests.
// String paths are unresolved - resolution happens in the registry.

/**
 * Entity contribution from an extension's package.json.
 * Declares a data entity with a JSON Schema for validation.
 */
export interface ILiquidEntityContribution {
	readonly id: string;
	readonly label: string;
	/** Relative path to the JSON Schema file within the extension. */
	readonly schema: string;
	readonly icon?: string;
}

/**
 * View contribution from an extension's package.json.
 * Declares a UI component that renders entity data.
 */
export interface ILiquidViewContribution {
	readonly id: string;
	readonly label: string;
	/** Relative path to the component module within the extension. */
	readonly component: string;
	readonly mode: 'structured' | 'canvas';
	/** Entity this view is bound to. Omitted for entity-agnostic views. */
	readonly entity?: string;
}

/** Category classifying a molecule's UI purpose. */
export type ComponentCategory = 'stat' | 'table' | 'detail' | 'chart' | 'form' | 'list';

/**
 * Molecule contribution from an extension's package.json.
 * A molecule is a sandboxed HTML webview: any language, any framework.
 * The `entry` path points to an HTML file loaded in an iframe.
 */
export interface ILiquidMoleculeContribution {
	readonly id: string;
	readonly label: string;
	/** Human-readable description for AI and developer tooling. */
	readonly description?: string;
	/** Relative path to the molecule's HTML entry file within the extension. */
	readonly entry: string;
	/** Entity this molecule displays data for. */
	readonly entity?: string;
	/** Business domain this molecule belongs to (e.g. "inventory", "orders", "analytics"). */
	readonly domain?: string;
	/** UI purpose category. */
	readonly category?: ComponentCategory;
	/** Tags for AI-driven composition (e.g. "analytics", "cost", "dashboard"). */
	readonly tags?: readonly string[];
	/** Grid layout constraints. */
	readonly layout?: { readonly minCols?: number; readonly maxCols?: number; readonly minHeight?: number };
	/** Entity IDs this molecule can visualise. */
	readonly shows?: readonly string[];
	/** IDs of related molecules or entities for composition hints. */
	readonly relatesTo?: readonly string[];
}

/**
 * Data provider contribution from an extension's package.json.
 * Supplies CRUD operations for one or more entities.
 */
export interface ILiquidDataProviderContribution {
	readonly id: string;
	readonly entities: readonly string[];
	/** Relative path to the provider module within the extension. */
	readonly provider: string;
	/** Priority for provider selection when multiple providers declare the same entity. Higher wins. */
	readonly priority?: number;
}

/**
 * Sidebar node contribution from an extension's package.json.
 * Declares a navigation tree entry. Recursive: children form subtrees.
 */
export interface ILiquidSidebarContribution {
	readonly id: string;
	readonly label: string;
	/** View to activate when this node is selected. */
	readonly view?: string;
	readonly icon?: string;
	readonly order?: number;
	readonly children?: readonly ILiquidSidebarContribution[];
}

// ==================== Resolved Types ====================
// After extension point processing: paths resolved to URIs/objects,
// extensionId stamped for provenance tracking.

/**
 * Resolved entity - schema parsed from JSON, extensionId attached.
 */
export interface ILiquidEntity {
	readonly id: string;
	readonly label: string;
	/** Parsed JSON Schema object. */
	readonly schema: object;
	readonly icon?: string;
	readonly extensionId: string;
}

/**
 * Resolved view - component path resolved to a URI, extensionId attached.
 */
export interface ILiquidView {
	readonly id: string;
	readonly label: string;
	/** Fully resolved URI to the component module. */
	readonly componentUri: URI;
	readonly mode: 'structured' | 'canvas';
	/** Entity this view is bound to. Omitted for entity-agnostic views. */
	readonly entity?: string;
	readonly extensionId: string;
}

/**
 * Resolved molecule - entry path resolved to URI, extensionId attached.
 * The entryUri points to an HTML file that will be loaded in a sandboxed iframe.
 */
export interface ILiquidMolecule {
	readonly id: string;
	readonly label: string;
	/** Human-readable description for AI and developer tooling. */
	readonly description: string;
	/** Fully resolved URI to the molecule's HTML entry file. */
	readonly entryUri: URI;
	readonly entity?: string;
	/** Business domain this molecule belongs to. */
	readonly domain: string;
	/** UI purpose category. */
	readonly category: ComponentCategory;
	readonly tags: readonly string[];
	/** Grid layout constraints. */
	readonly layout: { readonly minCols: number; readonly maxCols: number; readonly minHeight: number };
	readonly extensionId: string;
	/** Entity IDs this molecule can visualise. */
	readonly shows: readonly string[];
	/** IDs of related molecules or entities for composition hints. */
	readonly relatesTo: readonly string[];
}

/**
 * Resolved data provider - entities list frozen, extensionId attached.
 */
export interface ILiquidDataProvider {
	readonly id: string;
	readonly entities: readonly string[];
	readonly extensionId: string;
	readonly priority: number;
}

/**
 * Resolved sidebar node - order defaulted, children frozen, extensionId attached.
 */
export interface ILiquidSidebarNode {
	readonly id: string;
	readonly label: string;
	/** View to activate when this node is selected. */
	readonly view?: string;
	readonly icon?: string;
	readonly order: number;
	readonly children: readonly ILiquidSidebarNode[];
	readonly extensionId: string;
}

// ==================== Canvas Composition Types ====================
// Independent subgraph: how views are composed in canvas mode.

/**
 * Layout strategies for composing multiple views on a canvas.
 */
export type CompositionLayout = 'single' | 'split-horizontal' | 'split-vertical' | 'grid' | 'stack';

/**
 * A slot in a composition - one view or molecule instance with optional parameters.
 */
export interface ICompositionSlot {
	/** View ID for macro views. Mutually exclusive with moleculeId. */
	readonly viewId?: string;
	/** Molecule ID for micro-molecules. Mutually exclusive with viewId. */
	readonly moleculeId?: string;
	readonly params?: Record<string, unknown>;
	readonly weight?: number;
	readonly label?: string;
}

/**
 * A composition intent - declares a layout with its slots.
 * Transient intents are not persisted across sessions.
 */
export interface ICompositionIntent {
	readonly layout: CompositionLayout;
	readonly slots: readonly ICompositionSlot[];
	readonly title?: string;
	readonly transient?: boolean;
}

// ==================== Capability Summary ====================
// Projection over resolved types, consumed by AI agents.
// Gives the LLM a flat, navigable map of what the module system offers.

/**
 * Summary of all liquid module capabilities.
 * Designed for AI consumption: flat, descriptive, no circular references.
 */
export interface ILiquidCapabilitySummary {
	readonly modules: readonly {
		readonly name: string;
		readonly description: string;
	}[];
	readonly entities: readonly {
		readonly id: string;
		readonly label: string;
		readonly fields: readonly string[];
	}[];
	readonly views: readonly {
		readonly id: string;
		readonly label: string;
		readonly mode: 'structured' | 'canvas';
		readonly entity?: string;
	}[];
	readonly molecules: readonly {
		readonly id: string;
		readonly label: string;
		readonly description: string;
		readonly entity?: string;
		readonly domain: string;
		readonly category: ComponentCategory;
		readonly tags: readonly string[];
		readonly shows: readonly string[];
	}[];
}
