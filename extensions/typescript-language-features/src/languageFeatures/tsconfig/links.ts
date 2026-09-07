/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jsonc from 'jsonc-parser';
import { looksLikeUriNotPath } from '../../utils/fs';

/**
 * Path segment matching every element of an array.
 *
 * A symbol rather than a `'*'` string so it can never collide with a real
 * property name. `compilerOptions.paths` uses glob keys, where `"*"` is an
 * ordinary and idiomatic property.
 */
export const arrayWildcard = Symbol('arrayWildcard');

export type TsConfigLinkPathSegment = string | typeof arrayWildcard;

/** How a linked value is turned into a resource on disk. */
export enum TsConfigLinkKind {
	Extends = 'extends',
	Reference = 'reference',
	ProjectFile = 'projectFile',
	Lib = 'lib',
	TypePackage = 'typePackage',
	Path = 'path',
	BuildOutput = 'buildOutput',
}

/** The portion of a string value that should carry the link, in value coordinates. */
export interface TsConfigLinkSelection {
	readonly offset: number;
	readonly length: number;
}

/**
 * Narrows a string value to the portion that should be linked.
 * Returning `undefined` suppresses the link entirely.
 */
export type TsConfigLinkSelect = (value: string) => TsConfigLinkSelection | undefined;

export interface TsConfigLinkContribution {
	/** Path to the value, from the root of the document. */
	readonly path: readonly TsConfigLinkPathSegment[];

	readonly kind: TsConfigLinkKind;

	/** Defaults to `selectWholeValue`. */
	readonly select?: TsConfigLinkSelect;
}

const globCharacter = /[*?]/;

/** Links the entire value. Globs are not linked, matching the previous behavior. */
export function selectWholeValue(value: string): TsConfigLinkSelection | undefined {
	if (globCharacter.test(value)) {
		return undefined;
	}

	return { offset: 0, length: value.length };
}

/**
 * Links the literal leading path segments of a glob, so a value of `src`
 * followed by a wildcard links the `src` directory. A value that begins with a
 * wildcard has no directory to point at.
 */
export function selectNonGlobPrefix(value: string): TsConfigLinkSelection | undefined {
	const globIndex = value.search(globCharacter);

	if (globIndex === -1) {
		return { offset: 0, length: value.length };
	}

	const separatorIndex = value.lastIndexOf('/', globIndex);

	if (separatorIndex <= 0) {
		return undefined;
	}

	return { offset: 0, length: separatorIndex };
}

/** Links the value unless it is a URI, which TypeScript allows for source map roots. */
export function selectNonUriValue(value: string): TsConfigLinkSelection | undefined {
	if (looksLikeUriNotPath(value)) {
		return undefined;
	}

	return selectWholeValue(value);
}

/** A linkable value found in a document, in document coordinates. */
export interface TsConfigLinkCandidate {
	readonly kind: TsConfigLinkKind;
	/** The portion of the string that carries the link: the whole value, except where a `select` narrowed it. */
	readonly value: string;
	readonly startOffset: number;
	readonly endOffset: number;
}

/**
 * Every value in a project config that names something on disk.
 *
 * Adding a field is one row here. Adding a new way to resolve one is a row
 * plus an entry in `createResolvers`.
 */
export const tsConfigLinkContributions: readonly TsConfigLinkContribution[] = [
	{ path: ['extends'], kind: TsConfigLinkKind.Extends },
	{ path: ['extends', arrayWildcard], kind: TsConfigLinkKind.Extends },
	{ path: ['references', arrayWildcard, 'path'], kind: TsConfigLinkKind.Reference },
	{ path: ['files', arrayWildcard], kind: TsConfigLinkKind.ProjectFile },
	// `include` and `exclude` are patterns, and a narrowed one names the directory the pattern
	// walks, so they resolve as paths even though they resolve through the same function as `files`.
	{ path: ['include', arrayWildcard], kind: TsConfigLinkKind.Path, select: selectNonGlobPrefix },
	{ path: ['exclude', arrayWildcard], kind: TsConfigLinkKind.Path, select: selectNonGlobPrefix },
	{ path: ['compilerOptions', 'lib', arrayWildcard], kind: TsConfigLinkKind.Lib },
	{ path: ['compilerOptions', 'types', arrayWildcard], kind: TsConfigLinkKind.TypePackage },
	{ path: ['compilerOptions', 'typeRoots', arrayWildcard], kind: TsConfigLinkKind.Path },
	{ path: ['compilerOptions', 'rootDir'], kind: TsConfigLinkKind.Path },
	{ path: ['compilerOptions', 'rootDirs', arrayWildcard], kind: TsConfigLinkKind.Path },
	{ path: ['compilerOptions', 'baseUrl'], kind: TsConfigLinkKind.Path },
	{ path: ['compilerOptions', 'outDir'], kind: TsConfigLinkKind.BuildOutput },
	{ path: ['compilerOptions', 'declarationDir'], kind: TsConfigLinkKind.BuildOutput },
	{ path: ['compilerOptions', 'outFile'], kind: TsConfigLinkKind.BuildOutput },
	{ path: ['compilerOptions', 'tsBuildInfoFile'], kind: TsConfigLinkKind.BuildOutput },
	{ path: ['compilerOptions', 'mapRoot'], kind: TsConfigLinkKind.BuildOutput, select: selectNonUriValue },
	{ path: ['compilerOptions', 'sourceRoot'], kind: TsConfigLinkKind.BuildOutput, select: selectNonUriValue },
];

/** Finds every linkable value in a parsed document. Performs no file system access. */
export function collectLinkCandidates(root: jsonc.Node): TsConfigLinkCandidate[] {
	const candidates: TsConfigLinkCandidate[] = [];

	for (const contribution of tsConfigLinkContributions) {
		const select = contribution.select ?? selectWholeValue;

		for (const node of selectStringNodes(root, contribution.path)) {
			const value: string = node.value;
			const selection = select(value);

			if (!selection) {
				continue;
			}

			// `node.offset` is the opening quote and `node.length` spans both quotes.
			// Anything longer means the source text was escaped, so an offset into the
			// decoded value no longer lines up with the document.
			const isVerbatim = node.length === value.length + 2;
			const isWholeValue = selection.offset === 0 && selection.length === value.length;

			if (!isVerbatim && !isWholeValue) {
				// Underlining the wrong characters is worse than not linking.
				continue;
			}

			const startOffset = node.offset + 1 + (isVerbatim ? selection.offset : 0);
			const endOffset = isVerbatim
				? startOffset + selection.length
				: node.offset + node.length - 1;

			const linkedValue = value.slice(selection.offset, selection.offset + selection.length);

			candidates.push({ kind: contribution.kind, value: linkedValue, startOffset, endOffset });
		}
	}

	return candidates;
}

/**
 * Resolves a contribution path against a parsed document, returning the
 * non-empty string nodes it matches.
 */
export function selectStringNodes(root: jsonc.Node, path: readonly TsConfigLinkPathSegment[]): jsonc.Node[] {
	let nodes: jsonc.Node[] = [root];

	for (const segment of path) {
		const next: jsonc.Node[] = [];

		for (const node of nodes) {
			if (segment === arrayWildcard) {
				if (node.type === 'array' && node.children) {
					next.push(...node.children);
				}
			} else {
				const child = jsonc.findNodeAtLocation(node, [segment]);

				if (child) {
					next.push(child);
				}
			}
		}

		nodes = next;
	}

	return nodes.filter(node => node.type === 'string' && typeof node.value === 'string' && node.value.length > 0);
}
