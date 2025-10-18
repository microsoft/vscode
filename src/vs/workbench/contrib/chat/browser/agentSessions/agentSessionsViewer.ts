/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/agentsessionsviewer.css';
import { $, append } from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { IIdentityProvider, IListVirtualDelegate } from '../../../../../base/browser/ui/list/list.js';
import { IListAccessibilityProvider } from '../../../../../base/browser/ui/list/listWidget.js';
import { ITreeCompressionDelegate } from '../../../../../base/browser/ui/tree/asyncDataTree.js';
import { ICompressedTreeNode } from '../../../../../base/browser/ui/tree/compressedObjectTreeModel.js';
import { ICompressibleTreeRenderer } from '../../../../../base/browser/ui/tree/objectTree.js';
import { ITreeNode, ITreeElementRenderDetails, IAsyncDataSource } from '../../../../../base/browser/ui/tree/tree.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IAgentSessionViewModel, IAgentSessionsViewModel, isAgentSession, isAgentSessionsViewModel } from './agentSessionViewModel.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { fromNow } from '../../../../../base/common/date.js';

export class AgentSessionsListDelegate implements IListVirtualDelegate<IAgentSessionViewModel> {

	getHeight(element: IAgentSessionViewModel): number {
		return 44;
	}

	getTemplateId(element: IAgentSessionViewModel): string {
		return AgentSessionRenderer.TEMPLATE_ID;
	}
}

export class AgentSessionsCompressionDelegate implements ITreeCompressionDelegate<IAgentSessionViewModel> {

	isIncompressible(element: IAgentSessionViewModel): boolean {
		return true;
	}
}

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

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSessionViewModel, void, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';

	readonly templateId = AgentSessionRenderer.TEMPLATE_ID;

	renderTemplate(container: HTMLElement): IAgentSessionItemTemplate {
		container.parentElement?.parentElement?.querySelector('.monaco-tl-twistie')?.classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree

		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		const item = append(container, $('.agent-session-item'));

		// Icon Column
		const iconCol = append(item, $('.agent-session-icon-col'));
		const icon = append(iconCol, $('.agent-session-icon'));

		// Main Column
		const mainCol = append(item, $('.agent-session-main-col'));

		// Title
		const titleRow = append(mainCol, $('.agent-session-title-row'));
		const title = disposables.add(new IconLabel(titleRow, { supportHighlights: true, supportIcons: true }));

		const diff = append(titleRow, $('.agent-session-diff'));
		const diffAdded = append(diff, $('span.agent-session-diff-added'));
		const diffRemoved = append(diff, $('span.agent-session-diff-removed'));

		// Details
		const detailsRow = append(mainCol, $('.agent-session-details-row'));
		const description = append(detailsRow, $('.agent-session-description'));
		const timestamp = append(detailsRow, $('.agent-session-timestamp'));

		return { element: item, title, icon, description, timestamp, diffAdded, diffRemoved, elementDisposables, disposables };
	}

	renderElement(session: ITreeNode<IAgentSessionViewModel, void>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposables.clear();

		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(Codicon.circleFilled)}`;

		template.title.setLabel(session.element.title);

		if (session.element.diff) {
			template.diffAdded.textContent = `+${session.element.diff.added}`;
			template.diffRemoved.textContent = `-${session.element.diff.removed}`;
		} else {
			template.diffAdded.textContent = '';
			template.diffRemoved.textContent = '';
		}

		template.description.textContent = session.element.description;
		template.timestamp.textContent = fromNow(session.element.timing.start, true, false, true);
	}

	renderCompressedElements(node: ITreeNode<ICompressedTreeNode<IAgentSessionViewModel>, void>, index: number, templateData: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		throw new Error('Should never happen since session is incompressible');
	}

	disposeElement(element: ITreeNode<IAgentSessionViewModel, void>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposables.clear();
	}

	disposeTemplate(templateData: IAgentSessionItemTemplate): void {
		templateData.disposables.dispose();
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
