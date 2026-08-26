/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY } from '../automationMigration.js';

interface IHasAutomationMeta {
	readonly _meta?: Record<string, unknown>;
}

/** Whether the Automation catalogue records durable legacy migration completion. */
export function isAgentHostAutomationCatalogMigrated(source: IHasAutomationMeta): boolean {
	return readAutomationMetaSlot(source, AGENT_HOST_AUTOMATION_CATALOG_MIGRATED_META_KEY) === true;
}

/** Whether an Automation definition was imported from VS Code's legacy store. */
export function isAgentHostLegacyAutomationImport(source: IHasAutomationMeta | undefined): boolean {
	return source !== undefined && readAutomationMetaSlot(source, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_META_KEY) === true;
}

/**
 * Whether a legacy-imported Automation definition is still waiting for its
 * originating legacy source row to be durably removed. Pending items must not
 * be granted host `Run` (or `Remove`) authority because the browser-side
 * legacy scheduler still owns the row until the removal succeeds.
 */
export function isAgentHostLegacyAutomationImportPending(source: IHasAutomationMeta | undefined): boolean {
	return source !== undefined && readAutomationMetaSlot(source, AGENT_HOST_LEGACY_AUTOMATION_IMPORT_PENDING_META_KEY) === true;
}

function readAutomationMetaSlot(source: IHasAutomationMeta, key: string): unknown {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned reader for validated Automation metadata slots.
	return source._meta?.[key];
}
