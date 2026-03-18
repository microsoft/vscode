/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/ciStatusWidget.css';
import * as dom from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ChatViewPaneTarget, IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { DEFAULT_LABELS_CONTAINER, IResourceLabel, ResourceLabels } from '../../../../workbench/browser/labels.js';
import { ActionBar } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, IGitHubCICheck } from '../../github/common/types.js';
import { GitHubPullRequestCIModel } from '../../github/browser/models/githubPullRequestCIModel.js';

const $ = dom.$;

const enum CICheckGroup {
	Running,
	Pending,
	Failed,
	Successful,
}

interface ICICheckListItem {
	readonly check: IGitHubCICheck;
	readonly group: CICheckGroup;
}

interface ICICheckCounts {
	readonly running: number;
	readonly pending: number;
	readonly failed: number;
	readonly successful: number;
}

class CICheckListDelegate implements IListVirtualDelegate<ICICheckListItem> {
	static readonly ITEM_HEIGHT = 24;

	getHeight(_element: ICICheckListItem): number {
		return CICheckListDelegate.ITEM_HEIGHT;
	}

	getTemplateId(_element: ICICheckListItem): string {
		return CICheckListRenderer.TEMPLATE_ID;
	}
}

interface ICICheckTemplateData {
	readonly row: HTMLElement;
	readonly label: IResourceLabel;
	readonly actionBar: ActionBar;
	readonly templateDisposables: DisposableStore;
	readonly elementDisposables: DisposableStore;
}

class CICheckListRenderer implements IListRenderer<ICICheckListItem, ICICheckTemplateData> {
	static readonly TEMPLATE_ID = 'ciCheck';
	readonly templateId = CICheckListRenderer.TEMPLATE_ID;

	constructor(
		private readonly _labels: ResourceLabels,
		private readonly _openerService: IOpenerService,
	) { }

	renderTemplate(container: HTMLElement): ICICheckTemplateData {
		const templateDisposables = new DisposableStore();
		const row = dom.append(container, $('.ci-status-widget-check'));

		const labelContainer = dom.append(row, $('.ci-status-widget-check-label'));
		const label = templateDisposables.add(this._labels.create(labelContainer, { supportIcons: true }));

		const actionBarContainer = dom.append(row, $('.ci-status-widget-check-actions'));
		const actionBar = templateDisposables.add(new ActionBar(actionBarContainer));

		return {
			row,
			label,
			actionBar,
			templateDisposables,
			elementDisposables: templateDisposables.add(new DisposableStore()),
		};
	}

	renderElement(element: ICICheckListItem, _index: number, templateData: ICICheckTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.actionBar.clear();

		templateData.row.className = `ci-status-widget-check ${getCheckStatusClass(element.check)}`;

		const title = localize('ci.checkTitle', "{0}: {1}", element.check.name, getCheckStateLabel(element.check));
		templateData.label.setResource({
			name: element.check.name,
			resource: URI.from({ scheme: 'github-check', path: `/${element.check.id}/${element.check.name}` }),
		}, {
			icon: getCheckIcon(element.check),
			title,
		});

		const actions: Action[] = [];

		if (element.check.detailsUrl) {
			actions.push(templateData.elementDisposables.add(new Action(
				'ci.openOnGitHub',
				localize('ci.openOnGitHub', "Open on GitHub"),
				ThemeIcon.asClassName(Codicon.linkExternal),
				true,
				async () => {
					await this._openerService.open(URI.parse(element.check.detailsUrl!));
				},
			)));
		}

		templateData.actionBar.push(actions, { icon: true, label: false });
	}

	disposeElement(_element: ICICheckListItem, _index: number, templateData: ICICheckTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.actionBar.clear();
	}

	disposeTemplate(templateData: ICICheckTemplateData): void {
		templateData.templateDisposables.dispose();
	}
}

/**
 * A collapsible widget that shows the CI status of a PR.
 * Rendered beneath the changes tree in the changes view.
 */
export class CIStatusWidget extends Disposable {

	static readonly HEADER_HEIGHT = 30;
	static readonly MIN_BODY_HEIGHT = 72; // at least 3 checks (3 * 24)
	static readonly MAX_BODY_HEIGHT = 240; // at most 10 checks (10 * 24)

	private readonly _domNode: HTMLElement;
	private readonly _headerNode: HTMLElement;
	private readonly _titleNode: HTMLElement;
	private readonly _titleLabel: IResourceLabel;
	private readonly _headerActionBarContainer: HTMLElement;
	private readonly _headerActionBar: ActionBar;
	private readonly _twistieNode: HTMLElement;
	private readonly _bodyNode: HTMLElement;
	private readonly _list: WorkbenchList<ICICheckListItem>;
	private readonly _labels: ResourceLabels;
	private readonly _headerActionDisposables = this._register(new DisposableStore());

	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	readonly onDidChangeHeight = this._onDidChangeHeight.event;

	private _collapsed = true;
	private _checkCount = 0;
	private _model: GitHubPullRequestCIModel | undefined;
	private _sessionResource: URI | undefined;

	get element(): HTMLElement {
		return this._domNode;
	}

	/** The full content height the widget would like (header + all checks). */
	get desiredHeight(): number {
		if (this._checkCount === 0) {
			return 0;
		}
		if (this._collapsed) {
			return CIStatusWidget.HEADER_HEIGHT;
		}
		return CIStatusWidget.HEADER_HEIGHT + this._checkCount * CICheckListDelegate.ITEM_HEIGHT;
	}

	/** Whether the widget is currently visible (has checks to show). */
	get visible(): boolean {
		return this._checkCount > 0;
	}

	constructor(
		container: HTMLElement,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._labels = this._register(this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));

		this._domNode = dom.append(container, $('.ci-status-widget'));
		this._domNode.style.display = 'none';

		// Header (always visible)
		this._headerNode = dom.append(this._domNode, $('.ci-status-widget-header'));
		this._titleNode = dom.append(this._headerNode, $('.ci-status-widget-title'));
		this._titleLabel = this._register(this._labels.create(this._titleNode, { supportIcons: true }));
		this._headerActionBarContainer = dom.append(this._headerNode, $('.ci-status-widget-header-actions'));
		this._headerActionBar = this._register(new ActionBar(this._headerActionBarContainer));
		this._headerActionBarContainer.style.display = 'none';
		this._register(dom.addDisposableListener(this._headerActionBarContainer, dom.EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
		}));
		this._twistieNode = dom.append(this._headerNode, $('.ci-status-widget-twistie'));
		this._updateTwistie();

		this._register(dom.addDisposableListener(this._headerNode, 'click', () => this._toggle()));

		// Body (collapsible list of checks)
		this._bodyNode = dom.append(this._domNode, $('.ci-status-widget-body'));
		this._bodyNode.style.display = 'none';

		const listContainer = $('.ci-status-widget-list');
		this._list = this._register(this._instantiationService.createInstance(
			WorkbenchList<ICICheckListItem>,
			'CIStatusWidget',
			listContainer,
			new CICheckListDelegate(),
			[new CICheckListRenderer(this._labels, this._openerService)],
			{
				multipleSelectionSupport: false,
				openOnSingleClick: false,
				accessibilityProvider: {
					getWidgetAriaLabel: () => localize('ci.checksListAriaLabel', "Checks"),
					getAriaLabel: item => localize('ci.checkAriaLabel', "{0}, {1}", item.check.name, getCheckStateLabel(item.check)),
				},
				keyboardNavigationLabelProvider: {
					getKeyboardNavigationLabel: item => item.check.name,
				},
			},
		));
		this._bodyNode.appendChild(this._list.getHTMLElement());
	}

	/**
	 * Bind to a CI model. When `ciModel` is undefined, the widget hides.
	 * Returns a disposable that stops observation.
	 */
	bind(ciModel: IObservable<GitHubPullRequestCIModel | undefined>, sessionResource: IObservable<URI | undefined>): IDisposable {
		return autorun(reader => {
			const model = ciModel.read(reader);
			this._sessionResource = sessionResource.read(reader);
			this._model = model;
			if (!model) {
				this._checkCount = 0;
				this._renderBody([]);
				this._renderHeaderActions([]);
				this._domNode.style.display = 'none';
				this._onDidChangeHeight.fire();
				return;
			}

			const checks = model.checks.read(reader);
			const overallStatus = model.overallStatus.read(reader);

			if (checks.length === 0) {
				this._checkCount = 0;
				this._renderBody([]);
				this._renderHeaderActions([]);
				this._domNode.style.display = 'none';
				this._onDidChangeHeight.fire();
				return;
			}

			const sorted = sortChecks(checks);
			const oldCount = this._checkCount;
			this._checkCount = sorted.length;

			this._domNode.style.display = '';
			this._renderHeader(checks, overallStatus);
			this._renderHeaderActions(getFailedChecks(checks));
			this._renderBody(sorted);

			if (this._checkCount !== oldCount) {
				this._onDidChangeHeight.fire();
			}
		});
	}

	private _toggle(): void {
		this._collapsed = !this._collapsed;
		this._bodyNode.style.display = this._collapsed ? 'none' : '';
		this._updateTwistie();
		this._onDidChangeHeight.fire();
	}

	private _updateTwistie(): void {
		dom.clearNode(this._twistieNode);
		this._twistieNode.appendChild(renderIcon(this._collapsed ? Codicon.chevronRight : Codicon.chevronDown));
	}

	private _renderHeader(checks: readonly IGitHubCICheck[], overallStatus: GitHubCIOverallStatus): void {
		const { icon, className } = getHeaderIconAndClass(checks, overallStatus);
		this._titleNode.className = `ci-status-widget-title ${className}`;

		const summary = getChecksSummary(checks);
		const title = localize('ci.headerTitle', "Checks: {0}", summary);
		this._titleLabel.setResource({
			name: title,
			resource: URI.from({ scheme: 'github-checks', path: '/summary' }),
		}, {
			icon: icon,
			title,
		});
	}

	private _renderHeaderActions(failedChecks: readonly IGitHubCICheck[]): void {
		this._headerActionDisposables.clear();
		this._headerActionBar.clear();

		if (failedChecks.length === 0) {
			this._headerActionBarContainer.style.display = 'none';
			return;
		}

		const fixChecksAction = this._headerActionDisposables.add(new Action(
			'ci.fixChecks',
			localize('ci.fixChecks', "Fix Checks"),
			ThemeIcon.asClassName(Codicon.lightbulbAutofix),
			true,
			async () => {
				await this._sendFixChecksPrompt(failedChecks);
			},
		));

		this._headerActionBar.push([fixChecksAction], { icon: true, label: false });
		this._headerActionBarContainer.style.display = 'flex';
	}

	/**
	 * Layout the widget body list to the given height.
	 * Called by the parent view after computing available space.
	 */
	layout(maxBodyHeight: number): void {
		if (this._collapsed || this._checkCount === 0) {
			return;
		}
		const contentHeight = this._checkCount * CICheckListDelegate.ITEM_HEIGHT;
		const bodyHeight = Math.min(contentHeight, maxBodyHeight);
		this._list.getHTMLElement().style.height = `${bodyHeight}px`;
		this._list.layout(bodyHeight);
	}

	private _renderBody(checks: readonly ICICheckListItem[]): void {
		const contentHeight = checks.length * CICheckListDelegate.ITEM_HEIGHT;
		const bodyHeight = Math.min(contentHeight, CIStatusWidget.MAX_BODY_HEIGHT);
		this._list.getHTMLElement().style.height = `${bodyHeight}px`;
		this._list.layout(bodyHeight);
		this._list.splice(0, this._list.length, checks);
	}

	private async _sendFixChecksPrompt(failedChecks: readonly IGitHubCICheck[]): Promise<void> {
		const model = this._model;
		const sessionResource = this._sessionResource;
		if (!model || !sessionResource || failedChecks.length === 0) {
			return;
		}

		const failedCheckDetails = await Promise.all(failedChecks.map(async check => {
			const annotations = await model.getCheckRunAnnotations(check.id);
			return {
				check,
				annotations,
			};
		}));

		const prompt = buildFixChecksPrompt(failedCheckDetails);
		const chatWidget = this._chatWidgetService.getWidgetBySessionResource(sessionResource)
			?? await this._chatWidgetService.openSession(sessionResource, ChatViewPaneTarget);
		if (!chatWidget) {
			return;
		}

		await chatWidget.acceptInput(prompt, { noCommandDetection: true });
	}
}

function sortChecks(checks: readonly IGitHubCICheck[]): ICICheckListItem[] {
	return [...checks]
		.sort(compareChecks)
		.map(check => ({ check, group: getCheckGroup(check) }));
}

function compareChecks(a: IGitHubCICheck, b: IGitHubCICheck): number {
	const groupDiff = getCheckGroup(a) - getCheckGroup(b);
	if (groupDiff !== 0) {
		return groupDiff;
	}

	return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function getCheckGroup(check: IGitHubCICheck): CICheckGroup {
	switch (check.status) {
		case GitHubCheckStatus.InProgress:
			return CICheckGroup.Running;
		case GitHubCheckStatus.Queued:
			return CICheckGroup.Pending;
		case GitHubCheckStatus.Completed:
			return isFailedConclusion(check.conclusion) ? CICheckGroup.Failed : CICheckGroup.Successful;
	}
}

function getCheckCounts(checks: readonly IGitHubCICheck[]): ICICheckCounts {
	let running = 0;
	let pending = 0;
	let failed = 0;
	let successful = 0;

	for (const check of checks) {
		switch (getCheckGroup(check)) {
			case CICheckGroup.Running:
				running++;
				break;
			case CICheckGroup.Pending:
				pending++;
				break;
			case CICheckGroup.Failed:
				failed++;
				break;
			case CICheckGroup.Successful:
				successful++;
				break;
		}
	}

	return { running, pending, failed, successful };
}

function getFailedChecks(checks: readonly IGitHubCICheck[]): readonly IGitHubCICheck[] {
	return checks.filter(check => getCheckGroup(check) === CICheckGroup.Failed);
}

function getChecksSummary(checks: readonly IGitHubCICheck[]): string {
	const counts = getCheckCounts(checks);
	const parts: string[] = [];

	if (counts.running > 0) {
		parts.push(counts.running === 1
			? localize('ci.oneRunning', "1 running")
			: localize('ci.manyRunning', "{0} running", counts.running));
	}

	if (counts.pending > 0) {
		parts.push(counts.pending === 1
			? localize('ci.onePending', "1 pending")
			: localize('ci.manyPending', "{0} pending", counts.pending));
	}

	if (counts.failed > 0) {
		parts.push(counts.failed === 1
			? localize('ci.oneFailed', "1 failed")
			: localize('ci.manyFailed', "{0} failed", counts.failed));
	}

	if (counts.successful > 0) {
		parts.push(counts.successful === 1
			? localize('ci.oneSuccessful', "1 successful")
			: localize('ci.manySuccessful', "{0} successful", counts.successful));
	}

	return parts.join(', ');
}

function buildFixChecksPrompt(failedChecks: ReadonlyArray<{ check: IGitHubCICheck; annotations: string }>): string {
	const sections = failedChecks.map(({ check, annotations }) => {
		const parts = [
			`Check: ${check.name}`,
			`Status: ${getCheckStateLabel(check)}`,
			`Conclusion: ${check.conclusion ?? 'unknown'}`,
		];

		if (check.detailsUrl) {
			parts.push(`Details: ${check.detailsUrl}`);
		}

		parts.push('', 'Annotations and output:', annotations || 'No output available for this check run.');
		return parts.join('\n');
	});

	return [
		'Please fix the failed CI checks for this session immediately.',
		'Use the failed check information below, including annotations and check output, to identify the root causes and make the necessary code changes.',
		'Focus on resolving these CI failures. Avoid unrelated changes unless they are required to fix the checks.',
		'',
		'Failed CI checks:',
		'',
		sections.join('\n\n---\n\n'),
	].join('\n');
}

function getHeaderIconAndClass(checks: readonly IGitHubCICheck[], overallStatus: GitHubCIOverallStatus): { icon: ThemeIcon; className: string } {
	const counts = getCheckCounts(checks);
	if (counts.running > 0) {
		return { icon: Codicon.loading, className: 'ci-status-running' };
	}

	switch (overallStatus) {
		case GitHubCIOverallStatus.Success:
			return { icon: Codicon.passFilled, className: 'ci-status-success' };
		case GitHubCIOverallStatus.Failure:
			return { icon: Codicon.error, className: 'ci-status-failure' };
		case GitHubCIOverallStatus.Pending:
			return { icon: Codicon.circleFilled, className: 'ci-status-pending' };
		default:
			return { icon: Codicon.circleFilled, className: 'ci-status-neutral' };
	}
}

function getCheckIcon(check: IGitHubCICheck): ThemeIcon {
	switch (check.status) {
		case GitHubCheckStatus.InProgress:
			return Codicon.loading;
		case GitHubCheckStatus.Queued:
			return Codicon.circleFilled;
		case GitHubCheckStatus.Completed:
			switch (check.conclusion) {
				case GitHubCheckConclusion.Success:
					return Codicon.passFilled;
				case GitHubCheckConclusion.Failure:
				case GitHubCheckConclusion.TimedOut:
				case GitHubCheckConclusion.ActionRequired:
					return Codicon.error;
				case GitHubCheckConclusion.Cancelled:
					return Codicon.circleSlash;
				case GitHubCheckConclusion.Skipped:
					return Codicon.debugStepOver;
				default:
					return Codicon.circleFilled;
			}
		default:
			return Codicon.circleFilled;
	}
}

function getCheckStatusClass(check: IGitHubCICheck): string {
	switch (getCheckGroup(check)) {
		case CICheckGroup.Running:
			return 'ci-status-running';
		case CICheckGroup.Pending:
			return 'ci-status-pending';
		case CICheckGroup.Failed:
			return 'ci-status-failure';
		case CICheckGroup.Successful:
			return 'ci-status-success';
	}
}

function getCheckStateLabel(check: IGitHubCICheck): string {
	switch (getCheckGroup(check)) {
		case CICheckGroup.Running:
			return localize('ci.runningState', "running");
		case CICheckGroup.Pending:
			return localize('ci.pendingState', "pending");
		case CICheckGroup.Failed:
			return localize('ci.failedState', "failed");
		case CICheckGroup.Successful:
			return localize('ci.successfulState', "successful");
	}
}

function isFailedConclusion(conclusion: GitHubCheckConclusion | undefined): boolean {
	return conclusion === GitHubCheckConclusion.Failure
		|| conclusion === GitHubCheckConclusion.TimedOut
		|| conclusion === GitHubCheckConclusion.ActionRequired;
}
