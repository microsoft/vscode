/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as scorer from 'vs/base/parts/quickopen/common/quickOpenScorer';
import { URI } from 'vs/base/common/uri';
import { basename, dirname, sep } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';

class ResourceAccessorClass implements scorer.IItemAccessor<URI> {

	getItemLabel(resource: URI): string {
		return basename(resource.fsPath);
	}

	getItemDescription(resource: URI): string {
		return dirname(resource.fsPath);
	}

	getItemPath(resource: URI): string {
		return resource.fsPath;
	}
}

const ResourceAccessor = new ResourceAccessorClass();

class NullAccessorClass implements scorer.IItemAccessor<URI> {

	getItemLabel(resource: URI): string {
		return undefined!;
	}

	getItemDescription(resource: URI): string {
		return undefined!;
	}

	getItemPath(resource: URI): string {
		return undefined!;
	}
}

function _doScore(target: string, query: string, fuzzy: boolean): scorer.Score {
	return scorer.score(target, query, query.toLowerCase(), fuzzy);
}

function scoreItem<T>(item: T, query: string, fuzzy: boolean, accessor: scorer.IItemAccessor<T>, cache: scorer.ScorerCache): scorer.IItemScore {
	return scorer.scoreItem(item, scorer.prepareQuery(query), fuzzy, accessor, cache);
}

function compareItemsByScore<T>(itemA: T, itemB: T, query: string, fuzzy: boolean, accessor: scorer.IItemAccessor<T>, cache: scorer.ScorerCache, fallbackComparer = scorer.fallbackCompare): number {
	return scorer.compareItemsByScore(itemA, itemB, scorer.prepareQuery(query), fuzzy, accessor, cache, fallbackComparer);
}

const NullAccessor = new NullAccessorClass();
let cache: scorer.ScorerCache = Object.create(null);

suite('Quick Open Scorer', () => {

	setup(() => {
		cache = Object.create(null);
	});

	test('score (fuzzy)', function () {
		const target = 'HeLlo-World';

		const scores: scorer.Score[] = [];
		scores.push(_doScore(target, 'HelLo-World', true)); // direct case match
		scores.push(_doScore(target, 'hello-world', true)); // direct mix-case match
		scores.push(_doScore(target, 'HW', true)); // direct case prefix (multiple)
		scores.push(_doScore(target, 'hw', true)); // direct mix-case prefix (multiple)
		scores.push(_doScore(target, 'H', true)); // direct case prefix
		scores.push(_doScore(target, 'h', true)); // direct mix-case prefix
		scores.push(_doScore(target, 'ld', true)); // in-string mix-case match (consecutive, avoids scattered hit)
		scores.push(_doScore(target, 'W', true)); // direct case word prefix
		scores.push(_doScore(target, 'w', true)); // direct mix-case word prefix
		scores.push(_doScore(target, 'Ld', true)); // in-string case match (multiple)
		scores.push(_doScore(target, 'L', true)); // in-string case match
		scores.push(_doScore(target, 'l', true)); // in-string mix-case match
		scores.push(_doScore(target, '4', true)); // no match

		// Assert scoring order
		let sortedScores = scores.concat().sort((a, b) => b[0] - a[0]);
		assert.deepEqual(scores, sortedScores);

		// Assert scoring positions
		let positions = scores[0][1];
		assert.equal(positions.length, 'HelLo-World'.length);

		positions = scores[2][1];
		assert.equal(positions.length, 'HW'.length);
		assert.equal(positions[0], 0);
		assert.equal(positions[1], 6);
	});

	test('score (non fuzzy)', function () {
		const target = 'HeLlo-World';

		assert.ok(_doScore(target, 'HelLo-World', false)[0] > 0);
		assert.equal(_doScore(target, 'HelLo-World', false)[1].length, 'HelLo-World'.length);

		assert.ok(_doScore(target, 'hello-world', false)[0] > 0);
		assert.equal(_doScore(target, 'HW', false)[0], 0);
		assert.ok(_doScore(target, 'h', false)[0] > 0);
		assert.ok(_doScore(target, 'ello', false)[0] > 0);
		assert.ok(_doScore(target, 'ld', false)[0] > 0);
		assert.equal(_doScore(target, 'eo', false)[0], 0);
	});

	test('scoreItem - matches are proper', function () {
		let res = scoreItem(null, 'something', true, ResourceAccessor, cache);
		assert.ok(!res.score);

		const resource = URI.file('/xyz/some/path/someFile123.txt');

		res = scoreItem(resource, 'something', true, NullAccessor, cache);
		assert.ok(!res.score);

		// Path Identity
		const identityRes = scoreItem(resource, ResourceAccessor.getItemPath(resource), true, ResourceAccessor, cache);
		assert.ok(identityRes.score);
		assert.equal(identityRes.descriptionMatch!.length, 1);
		assert.equal(identityRes.labelMatch!.length, 1);
		assert.equal(identityRes.descriptionMatch![0].start, 0);
		assert.equal(identityRes.descriptionMatch![0].end, ResourceAccessor.getItemDescription(resource).length);
		assert.equal(identityRes.labelMatch![0].start, 0);
		assert.equal(identityRes.labelMatch![0].end, ResourceAccessor.getItemLabel(resource).length);

		// Basename Prefix
		const basenamePrefixRes = scoreItem(resource, 'som', true, ResourceAccessor, cache);
		assert.ok(basenamePrefixRes.score);
		assert.ok(!basenamePrefixRes.descriptionMatch);
		assert.equal(basenamePrefixRes.labelMatch!.length, 1);
		assert.equal(basenamePrefixRes.labelMatch![0].start, 0);
		assert.equal(basenamePrefixRes.labelMatch![0].end, 'som'.length);

		// Basename Camelcase
		const basenameCamelcaseRes = scoreItem(resource, 'sF', true, ResourceAccessor, cache);
		assert.ok(basenameCamelcaseRes.score);
		assert.ok(!basenameCamelcaseRes.descriptionMatch);
		assert.equal(basenameCamelcaseRes.labelMatch!.length, 2);
		assert.equal(basenameCamelcaseRes.labelMatch![0].start, 0);
		assert.equal(basenameCamelcaseRes.labelMatch![0].end, 1);
		assert.equal(basenameCamelcaseRes.labelMatch![1].start, 4);
		assert.equal(basenameCamelcaseRes.labelMatch![1].end, 5);

		// Basename Match
		const basenameRes = scoreItem(resource, 'of', true, ResourceAccessor, cache);
		assert.ok(basenameRes.score);
		assert.ok(!basenameRes.descriptionMatch);
		assert.equal(basenameRes.labelMatch!.length, 2);
		assert.equal(basenameRes.labelMatch![0].start, 1);
		assert.equal(basenameRes.labelMatch![0].end, 2);
		assert.equal(basenameRes.labelMatch![1].start, 4);
		assert.equal(basenameRes.labelMatch![1].end, 5);

		// Path Match
		const pathRes = scoreItem(resource, 'xyz123', true, ResourceAccessor, cache);
		assert.ok(pathRes.score);
		assert.ok(pathRes.descriptionMatch);
		assert.ok(pathRes.labelMatch);
		assert.equal(pathRes.labelMatch!.length, 1);
		assert.equal(pathRes.labelMatch![0].start, 8);
		assert.equal(pathRes.labelMatch![0].end, 11);
		assert.equal(pathRes.descriptionMatch!.length, 1);
		assert.equal(pathRes.descriptionMatch![0].start, 1);
		assert.equal(pathRes.descriptionMatch![0].end, 4);

		// No Match
		const noRes = scoreItem(resource, '987', true, ResourceAccessor, cache);
		assert.ok(!noRes.score);
		assert.ok(!noRes.labelMatch);
		assert.ok(!noRes.descriptionMatch);

		// Verify Scores
		assert.ok(identityRes.score > basenamePrefixRes.score);
		assert.ok(basenamePrefixRes.score > basenameRes.score);
		assert.ok(basenameRes.score > pathRes.score);
		assert.ok(pathRes.score > noRes.score);
	});

	test('scoreItem - invalid input', function () {

		let res = scoreItem(null, null!, true, ResourceAccessor, cache);
		assert.equal(res.score, 0);

		res = scoreItem(null, 'null', true, ResourceAccessor, cache);
		assert.equal(res.score, 0);
	});

	test('scoreItem - optimize for file paths', function () {
		const resource = URI.file('/xyz/others/spath/some/xsp/file123.txt');

		// xsp is more relevant to the end of the file path even though it matches
		// fuzzy also in the beginning. we verify the more relevant match at the
		// end gets returned.
		const pathRes = scoreItem(resource, 'xspfile123', true, ResourceAccessor, cache);
		assert.ok(pathRes.score);
		assert.ok(pathRes.descriptionMatch);
		assert.ok(pathRes.labelMatch);
		assert.equal(pathRes.labelMatch!.length, 1);
		assert.equal(pathRes.labelMatch![0].start, 0);
		assert.equal(pathRes.labelMatch![0].end, 7);
		assert.equal(pathRes.descriptionMatch!.length, 1);
		assert.equal(pathRes.descriptionMatch![0].start, 23);
		assert.equal(pathRes.descriptionMatch![0].end, 26);
	});

	test('scoreItem - avoid match scattering (bug #36119)', function () {
		const resource = URI.file('projects/ui/cula/ats/target.mk');

		const pathRes = scoreItem(resource, 'tcltarget.mk', true, ResourceAccessor, cache);
		assert.ok(pathRes.score);
		assert.ok(pathRes.descriptionMatch);
		assert.ok(pathRes.labelMatch);
		assert.equal(pathRes.labelMatch!.length, 1);
		assert.equal(pathRes.labelMatch![0].start, 0);
		assert.equal(pathRes.labelMatch![0].end, 9);
	});

	test('scoreItem - prefers more compact matches', function () {
		const resource = URI.file('/1a111d1/11a1d1/something.txt');

		// expect "ad" to be matched towards the end of the file because the
		// match is more compact
		const res = scoreItem(resource, 'ad', true, ResourceAccessor, cache);
		assert.ok(res.score);
		assert.ok(res.descriptionMatch);
		assert.ok(!res.labelMatch!.length);
		assert.equal(res.descriptionMatch!.length, 2);
		assert.equal(res.descriptionMatch![0].start, 11);
		assert.equal(res.descriptionMatch![0].end, 12);
		assert.equal(res.descriptionMatch![1].start, 13);
		assert.equal(res.descriptionMatch![1].end, 14);
	});

	test('scoreItem - proper target offset', function () {
		const resource = URI.file('etem');

		const res = scoreItem(resource, 'teem', true, ResourceAccessor, cache);
		assert.ok(!res.score);
	});

	test('scoreItem - proper target offset #2', function () {
		const resource = URI.file('ede');

		const res = scoreItem(resource, 'de', true, ResourceAccessor, cache);

		assert.equal(res.labelMatch!.length, 1);
		assert.equal(res.labelMatch![0].start, 1);
		assert.equal(res.labelMatch![0].end, 3);
	});

	test('scoreItem - proper target offset #3', function () {
		const resource = URI.file('/src/vs/editor/browser/viewParts/lineNumbers/flipped-cursor-2x.svg');

		const res = scoreItem(resource, 'debug', true, ResourceAccessor, cache);

		assert.equal(res.descriptionMatch!.length, 3);
		assert.equal(res.descriptionMatch![0].start, 9);
		assert.equal(res.descriptionMatch![0].end, 10);
		assert.equal(res.descriptionMatch![1].start, 36);
		assert.equal(res.descriptionMatch![1].end, 37);
		assert.equal(res.descriptionMatch![2].start, 40);
		assert.equal(res.descriptionMatch![2].end, 41);

		assert.equal(res.labelMatch!.length, 2);
		assert.equal(res.labelMatch![0].start, 9);
		assert.equal(res.labelMatch![0].end, 10);
		assert.equal(res.labelMatch![1].start, 20);
		assert.equal(res.labelMatch![1].end, 21);
	});

	test('scoreItem - no match unless query contained in sequence', function () {
		const resource = URI.file('abcde');

		const res = scoreItem(resource, 'edcda', true, ResourceAccessor, cache);
		assert.ok(!res.score);
	});

	test('compareItemsByScore - identity', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileB.txt');
		const resourceC = URI.file('/unrelated/some/path/other/fileC.txt');

		// Full resource A path
		let query = ResourceAccessor.getItemPath(resourceA);

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		// Full resource B path
		query = ResourceAccessor.getItemPath(resourceB);

		res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - basename prefix', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileB.txt');
		const resourceC = URI.file('/unrelated/some/path/other/fileC.txt');

		// Full resource A basename
		let query = ResourceAccessor.getItemLabel(resourceA);

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		// Full resource B basename
		query = ResourceAccessor.getItemLabel(resourceB);

		res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - basename camelcase', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileB.txt');
		const resourceC = URI.file('/unrelated/some/path/other/fileC.txt');

		// resource A camelcase
		let query = 'fA';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		// resource B camelcase
		query = 'fB';

		res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - basename scores', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileB.txt');
		const resourceC = URI.file('/unrelated/some/path/other/fileC.txt');

		// Resource A part of basename
		let query = 'fileA';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		// Resource B part of basename
		query = 'fileB';

		res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - path scores', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileB.txt');
		const resourceC = URI.file('/unrelated/some/path/other/fileC.txt');

		// Resource A part of path
		let query = 'pathfileA';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		// Resource B part of path
		query = 'pathfileB';

		res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - prefer shorter basenames', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileBLonger.txt');
		const resourceC = URI.file('/unrelated/the/path/other/fileC.txt');

		// Resource A part of path
		let query = 'somepath';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - prefer shorter basenames (match on basename)', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileBLonger.txt');
		const resourceC = URI.file('/unrelated/the/path/other/fileC.txt');

		// Resource A part of path
		let query = 'file';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceC);
		assert.equal(res[2], resourceB);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceC);
		assert.equal(res[2], resourceB);
	});

	test('compareFilesByScore - prefer shorter paths', function () {
		const resourceA = URI.file('/some/path/fileA.txt');
		const resourceB = URI.file('/some/path/other/fileB.txt');
		const resourceC = URI.file('/unrelated/some/path/other/fileC.txt');

		// Resource A part of path
		let query = 'somepath';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - prefer shorter paths (bug #17443)', function () {
		const resourceA = URI.file('config/test/t1.js');
		const resourceB = URI.file('config/test.js');
		const resourceC = URI.file('config/test/t2.js');

		let query = 'co/te';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
		assert.equal(res[2], resourceC);
	});

	test('compareFilesByScore - allow to provide fallback sorter (bug #31591)', function () {
		const resourceA = URI.file('virtual/vscode.d.ts');
		const resourceB = URI.file('vscode/src/vs/vscode.d.ts');

		let query = 'vscode';

		let res = [resourceA, resourceB].sort((r1, r2) => {
			return compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache, (r1, r2, query, ResourceAccessor) => {
				if (r1 as any /* TS fail */ === resourceA) {
					return -1;
				}

				return 1;
			});
		});
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => {
			return compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache, (r1, r2, query, ResourceAccessor) => {
				if (r1 as any /* TS fail */ === resourceB) {
					return -1;
				}

				return 1;
			});
		});
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
	});

	test('compareFilesByScore - prefer more compact camel case matches', function () {
		const resourceA = URI.file('config/test/openthisAnythingHandler.js');
		const resourceB = URI.file('config/test/openthisisnotsorelevantforthequeryAnyHand.js');

		let query = 'AH';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
	});

	test('compareFilesByScore - prefer more compact matches (label)', function () {
		const resourceA = URI.file('config/test/examasdaple.js');
		const resourceB = URI.file('config/test/exampleasdaasd.ts');

		let query = 'xp';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
	});

	test('compareFilesByScore - prefer more compact matches (path)', function () {
		const resourceA = URI.file('config/test/examasdaple/file.js');
		const resourceB = URI.file('config/test/exampleasdaasd/file.ts');

		let query = 'xp';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
	});

	test('compareFilesByScore - prefer more compact matches (label and path)', function () {
		const resourceA = URI.file('config/example/thisfile.ts');
		const resourceB = URI.file('config/24234243244/example/file.js');

		let query = 'exfile';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
		assert.equal(res[1], resourceA);
	});

	test('compareFilesByScore - avoid match scattering (bug #34210)', function () {
		const resourceA = URI.file('node_modules1/bundle/lib/model/modules/ot1/index.js');
		const resourceB = URI.file('node_modules1/bundle/lib/model/modules/un1/index.js');
		const resourceC = URI.file('node_modules1/bundle/lib/model/modules/modu1/index.js');
		const resourceD = URI.file('node_modules1/bundle/lib/model/modules/oddl1/index.js');

		let query = isWindows ? 'modu1\\index.js' : 'modu1/index.js';

		let res = [resourceA, resourceB, resourceC, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceC);

		res = [resourceC, resourceB, resourceA, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceC);

		query = isWindows ? 'un1\\index.js' : 'un1/index.js';

		res = [resourceA, resourceB, resourceC, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceC, resourceB, resourceA, resourceD].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #21019 1.)', function () {
		const resourceA = URI.file('app/containers/Services/NetworkData/ServiceDetails/ServiceLoad/index.js');
		const resourceB = URI.file('app/containers/Services/NetworkData/ServiceDetails/ServiceDistribution/index.js');
		const resourceC = URI.file('app/containers/Services/NetworkData/ServiceDetailTabs/ServiceTabs/StatVideo/index.js');

		let query = 'StatVideoindex';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceC);
	});

	test('compareFilesByScore - avoid match scattering (bug #21019 2.)', function () {
		const resourceA = URI.file('src/build-helper/store/redux.ts');
		const resourceB = URI.file('src/repository/store/redux.ts');

		let query = 'reproreduxts';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #26649)', function () {
		const resourceA = URI.file('photobook/src/components/AddPagesButton/index.js');
		const resourceB = URI.file('photobook/src/components/ApprovalPageHeader/index.js');
		const resourceC = URI.file('photobook/src/canvasComponents/BookPage/index.js');

		let query = 'bookpageIndex';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceC);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceC);
	});

	test('compareFilesByScore - avoid match scattering (bug #33247)', function () {
		const resourceA = URI.file('ui/src/utils/constants.js');
		const resourceB = URI.file('ui/src/ui/Icons/index.js');

		let query = isWindows ? 'ui\\icons' : 'ui/icons';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #33247 comment)', function () {
		const resourceA = URI.file('ui/src/components/IDInput/index.js');
		const resourceB = URI.file('ui/src/ui/Input/index.js');

		let query = isWindows ? 'ui\\input\\index' : 'ui/input/index';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #36166)', function () {
		const resourceA = URI.file('django/contrib/sites/locale/ga/LC_MESSAGES/django.mo');
		const resourceB = URI.file('django/core/signals.py');

		let query = 'djancosig';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #32918)', function () {
		const resourceA = URI.file('adsys/protected/config.php');
		const resourceB = URI.file('adsys/protected/framework/smarty/sysplugins/smarty_internal_config.php');
		const resourceC = URI.file('duowanVideo/wap/protected/config.php');

		let query = 'protectedconfig.php';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceC);
		assert.equal(res[2], resourceB);

		res = [resourceC, resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceA);
		assert.equal(res[1], resourceC);
		assert.equal(res[2], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #14879)', function () {
		const resourceA = URI.file('pkg/search/gradient/testdata/constraint_attrMatchString.yml');
		const resourceB = URI.file('cmd/gradient/main.go');

		let query = 'gradientmain';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #14727 1)', function () {
		const resourceA = URI.file('alpha-beta-cappa.txt');
		const resourceB = URI.file('abc.txt');

		let query = 'abc';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #14727 2)', function () {
		const resourceA = URI.file('xerxes-yak-zubba/index.js');
		const resourceB = URI.file('xyz/index.js');

		let query = 'xyz';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #18381)', function () {
		const resourceA = URI.file('AssymblyInfo.cs');
		const resourceB = URI.file('IAsynchronousTask.java');

		let query = 'async';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #35572)', function () {
		const resourceA = URI.file('static/app/source/angluar/-admin/-organization/-settings/layout/layout.js');
		const resourceB = URI.file('static/app/source/angular/-admin/-project/-settings/_settings/settings.js');

		let query = 'partisettings';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #36810)', function () {
		const resourceA = URI.file('Trilby.TrilbyTV.Web.Portal/Views/Systems/Index.cshtml');
		const resourceB = URI.file('Trilby.TrilbyTV.Web.Portal/Areas/Admins/Views/Tips/Index.cshtml');

		let query = 'tipsindex.cshtml';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - prefer shorter hit (bug #20546)', function () {
		const resourceA = URI.file('editor/core/components/tests/list-view-spec.js');
		const resourceB = URI.file('editor/core/components/list-view.js');

		let query = 'listview';

		let res = [resourceA, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceB, resourceA].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('compareFilesByScore - avoid match scattering (bug #12095)', function () {
		const resourceA = URI.file('src/vs/workbench/contrib/files/common/explorerViewModel.ts');
		const resourceB = URI.file('src/vs/workbench/contrib/files/browser/views/explorerView.ts');
		const resourceC = URI.file('src/vs/workbench/contrib/files/browser/views/explorerViewer.ts');

		let query = 'filesexplorerview.ts';

		let res = [resourceA, resourceB, resourceC].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);

		res = [resourceA, resourceC, resourceB].sort((r1, r2) => compareItemsByScore(r1, r2, query, true, ResourceAccessor, cache));
		assert.equal(res[0], resourceB);
	});

	test('prepareSearchForScoring', () => {
		assert.equal(scorer.prepareQuery(' f*a ').value, 'fa');
		assert.equal(scorer.prepareQuery('model Tester.ts').value, 'modelTester.ts');
		assert.equal(scorer.prepareQuery('Model Tester.ts').lowercase, 'modeltester.ts');
		assert.equal(scorer.prepareQuery('ModelTester.ts').containsPathSeparator, false);
		assert.equal(scorer.prepareQuery('Model' + sep + 'Tester.ts').containsPathSeparator, true);
	});
});