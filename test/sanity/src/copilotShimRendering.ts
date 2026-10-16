/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { copilotShimTargets } from './copilotShimFixtures.js';

/**
 * Normalizes shell source for comparisons against package-manager-expanded scriptlets.
 */
export function normalizeShellSource(source: string): string {
	return source.replace(/\r\n/g, '\n').trim();
}

/**
 * Verifies the production helper's placeholder-free, literal-target contract.
 */
export function assertCopilotLinkHelperSource(source: string, sourceName: string): void {
	const normalized = normalizeShellSource(source);
	assert.ok(normalized.length > 0, `${sourceName} is empty.`);
	assert.ok(!normalized.includes('@@'), `${sourceName} contains an unresolved template marker.`);
	assert.ok(!normalized.includes('%{'), `${sourceName} contains an RPM macro.`);
	assert.match(normalized, /\bvscode_copilot_link\s*\(\)\s*\{/u, `${sourceName} must define vscode_copilot_link.`);
	assert.match(normalized, /\binstall\b/u, `${sourceName} must support the install action.`);
	assert.match(normalized, /\bremove\b/u, `${sourceName} must support the remove action.`);

	for (const target of Object.values(copilotShimTargets)) {
		assert.ok(normalized.includes(target), `${sourceName} must contain the literal target ${target}.`);
	}
}

/**
 * Verifies that a generated maintainer script embeds the exact, macro-expanded helper source.
 */
export function assertEmbeddedCopilotLinkHelper(script: string, helperSource: string, scriptName: string): void {
	const normalizedScript = normalizeShellSource(script);
	const normalizedHelper = normalizeShellSource(helperSource);
	assert.ok(!normalizedScript.includes('@@COPILOT_LINK_HELPER@@'), `${scriptName} retains @@COPILOT_LINK_HELPER@@.`);
	const executableLines = normalizedScript.split('\n').filter(line => !line.trimStart().startsWith('#'));
	assert.ok(!executableLines.some(line => line.includes('@@')), `${scriptName} contains an unresolved template marker.`);
	assert.ok(normalizedScript.includes(normalizedHelper), `${scriptName} does not embed the exact Copilot link helper source.`);
}

/**
 * Verifies a generated lifecycle call for a specific package identity.
 */
export function assertCopilotLinkLifecycleCall(script: string, action: 'install' | 'remove', applicationName: string, scriptName: string): void {
	const expression = new RegExp(`\\bvscode_copilot_link\\s+${action}\\s+["']?${escapeRegExp(applicationName)}["']?(?:\\s|$)`, 'm');
	assert.match(script, expression, `${scriptName} does not call vscode_copilot_link ${action} ${applicationName}.`);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
