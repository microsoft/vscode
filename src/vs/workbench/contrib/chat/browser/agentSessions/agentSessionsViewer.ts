/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsviewer.css';
import { h } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeElementRenderDetails, IAsyncDataSource, ITreeFilter, ITreeSorter, TreeFilterResult, TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { AgentSessionStatus, IAgentSessionViewModel, IAgentSessionsViewModel, isAgentSession, isAgentSessionsViewModel } from './agentSessionViewModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { FuzzyScore, createMatches, matchesFuzzy } from '../../../../../base/common/filters.js';
import { IMarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { allowedChatMarkdownHtmlTags } from '../chatContentMarkdownRenderer.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';

interface IAgentSessionItemTemplate {
	readonly element: HTMLElement;

	readonly title: IconLabel;
	readonly icon: HTMLElement;

	readonly description: HTMLElement;
	readonly timestamp: HTMLElement;
	readonly diffAdded: HTMLElement;
	readonly diffRemoved: HTMLElement;

	readonly elementDisposable: DisposableStore;
	readonly disposables: IDisposable;
}

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSessionViewModel, FuzzyScore, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	constructor(
		@IMarkdownRendererService private readonly markdownRendererService: IMarkdownRendererService,
		@IProductService private readonly productService: IProductService
	) { }

	renderTemplate(container: HTMLElement): IAgentSessionItemTemplate {
		container.parentElement?.parentElement?.querySelector('.monaco-tl-twistie')?.classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree

		const disposables = new DisposableStore();
		const elementDisposable = disposables.add(new DisposableStore());

		const elements = h(
			'div.agent-session-item@item',
			[
				h('div.agent-session-icon-col', [
					h('div.agent-session-icon@icon')
				]),
				h('div.agent-session-main-col', [
					h('div.agent-session-title-row', [
						h('div.agent-session-title@titleContainer'),
						h('div.agent-session-diff', [
							h('span.agent-session-diff-added@diffAdded'),
							h('span.agent-session-diff-removed@diffRemoved')
						])
					]),
					h('div.agent-session-details-row', [
						h('div.agent-session-description@description'),
						h('div.agent-session-timestamp@timestamp')
					])
				])
			]
		);

		container.appendChild(elements.item);

		return {
			element: elements.item,
			icon: elements.icon,
			title: disposables.add(new IconLabel(elements.titleContainer, { supportHighlights: true, supportIcons: true })),
			description: elements.description,
			timestamp: elements.timestamp,
			diffAdded: elements.diffAdded,
			diffRemoved: elements.diffRemoved,
			elementDisposable,
			disposables
		};
	}

	renderElement(session: ITreeNode<IAgentSessionViewModel, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposable.clear();

		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(this.statusToIcon(session.element.status))}`;

		template.title.setLabel(session.element.label, undefined, { matches: createMatches(session.filterData) });

		const { statistics: diff } = session.element;
		template.diffAdded.textContent = diff ? `+${diff.insertions}` : '';
		template.diffRemoved.textContent = diff ? `-${diff.deletions}` : '';

		if (typeof session.element.description === 'string') {
			template.description.textContent = session.element.description;
		} else {
			template.elementDisposable.add(this.markdownRendererService.render(session.element.description, {
				sanitizerConfig: {
					replaceWithPlaintext: true,
					allowedTags: {
						override: allowedChatMarkdownHtmlTags,
					},
					allowedLinkSchemes: { augment: [this.productService.urlProtocol] }
				},
			}, template.description));
		}

		template.timestamp.textContent = fromNow(session.element.timing.startTime);
	}

	private statusToIcon(status?: AgentSessionStatus): ThemeIcon {
		switch (status) {
			case AgentSessionStatus.InProgress:
				return ThemeIcon.modify(Codicon.loading, 'spin');
			case AgentSessionStatus.Completed:
				return Codicon.pass;
			case AgentSessionStatus.Failed:
				return Codicon.error;
		}

		return Codicon.circleOutline;
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAgentSessionViewModel>, FuzzyScore>, index: number, templateData: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since session is incompressible');
	}

	disposeElement(element: ITreeNode<IAgentSessionViewModel, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposable.clear();
	}

	disposeTemplate(templateData: IAgentSessionItemTemplate): void {
		templateData.disposables.dispose();
	}
}

export class AgentSessionsListDelegate implements IListVirtualDelegate<IAgentSessionViewModel> {

	static readonly ITEM_HEIGHT = 44;

	getHeight(element: IAgentSessionViewModel): number {
		return AgentSessionsListDelegate.ITEM_HEIGHT;
	}

	getTemplateId(element: IAgentSessionViewModel): string {
		return AgentSessionRenderer.TEMPLATE_ID;
	}
}

export class AgentSessionsAccessibilityProvider implements IListAccessibilityProvider<IAgentSessionViewModel> {

	getWidgetAriaLabel(): string {
		return localize('agentSessions', "Agent Sessions");
	}

	getAriaLabel(element: IAgentSessionViewModel): string | null {
		return element.label;
	}
}

export class AgentSessionsDataSource implements IAsyncDataSource<IAgentSessionsViewModel, IAgentSessionViewModel> {

	hasChildren(element: IAgentSessionsViewModel | IAgentSessionViewModel): boolean {
		return isAgentSessionsViewModel(element);
	}

	getChildren(element: IAgentSessionsViewModel | IAgentSessionViewModel): Iterable<IAgentSessionViewModel> {
		if (!isAgentSessionsViewModel(element)) {
			return [];
		}

		return element.sessions;
	}
}

export class AgentSessionsIdentityProvider implements IIdentityProvider<IAgentSessionsViewModel | IAgentSessionViewModel> {

	getId(element: IAgentSessionsViewModel | IAgentSessionViewModel): string {
		if (isAgentSession(element)) {
			return element.id;
		}

		return 'agent-sessions-id';
	}
}

export class AgentSessionsFilter extends Disposable implements ITreeFilter<IAgentSessionViewModel, FuzzyScore> {

	private _pattern: string = '';
	set pattern(pattern: string) { this._pattern = pattern; }

	filter(element: IAgentSessionViewModel, parentVisibility: TreeVisibility): TreeFilterResult<FuzzyScore> {
		if (!this._pattern) {
			return TreeVisibility.Visible;
		}

		const score = matchesFuzzy(this._pattern, element.label, true);
		if (score) {
			const fuzzyScore: FuzzyScore = [0, 0];
			for (let matchIndex = score.length - 1; matchIndex >= 0; matchIndex--) {
				const match = score[matchIndex];
				for (let i = match.end - 1; i >= match.start; i--) {
					fuzzyScore.push(i);
				}
			}

			return { data: fuzzyScore, visibility: TreeVisibility.Visible };
		}

		return TreeVisibility.Hidden;
	}
}

export class AgentSessionsCompressionDelegate implements ITreeCompressionDelegate<IAgentSessionViewModel> {

	isIncompressible(element: IAgentSessionViewModel): boolean {
		return true;
	}
}

export class AgentSessionsSorter implements ITreeSorter<IAgentSessionViewModel> {

	compare(sessionA: IAgentSessionViewModel, sessionB: IAgentSessionViewModel): number {
		const aHasEndTime = !!sessionA.timing.endTime;
		const bHasEndTime = !!sessionB.timing.endTime;

		if (!aHasEndTime && bHasEndTime) {
			return -1; // a (in-progress) comes before b (finished)
		}
		if (aHasEndTime && !bHasEndTime) {
			return 1; // a (finished) comes after b (in-progress)
		}

		// Both in-progress or finished: sort by start time (most recent first)
		return sessionB.timing.startTime - sessionA.timing.startTime;
	}
}
