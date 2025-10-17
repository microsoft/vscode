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
	readonly timestamp: HTMLElement;

	readonly description: HTMLElement;

	readonly elementDisposables: DisposableStore;
	readonly disposables: IDisposable;
}

export class AgentSessionRenderer implements ICompressibleTreeRenderer<IAgentSessionViewModel, void, IAgentSessionItemTemplate> {

	static readonly TEMPLATE_ID = 'agent-session';
	get templateId(): string { return AgentSessionRenderer.TEMPLATE_ID; }

	renderTemplate(container: HTMLElement): IAgentSessionItemTemplate {
		(container.parentElement!.parentElement!.querySelector('.monaco-tl-twistie')! as HTMLElement).classList.add('force-no-twistie'); // hack, but no API for hiding twistie on tree

		const disposables = new DisposableStore();
		const elementDisposables = disposables.add(new DisposableStore());

		const element = append(container, $('.agent-session-item'));

		// Title
		const titleRow = append(element, $('.agent-session-title-row'));
		const icon = append(titleRow, $('.agent-session-icon'));

		const title = disposables.add(new IconLabel(titleRow, { supportHighlights: true, supportIcons: true }));

		const timestampContainer = append(titleRow, $('.agent-session-timestamp-container'));
		const timestamp = append(timestampContainer, $('.agent-session-timestamp'));

		// Details
		const detailsRow = append(element, $('.agent-session-details-row'));
		const description = append(detailsRow, $('.agent-session-description'));

		return { element, title, icon, timestamp, description, elementDisposables, disposables };
	}

	renderElement(session: ITreeNode<IAgentSessionViewModel, void>, index: number, template: IAgentSessionItemTemplate, details?: ITreeElementRenderDetails): void {
		template.elementDisposables.clear();

		template.title.setLabel(session.element.title);

		template.icon.className = `agent-session-icon ${ThemeIcon.asClassName(Codicon.circle)}`;

		template.timestamp.textContent = new Date(session.element.timestamp).toLocaleString();
		template.description.textContent = session.element.description;
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
