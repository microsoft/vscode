/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { HighlightedLabel } from '../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js';
import { ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { ActionRunner, IAction, Separator, toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { createMatches, FuzzyScore } from '../../../../../base/common/filters.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { WorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { UNKNOWN_SESSION_APPLICATION_ID } from '../../../../services/sessions/common/sessionApplication.js';
import { SessionsListFilters } from './sessionsListFilters.js';
import type { SessionListItem } from './sessionsList.js';

/** Unsent work owned by the caller, never a provider-created session. */
export interface IPendingSessionItem {
	readonly pendingSession: true;
	readonly id: string;
	readonly kind: 'draft' | 'scheduled';
	readonly title: string;
	readonly description: string;
	readonly folderUri?: URI;
	readonly providerId?: string;
	readonly sessionType?: string;
	readonly harness?: string;
	readonly environmentId?: string;
	readonly applicationId?: string;
	/** Explicitly identifies No Workspace, rather than unavailable workspace metadata. */
	readonly isQuickChat?: boolean;
	readonly actions: readonly IAction[];
	open(): Promise<void>;
}

export interface IPendingSessionSection {
	readonly id: 'drafts' | 'scheduled';
	readonly label: string;
	readonly items: readonly IPendingSessionItem[];
}

export function isPendingSessionItem(item: SessionListItem): item is IPendingSessionItem {
	return 'pendingSession' in item && item.pendingSession === true;
}

export function matchesPendingSession(item: IPendingSessionItem, filters: SessionsListFilters, inbox: boolean, providerIds?: readonly string[]): boolean {
	if (providerIds && (!item.providerId || !providerIds.includes(item.providerId))) {
		return false;
	}
	if (item.harness && filters.isExcluded({ kind: 'harness', id: item.harness })
		|| !inbox && item.environmentId && filters.isExcluded({ kind: 'environment', id: item.environmentId })
		|| item.applicationId && item.applicationId !== UNKNOWN_SESSION_APPLICATION_ID && item.environmentId && filters.isExcluded({ kind: 'application', environment: item.environmentId, id: item.applicationId })) {
		return false;
	}
	if (inbox) {
		const { environment, workspace } = filters.inboxScope;
		if (environment && item.environmentId !== environment.id) {
			return false;
		}
		if (workspace === 'none') {
			return item.isQuickChat === true;
		}
		if (workspace) {
			return item.isQuickChat !== true && item.environmentId === workspace.environment
				&& !!item.folderUri && getComparisonKey(item.folderUri) === workspace.resource;
		}
	}
	return true;
}

export function getPendingSessionActions(item: IPendingSessionItem, multiple: boolean): IAction[] {
	const actions = item.actions.length > 0 ? item.actions : [toAction({
		id: 'sessions.pending.open',
		label: localize('openPendingSession', "Open"),
		run: () => item.open(),
	})];
	return actions.map(action => action instanceof Separator ? action : toAction({
		id: action.id,
		label: action.label,
		tooltip: action.tooltip,
		class: action.class,
		checked: action.checked,
		enabled: !multiple && action.enabled,
		run: () => !multiple && action.enabled ? action.run() : undefined,
	}));
}

export function getPendingSessionAriaLabel(item: IPendingSessionItem): string {
	const description = getPendingSessionDescription(item);
	return item.kind === 'draft'
		? description
			? localize('pendingDraftAria', "{0}, draft, {1}", item.title, description)
			: localize('pendingDraftWithoutDescriptionAria', "{0}, draft", item.title)
		: localize('pendingScheduledAria', "{0}, scheduled, {1}", item.title, description);
}

function getPendingSessionDescription(item: IPendingSessionItem): string {
	return item.kind === 'scheduled' && item.folderUri
		? localize('pendingScheduledWorkspace', "{0} - {1}", basename(item.folderUri), item.description)
		: item.description;
}

interface IPendingSessionTemplate {
	readonly icon: HTMLElement;
	readonly scheduledIndicator: HTMLElement;
	readonly title: HighlightedLabel;
	readonly description: HTMLElement;
	readonly compactDescription: HTMLElement;
	readonly toolbar: WorkbenchToolBar;
	readonly toolbarContainer: HTMLElement;
	readonly disposables: DisposableStore;
}

export class PendingSessionRenderer implements ITreeRenderer<SessionListItem, FuzzyScore, IPendingSessionTemplate> {
	static readonly TEMPLATE_ID = 'pending-session';
	readonly templateId = PendingSessionRenderer.TEMPLATE_ID;

	constructor(
		private readonly instantiationService: IInstantiationService,
		private readonly showActions: (item: IPendingSessionItem, anchor: HTMLElement) => void,
		private readonly onActionError: (error: Error) => void,
	) { }

	renderTemplate(container: HTMLElement): IPendingSessionTemplate {
		const disposables = new DisposableStore();
		container.classList.add('session-item');
		const icon = DOM.append(container, DOM.$('.session-icon', { 'aria-hidden': 'true' }));
		const main = DOM.append(container, DOM.$('.session-main'));
		const titleRow = DOM.append(main, DOM.$('.session-title-row'));
		const title = disposables.add(new HighlightedLabel(DOM.append(titleRow, DOM.$('.session-title'))));
		const compactDescription = DOM.append(titleRow, DOM.$('.session-compact-hover-description'));
		const scheduledIndicator = DOM.append(titleRow, DOM.$(`span.session-scheduled-indicator${ThemeIcon.asCSSSelector(Codicon.clock)}`, { 'aria-hidden': 'true' }));
		const toolbarContainer = DOM.append(titleRow, DOM.$('.session-title-toolbar'));
		const actionRunner = disposables.add(new ActionRunner());
		disposables.add(actionRunner.onDidRun(event => {
			if (event.error) {
				this.onActionError(event.error);
			}
		}));
		const toolbar = disposables.add(this.instantiationService.createInstance(WorkbenchToolBar, toolbarContainer, { actionRunner }));
		for (const type of ['pointerdown', 'pointerup', 'click', 'dblclick'] as const) {
			disposables.add(DOM.addDisposableListener(toolbarContainer, type, e => e.stopPropagation()));
		}
		disposables.add(Gesture.ignoreTarget(toolbarContainer));
		const description = DOM.append(main, DOM.$('.session-details-row'));
		return { icon, scheduledIndicator, title, description, compactDescription, toolbar, toolbarContainer, disposables };
	}

	renderElement(node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: IPendingSessionTemplate): void {
		const item = node.element;
		if (!isPendingSessionItem(item)) {
			return;
		}
		const icon = DOM.$(`span${ThemeIcon.asCSSSelector(Codicon.circleSmallFilled)}`);
		icon.style.color = asCssVariable('agentSessionReadIndicator.foreground');
		DOM.reset(template.icon, icon);
		template.scheduledIndicator.classList.toggle('visible', item.kind === 'scheduled');
		template.title.set(item.title, createMatches(node.filterData));
		const description = getPendingSessionDescription(item);
		template.description.textContent = description;
		template.compactDescription.textContent = description;
		template.toolbar.setActions(item.kind === 'draft' ? getPendingSessionActions(item, false).filter(action => action.id !== 'sessions.drafts.resume') : [toAction({
			id: 'sessions.pending.actions',
			label: localize('pendingSessionActions', "More Actions..."),
			class: ThemeIcon.asClassName(Codicon.ellipsis),
			run: () => this.showActions(item, template.toolbarContainer),
		})]);
	}

	disposeElement(_node: ITreeNode<SessionListItem, FuzzyScore>, _index: number, template: IPendingSessionTemplate): void {
		template.toolbar.setActions([]);
	}

	disposeTemplate(template: IPendingSessionTemplate): void {
		template.disposables.dispose();
	}
}
