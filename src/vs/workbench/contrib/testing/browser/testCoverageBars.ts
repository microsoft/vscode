/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from '../../../../base/browser/dom.js';
import type { IManagedHover, IManagedHoverTooltipMarkdownString } from '../../../../base/browser/ui/hover/hover.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { ITransaction, autorun, observableValue } from '../../../../base/common/observable.js';
import { isDefined } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ExplorerExtensions, IExplorerFileContribution, IExplorerFileContributionRegistry } from '../../files/browser/explorerFileContrib.js';
import * as coverUtils from './codeCoverageDisplayUtils.js';
import { ITestingCoverageBarThresholds, TestingConfigKeys, getTestingConfiguration, observeTestingConfiguration } from '../common/configuration.js';
import { AbstractFileCoverage } from '../common/testCoverage.js';
import { ITestCoverageService } from '../common/testCoverageService.js';

export interface TestCoverageBarsOptions {
	/**
	 * Whether the bars should be shown in a more compact way, where only the
	 * overall bar is shown and more details are given in the hover.
	 */
	compact: boolean;
	/**
	 * Whether the overall stat is shown, defaults to true.
	 */
	overall?: boolean;
	/**
	 * Container in which is render the bars.
	 */
	container: HTMLElement;
}

/** Type that can be used to render coverage bars */
export type CoverageBarSource = Pick<AbstractFileCoverage, 'statement' | 'branch' | 'declaration'>;

export class ManagedTestCoverageBars extends Disposable {
	private _coverage?: CoverageBarSource;
	private readonly el = new Lazy(() => {
		if (this.options.compact) {
			const el = h('.test-coverage-bars.compact', [
				h('.tpc@overall'),
				h('.bar@tpcBar'),
			]);
			this.attachHover(el.tpcBar, getOverallHoverText);
			return el;
		} else {
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

	private readonly visibleStore = this._register(new DisposableStore());
	private readonly customHovers: IManagedHover[] = [];

	/** Gets whether coverage is currently visible for the resource. */
	public get visible() {
		return !!this._coverage;
	}

	constructor(
		protected readonly options: TestCoverageBarsOptions,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
	}

	private attachHover(target: HTMLElement, factory: (coverage: CoverageBarSource) => string | IManagedHoverTooltipMarkdownString | undefined) {
		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), target, () => this._coverage && factory(this._coverage)));
	}

	public setCoverageInfo(coverage: CoverageBarSource | undefined) {
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

				if (c.affectsConfiguration(TestingConfigKeys.CoveragePercent) || c.affectsConfiguration(TestingConfigKeys.CoverageBarThresholds)) {
					this.doRender(this._coverage);
				}
			}));
		}

		this._coverage = coverage;
		this.doRender(coverage);
	}

	private doRender(coverage: CoverageBarSource) {
		const el = this.el.value;

		const precision = this.options.compact ? 0 : 2;
		const thresholds = getTestingConfiguration(this.configurationService, TestingConfigKeys.CoverageBarThresholds);
		const overallStat = coverUtils.calculateDisplayedStat(coverage, getTestingConfiguration(this.configurationService, TestingConfigKeys.CoveragePercent));
		if (this.options.overall !== false) {
			el.overall.textContent = coverUtils.displayPercent(overallStat, precision);
		} else {
			el.overall.style.display = 'none';
		}
		if ('tpcBar' in el) { // compact mode
			renderBar(el.tpcBar, overallStat, false, thresholds);
		} else {
			renderBar(el.statement, coverUtils.percent(coverage.statement), coverage.statement.total === 0, thresholds);
			renderBar(el.function, coverage.declaration && coverUtils.percent(coverage.declaration), coverage.declaration?.total === 0, thresholds);
			renderBar(el.branch, coverage.branch && coverUtils.percent(coverage.branch), coverage.branch?.total === 0, thresholds);
		}
	}
}

const barWidth = 16;

const renderBar = (bar: HTMLElement, pct: number | undefined, isZero: boolean, thresholds: ITestingCoverageBarThresholds) => {
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

const nf = new Intl.NumberFormat();
const stmtCoverageText = (coverage: CoverageBarSource) => localize('statementCoverage', '{0}/{1} statements covered ({2})', nf.format(coverage.statement.covered), nf.format(coverage.statement.total), coverUtils.displayPercent(coverUtils.percent(coverage.statement)));
const fnCoverageText = (coverage: CoverageBarSource) => coverage.declaration && localize('functionCoverage', '{0}/{1} functions covered ({2})', nf.format(coverage.declaration.covered), nf.format(coverage.declaration.total), coverUtils.displayPercent(coverUtils.percent(coverage.declaration)));
const branchCoverageText = (coverage: CoverageBarSource) => coverage.branch && localize('branchCoverage', '{0}/{1} branches covered ({2})', nf.format(coverage.branch.covered), nf.format(coverage.branch.total), coverUtils.displayPercent(coverUtils.percent(coverage.branch)));

const getOverallHoverText = (coverage: CoverageBarSource): IManagedHoverTooltipMarkdownString => {
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
export class ExplorerTestCoverageBars extends ManagedTestCoverageBars implements IExplorerFileContribution {
	private readonly resource = observableValue<URI | undefined>(this, undefined);
	private static hasRegistered = false;
	public static register() {
		if (this.hasRegistered) {
			return;
		}

		this.hasRegistered = true;
		Registry.as<IExplorerFileContributionRegistry>(ExplorerExtensions.FileContributionRegistry).register({
			create(insta, container) {
				return insta.createInstance(
					ExplorerTestCoverageBars,
					{ compact: true, container }
				);
			},
		});
	}

	constructor(
		options: TestCoverageBarsOptions,
		@IConfigurationService configurationService: IConfigurationService,
		@IHoverService hoverService: IHoverService,
		@ITestCoverageService testCoverageService: ITestCoverageService,
	) {
		super(options, configurationService, hoverService);

		const isEnabled = observeTestingConfiguration(configurationService, TestingConfigKeys.ShowCoverageInExplorer);

		this._register(autorun(async reader => {
			let info: AbstractFileCoverage | undefined;
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
	public setResource(resource: URI | undefined, transaction?: ITransaction) {
		this.resource.set(resource, transaction);
	}

	public override setCoverageInfo(coverage: AbstractFileCoverage | undefined) {
		super.setCoverageInfo(coverage);
		this.options.container?.classList.toggle('explorer-item-with-test-coverage', this.visible);
	}
}
