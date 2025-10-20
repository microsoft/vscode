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
import { ITreeNode, ITreeElementRenderDetails, IAsyncDataSource, ITreeFilter, TreeFilterResult, TreeVisibility } from '../../../../../base/browser/ui/tree/tree.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSessionViewModel, IAgentSessionsViewModel, isAgentSession, isAgentSessionsViewModel } from './agentSessionViewModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';
import { FuzzyScore, createMatches, matchesFuzzy } from '../../../../../base/common/filters.js';

interface IAgentSessionItemTemplate {
	readonly element: HTMLElement;

	readonly title: IconLabel;
	readonly icon: HTMLElement;

	readonly description: HTMLElement;
	readonly timestamp: HTMLElement;
	readonly diffAdded: HTMLElement;
	readonly diffRemoved: HTMLElement;

	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSessionViewModel, FuzzyScore, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IAgentSessionItemTemplate {
		container.parentElement?.parentElement?.querySelector('.monaco-tl-twistie')?.classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree

		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

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
			elementDisposables,
			disposables
		};
	}

	renderElement(session: ITreeNode<IAgentSessionViewModel, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposables.clear();

		template.icon.className = `agent-session-icon ${this.getIconClassName(session.element)}`;

		template.title.setLabel(session.element.title, undefined, { matches: createMatches(session.filterData) });

		const { diff } = session.element;
		template.diffAdded.textContent = diff ? `+${diff.added}` : '';
		template.diffRemoved.textContent = diff ? `-${diff.removed}` : '';

		template.description.textContent = session.element.description;
		template.timestamp.textContent = fromNow(session.element.timing.start, true, false, true);
	}

	private getIconClassName(session: IAgentSessionViewModel): string {
		if (session.timing.end === undefined) {
			return `${ThemeIcon.asClassName(Codicon.loading)} codicon-modifier-spin`;
		} else {
			return ThemeIcon.asClassName(Codicon.check);
		}
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAgentSessionViewModel>, FuzzyScore>, index: number, templateData: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since session is incompressible');
	}

	disposeElement(element: ITreeNode<IAgentSessionViewModel, FuzzyScore>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(templateData: IAgentSessionItemTemplate): void {
		templateData.disposables.dispose();
	}
}

export class AgentSessionsListDelegate implements IListVirtualDelegate<IAgentSessionViewModel> {

	getHeight(element: IAgentSessionViewModel): number {
		return 44;
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
		return element.title;
	}
}

export class AgentSessionsDataSource implements IAsyncDataSource<IAgentSessionsViewModel, IAgentSessionViewModel> {

	hasChildren(element: IAgentSessionsViewModel | IAgentSessionViewModel): boolean {
		return isAgentSessionsViewModel(element);
	}

	getChildren(element: IAgentSessionsViewModel | IAgentSessionViewModel): Iterable<IAgentSessionViewModel> | Promise<Iterable<IAgentSessionViewModel>> {
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

		const score = matchesFuzzy(this._pattern, element.title, true);
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
