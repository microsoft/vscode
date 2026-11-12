/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SkillCustomization } from '../../state/protocol/state.js';

const argumentHintKey = 'vscode.skill.argumentHint';

/**
 * Reads the optional argument hint (the skill's frontmatter `argument-hint`)
 * from a skill customization's `_meta` bag. Hosts that do not publish the hint
 * omit the key; returns `undefined` when absent, wrong-typed, or blank.
 */
export function readSkillArgumentHint(skill: SkillCustomization): string | undefined {
	const value = skill._meta?.[argumentHintKey];
	return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Records the argument hint in an open `_meta` bag, preserving every other entry. */
export function withSkillArgumentHintMeta(meta: Record<string, unknown> | undefined, argumentHint: string | undefined): Record<string, unknown> | undefined {
	if (argumentHint === undefined || argumentHint.trim().length === 0) {
		return meta;
	}
	return { ...(meta ?? {}), [argumentHintKey]: argumentHint };
}
