// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

/**
 * Status of a visual comparison.
 */
export type ComparisonStatus = 'passed' | 'failed' | 'no_baseline' | 'dimension_mismatch';

/**
 * Result of comparing a screenshot against its baseline.
 */
export interface ComparisonResult {
	name: string;
	status: ComparisonStatus;
	mismatchPercentage: number;
	mismatchPixels: number;
	totalPixels: number;
	diffImagePath: string | null;
	message: string;
}

/**
 * Summary report for a batch of visual comparisons.
 */
export interface ComparisonReport {
	timestamp: number;
	total: number;
	passed: number;
	failed: number;
	noBaseline: number;
	dimensionMismatch: number;
	results: ComparisonResult[];
	summary: string;
}

/**
 * Metadata about a stored baseline screenshot.
 */
export interface BaselineInfo {
	name: string;
	path: string;
	savedAt: number;
	width: number;
	height: number;
}
