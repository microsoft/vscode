/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExplorerTestCoverageBars_1;
import { h } from '../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import * as coverUtils from './codeCoverageDisplayUtils.js';
import { getTestingConfiguration, observeTestingConfiguration } from '../common/configuration.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { safeIntl } from '../../../../base/common/date.js';
let ManagedTestCoverageBars = class ManagedTestCoverageBars extends Disposable {
    /** Gets whether coverage is currently visible for the resource. */
    get visible() {
        return !!this._coverage;
    }
    constructor(options, configurationService, hoverService) {
        super();
        this.options = options;
        this.configurationService = configurationService;
        this.hoverService = hoverService;
        this.el = new Lazy(() => {
            if (this.options.compact) {
                const el = h('.test-coverage-bars.compact', [
                    h('.tpc@overall'),
                    h('.bar@tpcBar'),
                ]);
                this.attachHover(el.tpcBar, getOverallHoverText);
                return el;
            }
            else {
                const el = h('.test-coverage-bars', [
                    h('.tpc@overall'),
                    h('.bar@statement'),
                    h('.bar@function'),
                    h('.bar@branch'),
                ]);
                this.attachHover(el.statement, stmtCoverageText);
                this.attachHover(el.function, fnCoverageText);
                this.attachHover(el.branch, branchCoverageText);
                return el;
            }
        });
        this.visibleStore = this._register(new DisposableStore());
        this.customHovers = [];
    }
    attachHover(target, factory) {
        this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), target, () => this._coverage && factory(this._coverage)));
    }
    setCoverageInfo(coverage) {
        const ds = this.visibleStore;
        if (!coverage) {
            if (this._coverage) {
                this._coverage = undefined;
                this.customHovers.forEach(c => c.hide());
                ds.clear();
            }
            return;
        }
        if (!this._coverage) {
            const root = this.el.value.root;
            ds.add(toDisposable(() => root.remove()));
            this.options.container.appendChild(root);
            ds.add(this.configurationService.onDidChangeConfiguration(c => {
                if (!this._coverage) {
                    return;
                }
                if (c.affectsConfiguration("testing.displayedCoveragePercent" /* TestingConfigKeys.CoveragePercent */) || c.affectsConfiguration("testing.coverageBarThresholds" /* TestingConfigKeys.CoverageBarThresholds */)) {
                    this.doRender(this._coverage);
                }
            }));
        }
        this._coverage = coverage;
        this.doRender(coverage);
    }
    doRender(coverage) {
        const el = this.el.value;
        const precision = this.options.compact ? 0 : 2;
        const thresholds = getTestingConfiguration(this.configurationService, "testing.coverageBarThresholds" /* TestingConfigKeys.CoverageBarThresholds */);
        const overallStat = coverUtils.calculateDisplayedStat(coverage, getTestingConfiguration(this.configurationService, "testing.displayedCoveragePercent" /* TestingConfigKeys.CoveragePercent */));
        if (this.options.overall !== false) {
            el.overall.textContent = coverUtils.displayPercent(overallStat, precision);
        }
        else {
            el.overall.style.display = 'none';
        }
        if ('tpcBar' in el) { // compact mode
            renderBar(el.tpcBar, overallStat, false, thresholds);
        }
        else {
            renderBar(el.statement, coverUtils.percent(coverage.statement), coverage.statement.total === 0, thresholds);
            renderBar(el.function, coverage.declaration && coverUtils.percent(coverage.declaration), coverage.declaration?.total === 0, thresholds);
            renderBar(el.branch, coverage.branch && coverUtils.percent(coverage.branch), coverage.branch?.total === 0, thresholds);
        }
    }
};
ManagedTestCoverageBars = __decorate([
    __param(1, IConfigurationService),
    __param(2, IHoverService)
], ManagedTestCoverageBars);
export { ManagedTestCoverageBars };
const barWidth = 16;
const renderBar = (bar, pct, isZero, thresholds) => {
    if (pct === undefined) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'block';
    bar.style.width = `${barWidth}px`;
    // this is floored so the bar is only completely filled at 100% and not 99.9%
    bar.style.setProperty('--test-bar-width', `${Math.floor(pct * 16)}px`);
    if (isZero) {
        bar.style.color = 'currentColor';
        bar.style.opacity = '0.5';
        return;
    }
    bar.style.color = coverUtils.getCoverageColor(pct, thresholds);
    bar.style.opacity = '1';
};
const nf = safeIntl.NumberFormat();
const stmtCoverageText = (coverage) => localize('statementCoverage', '{0}/{1} statements covered ({2})', nf.value.format(coverage.statement.covered), nf.value.format(coverage.statement.total), coverUtils.displayPercent(coverUtils.percent(coverage.statement)));
const fnCoverageText = (coverage) => coverage.declaration && localize('functionCoverage', '{0}/{1} functions covered ({2})', nf.value.format(coverage.declaration.covered), nf.value.format(coverage.declaration.total), coverUtils.displayPercent(coverUtils.percent(coverage.declaration)));
const branchCoverageText = (coverage) => coverage.branch && localize('branchCoverage', '{0}/{1} branches covered ({2})', nf.value.format(coverage.branch.covered), nf.value.format(coverage.branch.total), coverUtils.displayPercent(coverUtils.percent(coverage.branch)));
const getOverallHoverText = (coverage) => {
    const str = [
        stmtCoverageText(coverage),
        fnCoverageText(coverage),
        branchCoverageText(coverage),
    ].filter(isDefined).join('\n\n');
    return {
        markdown: new MarkdownString().appendText(str),
        markdownNotSupportedFallback: str
    };
};
/**
 * Renders test coverage bars for a resource in the given container. It will
 * not render anything unless a test coverage report has been opened.
 */
let ExplorerTestCoverageBars = class ExplorerTestCoverageBars extends ManagedTestCoverageBars {
    static { ExplorerTestCoverageBars_1 = this; }
    static { this.hasRegistered = false; }
    static register() {
        if (this.hasRegistered) {
            return;
        }
        this.hasRegistered = true;
        Registry.as("workbench.registry.explorer.fileContributions" /* ExplorerExtensions.FileContributionRegistry */).register({
            create(insta, container) {
                return insta.createInstance(ExplorerTestCoverageBars_1, { compact: true, container });
            },
        });
    }
    constructor(options, configurationService, hoverService, testCoverageService) {
        super(options, configurationService, hoverService);
        this.resource = observableValue(this, undefined);
        const isEnabled = observeTestingConfiguration(configurationService, "testing.showCoverageInExplorer" /* TestingConfigKeys.ShowCoverageInExplorer */);
        this._register(autorun(async (reader) => {
            let info;
            const coverage = testCoverageService.selected.read(reader);
            if (coverage && isEnabled.read(reader)) {
                const resource = this.resource.read(reader);
                if (resource) {
                    info = coverage.getComputedForUri(resource);
                }
            }
            this.setCoverageInfo(info);
        }));
    }
    /** @inheritdoc */
    setResource(resource, transaction) {
        this.resource.set(resource, transaction);
    }
    setCoverageInfo(coverage) {
        super.setCoverageInfo(coverage);
        this.options.container?.classList.toggle('explorer-item-with-test-coverage', this.visible);
    }
};
ExplorerTestCoverageBars = ExplorerTestCoverageBars_1 = __decorate([
    __param(1, IConfigurationService),
    __param(2, IHoverService),
    __param(3, ITestCoverageService)
], ExplorerTestCoverageBars);
export { ExplorerTestCoverageBars };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdENvdmVyYWdlQmFycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0Q292ZXJhZ2VCYXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFcEQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDcEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNqRyxPQUFPLEVBQWdCLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMvRixPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFNUUsT0FBTyxLQUFLLFVBQVUsTUFBTSwrQkFBK0IsQ0FBQztBQUM1RCxPQUFPLEVBQW9ELHVCQUF1QixFQUFFLDJCQUEyQixFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFFcEosT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlDQUFp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