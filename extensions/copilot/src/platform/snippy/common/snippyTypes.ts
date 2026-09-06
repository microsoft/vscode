/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Result } from '../../../util/common/result';

export namespace Snippet {
	export type t = {
		matched_source: string;
		occurrences: string;
		capped: boolean;
		cursor: string;
		github_url: string;
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& typeof (v as t).matched_source === 'string'
			&& typeof (v as t).occurrences === 'string'
			&& typeof (v as t).capped === 'boolean'
			&& typeof (v as t).cursor === 'string'
			&& typeof (v as t).github_url === 'string';
	}
}

export type MatchRequest = {
	source: string;
};

export namespace MatchError {
	export type t = {
		kind: 'failure';
		reason: string;
		code: number;
		msg: string;
		meta?: any;
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& typeof (v as t).kind === 'string'
			&& typeof (v as t).reason === 'string'
			&& typeof (v as t).code === 'number'
			&& typeof (v as t).msg === 'string';
	}
}

export namespace MatchSuccess {
	export type t = {
		snippets: Snippet.t[];
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& 'snippets' in v
			&& Array.isArray(v.snippets)
			&& v.snippets.every(Snippet.is);
	}
}

export namespace MatchResponse {
	export type t = Result<MatchSuccess.t, MatchError.t>;

	export function to(v: unknown): t | undefined {
		if (MatchError.is(v)) {
			return Result.error(v);
		}
		if (MatchSuccess.is(v)) {
			return Result.ok(v);
		}
		return undefined;
	}
}

export type FileMatchRequest = {
	cursor: string;
};

export namespace FileMatch {
	export type t = {
		commit_id: string;
		license: string;
		nwo: string;
		path: string;
		url: string;
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& typeof (v as t).commit_id === 'string'
			&& typeof (v as t).license === 'string'
			&& typeof (v as t).nwo === 'string'
			&& typeof (v as t).path === 'string'
			&& typeof (v as t).url === 'string';
	}
}

export namespace PackageInformation {
	export type t = {
		has_next_page: boolean;
		cursor: string;
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& typeof (v as t).has_next_page === 'boolean'
			&& typeof (v as t).cursor === 'string';
	}
}

export namespace LicenseStats {
	export type t = {
		count: Record<string, string>;
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& typeof (v as t).count === 'object'
			&& Object.values((v as t).count).every(value => typeof value === 'string');
	}
}

export namespace FileMatchSuccess {
	export type t = {
		file_matches: FileMatch.t[];
		page_info: PackageInformation.t;
		license_stats: LicenseStats.t;
	};

	export function is(v: unknown): v is t {
		return typeof v === 'object' && v !== null
			&& 'file_matches' in v
			&& Array.isArray(v.file_matches)
			&& v.file_matches.every(FileMatch.is)
			&& 'page_info' in v
			&& PackageInformation.is(v.page_info)
			&& 'license_stats' in v
			&& LicenseStats.is(v.license_stats);
	}
}

export namespace FileMatchResponse {
	export type t = Result<FileMatchSuccess.t, MatchError.t>;

	export function to(v: unknown): t | undefined {
		if (MatchError.is(v)) {
			return Result.error(v);
		}
		if (FileMatchSuccess.is(v)) {
			return Result.ok(v);
		}
		return undefined;
	}
}

export type SnippetStatistics = {
	match: Snippet.t;
	files: FileMatch.t[];
	licenseStats: LicenseStats.t | null;
};
