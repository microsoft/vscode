/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { assertNever } from '../../../../base/common/assert.js';
import { clamp } from '../../../../base/common/numbers.js';
import { localize } from '../../../../nls.js';
import { chartsGreen, chartsRed, chartsYellow } from '../../../../platform/theme/common/colorRegistry.js';
import { asCssVariableName } from '../../../../platform/theme/common/colorUtils.js';
import { getTotalCoveragePercent } from '../common/testCoverage.js';
export const percent = (cc) => clamp(cc.total === 0 ? 1 : cc.covered / cc.total, 0, 1);
const colorThresholds = [
    { color: `var(${asCssVariableName(chartsRed)})`, key: 'red' },
    { color: `var(${asCssVariableName(chartsYellow)})`, key: 'yellow' },
    { color: `var(${asCssVariableName(chartsGreen)})`, key: 'green' },
];
export const getCoverageColor = (pct, thresholds) => {
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
export const displayPercent = (value, precision = 2) => {
    const display = (value * 100).toFixed(precision);
    // avoid showing 100% coverage if it just rounds up:
    if (value < 1 - epsilon && display === '100') {
        return `${100 - (10 ** -precision)}%`;
    }
    return `${display}%`;
};
export const calculateDisplayedStat = (coverage, method) => {
    switch (method) {
        case "statement" /* TestingDisplayedCoveragePercent.Statement */:
            return percent(coverage.statement);
        case "minimum" /* TestingDisplayedCoveragePercent.Minimum */: {
            let value = percent(coverage.statement);
            if (coverage.branch) {
                value = Math.min(value, percent(coverage.branch));
            }
            if (coverage.declaration) {
                value = Math.min(value, percent(coverage.declaration));
            }
            return value;
        }
        case "totalCoverage" /* TestingDisplayedCoveragePercent.TotalCoverage */:
            return getTotalCoveragePercent(coverage.statement, coverage.branch, coverage.declaration);
        default:
            assertNever(method);
    }
};
export function getLabelForItem(result, testId, commonPrefixLen) {
    const parts = [];
    for (const id of testId.idsFromRoot()) {
        const item = result.getTestById(id.toString());
        if (!item) {
            break;
        }
        parts.push(item.label);
    }
    return parts.slice(commonPrefixLen).join(' \u203a ');
}
export var labels;
(function (labels) {
    labels.showingFilterFor = (label) => localize('testing.coverageForTest', "Showing \"{0}\"", label);
    labels.clickToChangeFiltering = localize('changePerTestFilter', 'Click to view coverage for a single test');
    labels.percentCoverage = (percent, precision) => localize('testing.percentCoverage', '{0} Coverage', displayPercent(percent, precision));
    labels.allTests = localize('testing.allTests', 'All tests');
    labels.pickShowCoverage = localize('testing.pickTest', 'Pick a test to show coverage for');
})(labels || (labels = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUNvdmVyYWdlRGlzcGxheVV0aWxzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVzdGluZy9icm93c2VyL2NvZGVDb3ZlcmFnZURpc3BsYXlVdGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsV0FBVyxFQUFFLFNBQVMsRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUMxRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUdwRixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUtwRSxNQUFNLENBQUMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxFQUFrQixFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUMsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUV2RyxNQUFNLGVBQWUsR0FBRztJQUN2QixFQUFFLEtBQUssRUFBRSxPQUFPLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEtBQUssRUFBRTtJQUM3RCxFQUFFLEtBQUssRUFBRSxPQUFPLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLFFBQVEsRUFBRTtJQUNuRSxFQUFFLEtBQUssRUFBRSxPQUFPLGlC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