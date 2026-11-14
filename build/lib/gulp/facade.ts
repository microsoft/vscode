/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Single entry-point for all gulp-related modules used in `./build`.
// All files under `./build` must import gulp and any `gulp-*` plugin from
// this facade rather than from the underlying packages directly. This is
// enforced by the `local/code-no-direct-gulp-import` ESLint rule.
// This allows us to keep track of the gulp plugins we actually use.

/* eslint-disable local/code-no-direct-gulp-import */

import filter_ from 'gulp-filter';
import minimatch from 'minimatch';
import path from 'path';
import type File from 'vinyl';
import rename_ from 'gulp-rename';
import replace_ from 'gulp-replace';
import plumber_ from 'gulp-plumber';
import sourcemaps_ from 'gulp-sourcemaps';
import flatmap_ from 'gulp-flatmap';
import gunzip_ from 'gulp-gunzip';
import gzip_ from 'gulp-gzip';
import jsonEditor_ from 'gulp-json-editor';
import mergeJson_ from 'gulp-merge-json';
import azureStorage_ from 'gulp-azure-storage';
import bom_ from 'gulp-bom';
import buffer_ from 'gulp-buffer';
import vinylZip_ from '@vscode/gulp-vinyl-zip';
import sort_ from 'gulp-sort';
import g from 'gulp';

/**
 * gulp-filter, with glob patterns compiled once rather than for every file. Matches like gulp-filter does, which
 * applies the patterns in order: a pattern adds a matching file and a negated pattern removes it.
 */
export function filter(pattern: string | string[] | filter_.FileFunction, options?: filter_.Options): filter_.Filter {
	return filter_(typeof pattern === 'function' ? pattern : compileFilterPattern(pattern, options), options);
}

function compileFilterPattern(pattern: string | readonly string[], options: minimatch.IOptions = {}): filter_.FileFunction {
	const matchers = (typeof pattern === 'string' ? [pattern] : pattern).map(glob => {
		const negated = glob[0] === '!';
		return { negated, matcher: new minimatch.Minimatch(negated ? glob.slice(1) : glob, options) };
	});
	return (file: File) => {
		let relativePath = path.relative(file.cwd, file.path);
		if (/^\.\.[\\/]/.test(relativePath)) {
			relativePath = path.resolve(relativePath);
		}
		let matched = false;
		for (const { negated, matcher } of matchers) {
			if (matched === negated && matcher.match(relativePath)) {
				matched = !negated;
			}
		}
		return matched;
	};
}

export type { FileFunction } from 'gulp-filter';
export const rename = rename_;
export const replace = replace_;
export const plumber = plumber_;
export const sourcemaps = sourcemaps_;
export const flatmap = flatmap_;
export const gunzip = gunzip_;
export const gzip = gzip_;
export const jsonEditor = jsonEditor_;
export const mergeJson = mergeJson_;
export const azureStorage = azureStorage_;
export const bom = bom_;
export const buffer = buffer_;
export const vinylZip = vinylZip_;
export const sort = sort_;

export const gulp = {
	// Import task, sequence and parallel from "../lib/task"!
	src: g.src,
	dest: g.dest
};
