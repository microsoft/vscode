/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SimpleMessageAttachment } from '../state/protocol/state.js';

/**
 * Well-known typed views over a `SimpleMessageAttachment`'s `_meta` bag as
 * produced by the `completions` command, populated by the slash-command and
 * skill completion providers and read by the session handler. Read the bag
 * through {@link readCompletionAttachmentMeta} rather than indexing `_meta`
 * directly. Two variants are distinguished by which discriminating key is
 * present: a slash command (`command`) or a skill (`uri`).
 */

/**
 * The `_meta` shape attached to a `completions` result that resolves to a slash
 * command.
 */
export interface ICommandCompletionAttachmentMeta {
	/** The slash command name (without the leading `/`). */
	readonly command: string;
	/** Optional human-readable description of the command. */
	readonly description?: string;
	/**
	 * Optional hint describing the argument the command expects. Rendered as
	 * inline placeholder (ghost text) after an accepted command completion.
	 */
	readonly argumentHint?: string;
}

/**
 * The `_meta` shape attached to a `completions` result that resolves to a skill.
 */
export interface ISkillCompletionAttachmentMeta {
	/** The skill resource URI as a string. */
	readonly uri: string;
	/** Optional internal name of the skill. */
	readonly name?: string;
	/** Optional human-readable display name (e.g. the slash-command name). */
	readonly displayName?: string;
	/** Optional human-readable description of the skill. */
	readonly description?: string;
}

/**
 * A typed, discriminated view over the well-known `completions` attachment
 * `_meta` variants. The `kind` discriminant is computed by
 * {@link readCompletionAttachmentMeta} from which key is present on the wire; it
 * is not itself carried in `_meta`.
 */
export type CompletionAttachmentMeta =
	| ({ readonly kind: 'command' } & ICommandCompletionAttachmentMeta)
	| ({ readonly kind: 'skill' } & ISkillCompletionAttachmentMeta);

/**
 * Reads the well-known `completions` attachment `_meta` keys, classifying the
 * bag into a {@link CompletionAttachmentMeta} variant by its discriminating key
 * (`command` for a slash command, `uri` for a skill). Returns `undefined` when
 * the bag is absent or matches neither variant; wrong-typed keys are dropped.
 */
export function readCompletionAttachmentMeta(attachment: SimpleMessageAttachment): CompletionAttachmentMeta | undefined {
	const meta = attachment._meta;
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	if (typeof meta['command'] === 'string') {
		return {
			kind: 'command',
			command: meta['command'],
			...(typeof meta['description'] === 'string' ? { description: meta['description'] } : {}),
			...(typeof meta['argumentHint'] === 'string' ? { argumentHint: meta['argumentHint'] } : {}),
		};
	}
	if (typeof meta['uri'] === 'string') {
		return {
			kind: 'skill',
			uri: meta['uri'],
			...(typeof meta['name'] === 'string' ? { name: meta['name'] } : {}),
			...(typeof meta['displayName'] === 'string' ? { displayName: meta['displayName'] } : {}),
			...(typeof meta['description'] === 'string' ? { description: meta['description'] } : {}),
		};
	}
	return undefined;
}

/**
 * Serializes a typed {@link ICommandCompletionAttachmentMeta} into the `_meta`
 * record, dropping `undefined` entries. Build a slash-command completion's
 * `_meta` through this so producers stay in lock-step with
 * {@link readCompletionAttachmentMeta}.
 */
export function toCommandCompletionAttachmentMeta(meta: ICommandCompletionAttachmentMeta): Record<string, unknown> {
	const result: Record<string, unknown> = { command: meta.command };
	if (meta.description !== undefined) {
		result['description'] = meta.description;
	}
	if (meta.argumentHint !== undefined) {
		result['argumentHint'] = meta.argumentHint;
	}
	return result;
}

/**
 * Reads the well-known `argumentHint` from a raw completion attachment `_meta`
 * bag. Kept as the single seam that consumers use to obtain the hint, so a
 * future promotion of `argumentHint` to a first-class attachment field only
 * needs to change this reader. Returns `undefined` when absent or wrong-typed.
 */
export function getCommandArgumentHint(meta: Record<string, unknown> | undefined): string | undefined {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return undefined;
	}
	return typeof meta['argumentHint'] === 'string' ? meta['argumentHint'] : undefined;
}

/**
 * Serializes a typed {@link ISkillCompletionAttachmentMeta} into the `_meta`
 * record, dropping `undefined` entries. Build a skill completion's `_meta`
 * through this so producers stay in lock-step with
 * {@link readCompletionAttachmentMeta}.
 */
export function toSkillCompletionAttachmentMeta(meta: ISkillCompletionAttachmentMeta): Record<string, unknown> {
	const result: Record<string, unknown> = { uri: meta.uri };
	if (meta.name !== undefined) {
		result['name'] = meta.name;
	}
	if (meta.displayName !== undefined) {
		result['displayName'] = meta.displayName;
	}
	if (meta.description !== undefined) {
		result['description'] = meta.description;
	}
	return result;
}
