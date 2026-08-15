/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * File inspired by snippy at /proto/snippy.proto
 */

import { Static, Type } from '@sinclair/typebox';

export const MatchError = Type.Object({
	kind: Type.Literal('failure'),
	reason: Type.String(),
	code: Type.Number(),
	msg: Type.String(),
	meta: Type.Optional(Type.Any()),
});
export type MatchError = Static<typeof MatchError>;

const Snippet = Type.Object({
	matched_source: Type.String(),
	occurrences: Type.String(),
	capped: Type.Boolean(),
	cursor: Type.String(),
	github_url: Type.String(),
});
type Snippet = Static<typeof Snippet>;

export const MatchRequest = Type.Object({
	source: Type.String(),
});
export type MatchRequest = Static<typeof MatchRequest>;

const MatchSuccess = Type.Object({
	snippets: Type.Array(Snippet),
});
type MatchSuccess = Static<typeof MatchSuccess>;
export const MatchResponse = Type.Union([
	// Snippet type
	MatchSuccess,
	// Error type
	MatchError,
]);
export type MatchResponse = Static<typeof MatchResponse>;

export const FileMatchRequest = Type.Object({
	cursor: Type.String(),
});
export type FileMatchRequest = Static<typeof FileMatchRequest>;

const FileMatch = Type.Object({
	commit_id: Type.String(),
	license: Type.String(),
	nwo: Type.String(),
	path: Type.String(),
	url: Type.String(),
});
type FileMatch = Static<typeof FileMatch>;

const PageInfo = Type.Object({
	has_next_page: Type.Boolean(),
	cursor: Type.String(),
});

const LicenseStats = Type.Object({
	count: Type.Record(Type.String(), Type.String()),
});
type LicenseStats = Static<typeof LicenseStats>;

const FileMatchSuccess = Type.Object({
	file_matches: Type.Array(FileMatch),
	page_info: PageInfo,
	license_stats: LicenseStats,
});
type FileMatchSuccess = Static<typeof FileMatchSuccess>;
export const FileMatchResponse = Type.Union([FileMatchSuccess, MatchError]);
export type FileMatchResponse = Static<typeof FileMatchResponse>;
