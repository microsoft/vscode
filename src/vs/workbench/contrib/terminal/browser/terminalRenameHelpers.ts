/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { TerminalStorageKeys } from '../common/terminalStorageKeys.js';

/**
 * Default terminal name templates for quick selection
 */
export const DEFAULT_TERMINAL_NAME_TEMPLATES = [
	'Build',
	'Test',
	'Server',
	'Dev',
	'Production',
	'Debug',
	'Logs',
	'Database',
	'API',
	'Frontend',
	'Backend'
];

/**
 * Maximum length for terminal names
 */
const MAX_TERMINAL_NAME_LENGTH = 100;

/**
 * Maximum number of history items to store
 */
const MAX_HISTORY_ITEMS = 20;

/**
 * Enhanced validation for terminal names
 */
export function validateTerminalNameEnhanced(name: string): { content: string; severity: Severity } | null {
	if (!name || name.trim().length === 0) {
		return {
			content: localize('emptyTerminalNameInfo', "Providing no name will reset it to the default value"),
			severity: Severity.Info
		};
	}

	const trimmed = name.trim();

	// Check length
	if (trimmed.length > MAX_TERMINAL_NAME_LENGTH) {
		return {
			content: localize('terminalNameTooLong', "Terminal name cannot exceed {0} characters", MAX_TERMINAL_NAME_LENGTH),
			severity: Severity.Error
		};
	}

	// Check for invalid characters (control characters, but allow most unicode)
	if (/[\x00-\x1F\x7F]/.test(trimmed)) {
		return {
			content: localize('terminalNameInvalidChars', "Terminal name contains invalid characters"),
			severity: Severity.Error
		};
	}

	return null;
}

/**
 * Get terminal rename history from storage
 */
export function getTerminalRenameHistory(storageService: IStorageService): string[] {
	const historyJson = storageService.get(TerminalStorageKeys.TerminalRenameHistory, StorageScope.APPLICATION);
	if (!historyJson) {
		return [];
	}
	try {
		const history = JSON.parse(historyJson) as string[];
		return Array.isArray(history) ? history.filter(name => name && name.trim().length > 0) : [];
	} catch {
		return [];
	}
}

/**
 * Save terminal rename to history
 */
export function saveTerminalRenameToHistory(storageService: IStorageService, name: string): void {
	if (!name || name.trim().length === 0) {
		return;
	}

	const trimmed = name.trim();
	const history = getTerminalRenameHistory(storageService);

	// Remove if already exists (to move to front)
	const filtered = history.filter(h => h !== trimmed);
	// Add to front
	const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);

	storageService.store(TerminalStorageKeys.TerminalRenameHistory, JSON.stringify(updated), StorageScope.APPLICATION, StorageTarget.USER);
}

/**
 * Get terminal name templates from storage (user-defined + defaults)
 */
export function getTerminalNameTemplates(storageService: IStorageService): string[] {
	const templatesJson = storageService.get(TerminalStorageKeys.TerminalRenameTemplates, StorageScope.APPLICATION);
	if (!templatesJson) {
		return DEFAULT_TERMINAL_NAME_TEMPLATES;
	}
	try {
		const templates = JSON.parse(templatesJson) as string[];
		return Array.isArray(templates) && templates.length > 0 ? templates : DEFAULT_TERMINAL_NAME_TEMPLATES;
	} catch {
		return DEFAULT_TERMINAL_NAME_TEMPLATES;
	}
}

/**
 * Save terminal name templates to storage
 */
export function saveTerminalNameTemplates(storageService: IStorageService, templates: string[]): void {
	const validTemplates = templates.filter(t => t && t.trim().length > 0 && t.trim().length <= MAX_TERMINAL_NAME_LENGTH);
	storageService.store(TerminalStorageKeys.TerminalRenameTemplates, JSON.stringify(validTemplates), StorageScope.APPLICATION, StorageTarget.USER);
}

/**
 * Generate names for bulk rename using pattern
 * Supports patterns like:
 * - "Terminal {n}" -> "Terminal 1", "Terminal 2", etc.
 * - "Build {n}" -> "Build 1", "Build 2", etc.
 * - "{n}" -> "1", "2", etc.
 */
export function generateBulkRenameNames(pattern: string, count: number): string[] {
	const names: string[] = [];
	const trimmed = pattern.trim();

	// Check if pattern contains {n} placeholder
	if (trimmed.includes('{n}')) {
		for (let i = 1; i <= count; i++) {
			names.push(trimmed.replace(/{n}/g, i.toString()));
		}
	} else {
		// If no placeholder, append number to each
		for (let i = 1; i <= count; i++) {
			names.push(`${trimmed} ${i}`);
		}
	}

	return names;
}

/**
 * Validate bulk rename pattern
 */
export function validateBulkRenamePattern(pattern: string, count: number): { content: string; severity: Severity } | null {
	if (!pattern || pattern.trim().length === 0) {
		return {
			content: localize('emptyBulkRenamePattern', "Pattern cannot be empty"),
			severity: Severity.Error
		};
	}

	const trimmed = pattern.trim();

	// Check length (accounting for number replacement)
	const maxPatternLength = MAX_TERMINAL_NAME_LENGTH - Math.floor(Math.log10(count) + 1) - 1;
	if (trimmed.length > maxPatternLength) {
		return {
			content: localize('bulkRenamePatternTooLong', "Pattern is too long. Generated names would exceed {0} characters", MAX_TERMINAL_NAME_LENGTH),
			severity: Severity.Error
		};
	}

	// Validate generated names
	const generated = generateBulkRenameNames(trimmed, count);
	for (const name of generated) {
		const validation = validateTerminalNameEnhanced(name);
		if (validation && validation.severity === Severity.Error) {
			return {
				content: localize('bulkRenamePatternInvalid', "Pattern would generate invalid names: {0}", validation.content),
				severity: Severity.Error
			};
		}
	}

	return null;
}

