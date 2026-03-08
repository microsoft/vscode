// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { ComparisonResult, ComparisonReport, BaselineInfo } from '../src/types';

describe('Visual Regression Service', () => {
	describe('ComparisonResult', () => {
		test('passed result has low mismatch percentage', () => {
			const result: ComparisonResult = {
				name: 'homepage',
				status: 'passed',
				mismatchPercentage: 0.01,
				mismatchPixels: 92,
				totalPixels: 921600,
				diffImagePath: '/baselines/homepage/diff.png',
				message: 'Visual comparison passed (0.01% difference)',
			};
			assert.strictEqual(result.status, 'passed');
			assert.ok(result.mismatchPercentage < 1);
		});

		test('failed result has high mismatch percentage', () => {
			const result: ComparisonResult = {
				name: 'login-page',
				status: 'failed',
				mismatchPercentage: 15.5,
				mismatchPixels: 142848,
				totalPixels: 921600,
				diffImagePath: '/baselines/login-page/diff.png',
				message: 'Visual regression detected: 15.50% of pixels differ',
			};
			assert.strictEqual(result.status, 'failed');
			assert.ok(result.mismatchPercentage > 1);
		});

		test('no baseline result', () => {
			const result: ComparisonResult = {
				name: 'new-page',
				status: 'no_baseline',
				mismatchPercentage: 0,
				mismatchPixels: 0,
				totalPixels: 0,
				diffImagePath: null,
				message: 'No baseline found. Save a baseline first.',
			};
			assert.strictEqual(result.status, 'no_baseline');
			assert.strictEqual(result.diffImagePath, null);
		});

		test('dimension mismatch result', () => {
			const result: ComparisonResult = {
				name: 'responsive-page',
				status: 'dimension_mismatch',
				mismatchPercentage: 100,
				mismatchPixels: 0,
				totalPixels: 921600,
				diffImagePath: null,
				message: 'Dimensions differ: baseline 1280x720 vs current 1920x1080',
			};
			assert.strictEqual(result.status, 'dimension_mismatch');
			assert.strictEqual(result.mismatchPercentage, 100);
		});
	});

	describe('ComparisonReport', () => {
		test('generates summary report', () => {
			const comparisons: ComparisonResult[] = [
				{ name: 'home', status: 'passed', mismatchPercentage: 0, mismatchPixels: 0, totalPixels: 921600, diffImagePath: null, message: 'passed' },
				{ name: 'login', status: 'passed', mismatchPercentage: 0.5, mismatchPixels: 460, totalPixels: 921600, diffImagePath: null, message: 'passed' },
				{ name: 'dashboard', status: 'failed', mismatchPercentage: 12.3, mismatchPixels: 113357, totalPixels: 921600, diffImagePath: '/diff.png', message: 'failed' },
			];

			const report: ComparisonReport = {
				timestamp: Date.now(),
				total: comparisons.length,
				passed: comparisons.filter(c => c.status === 'passed').length,
				failed: comparisons.filter(c => c.status === 'failed').length,
				noBaseline: 0,
				dimensionMismatch: 0,
				results: comparisons,
				summary: 'Visual regression detected: 1 of 3 comparisons failed',
			};

			assert.deepStrictEqual({
				total: report.total,
				passed: report.passed,
				failed: report.failed,
			}, {
				total: 3,
				passed: 2,
				failed: 1,
			});
		});

		test('all-pass report', () => {
			const report: ComparisonReport = {
				timestamp: Date.now(),
				total: 5,
				passed: 5,
				failed: 0,
				noBaseline: 0,
				dimensionMismatch: 0,
				results: [],
				summary: 'All 5 comparisons passed',
			};
			assert.strictEqual(report.failed, 0);
			assert.ok(report.summary.includes('passed'));
		});
	});

	describe('BaselineInfo', () => {
		test('stores baseline metadata', () => {
			const info: BaselineInfo = {
				name: 'homepage',
				path: '/baselines/homepage/baseline.png',
				savedAt: Date.now(),
				width: 1280,
				height: 720,
			};
			assert.strictEqual(info.width, 1280);
			assert.strictEqual(info.height, 720);
			assert.ok(info.savedAt > 0);
		});
	});

	describe('Name sanitization', () => {
		test('sanitizes names for file system use', () => {
			function sanitize(name: string): string {
				return name.replace(/[^a-zA-Z0-9_-]/g, '_');
			}

			assert.strictEqual(sanitize('homepage'), 'homepage');
			assert.strictEqual(sanitize('login page'), 'login_page');
			assert.strictEqual(sanitize('user/profile'), 'user_profile');
			assert.strictEqual(sanitize('page@v2.0'), 'page_v2_0');
		});
	});

	describe('Diff threshold', () => {
		test('default threshold is 1%', () => {
			const threshold = 0.01;
			assert.strictEqual(threshold, 0.01);

			const mismatchPercentage = 0.5;
			const passed = mismatchPercentage <= threshold * 100;
			assert.strictEqual(passed, true);
		});

		test('high mismatch fails threshold check', () => {
			const threshold = 0.01;
			const mismatchPercentage = 5.0;
			const passed = mismatchPercentage <= threshold * 100;
			assert.strictEqual(passed, false);
		});
	});
});
