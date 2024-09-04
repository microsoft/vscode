/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../base/common/assert.js';
import { clamp } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import { chartsGreen, chartsRed, chartsYellow } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariableName } from '../../../../platform/theme/common/colorUtils.js';
import { CoverageBarSource } from './testCoverageBars.js';
import { ITestingCoverageBarThresholds, TestingDisplayedCoveragePercent } from '../common/configuration.js';
import { getTotalCoveragePercent } from '../common/testCoverage.js';
import { TestId } from '../common/testId.js';
import { LiveTestResult } from '../common/testResult.js';
import { ICoverageCount } from '../common/testTypes.js';

export const percent = (cc: ICoverageCount) => clamp(cc.total === 0 ? 1 : cc.covered / cc.total, 0, 1);

const colorThresholds = [
	{ color: `var(${asCssVariableName(chartsRed)})`, key: 'red' },
	{ color: `var(${asCssVariableName(chartsYellow)})`, key: 'yellow' },
	{ color: `var(${asCssVariableName(chartsGreen)})`, key: 'green' },
] as const;

export const getCoverageColor = (pct: number, thresholds: ITestingCoverageBarThresholds) => {
	let best = colorThresholds[0].color; //  red
	let distance = pct;
	for (const { key, color } of colorThresholds) {
		const t = thresholds[key] / 100;
		if (t && pct >= t && pct - t < distance) {
			best = color;
			distance = pct - t;
		}
	}
	return best;
};


const epsilon = 10e-8;

export const displayPercent = (value: number, precision = 2) => {
	const display = (value * 100).toFixed(precision);

	// avoid showing 100% coverage if it just rounds up:
	if (value < 1 - epsilon && display === '100') {
		return `${100 - (10 ** -precision)}%`;
	}

	return `${display}%`;
};

export const calculateDisplayedStat = (coverage: CoverageBarSource, method: TestingDisplayedCoveragePercent) => {
	switch (method) {
		case TestingDisplayedCoveragePercent.Statement:
			return percent(coverage.statement);
		case TestingDisplayedCoveragePercent.Minimum: {
			let value = percent(coverage.statement);
			if (coverage.branch) { value = Math.min(value, percent(coverage.branch)); }
			if (coverage.declaration) { value = Math.min(value, percent(coverage.declaration)); }
			return value;
		}
		case TestingDisplayedCoveragePercent.TotalCoverage:
			return getTotalCoveragePercent(coverage.statement, coverage.branch, coverage.declaration);
		default:
			assertNever(method);
	}
};

export function getLabelForItem(result: LiveTestResult, testId: TestId, commonPrefixLen: number) {
	const parts: string[] = [];
	for (const id of testId.idsFromRoot()) {
		const item = result.getTestById(id.toString());
		if (!item) {
			break;
		}

		parts.push(item.label);
	}

	return parts.slice(commonPrefixLen).join(' \u203a ');
}

export namespace labels {
	export const showingFilterFor = (label: string) => localize('testing.coverageForTest', "Showing \"{0}\"", label);
	export const clickToChangeFiltering = localize('changePerTestFilter', 'Click to view coverage for a single test');
	export const percentCoverage = (percent: number, precision?: number) => localize('testing.percentCoverage', '{0} Coverage', displayPercent(percent, precision));
	export const allTests = localize('testing.allTests', 'All tests');
	export const pickShowCoverage = localize('testing.pickTest', 'Pick a test to show coverage for');
}
