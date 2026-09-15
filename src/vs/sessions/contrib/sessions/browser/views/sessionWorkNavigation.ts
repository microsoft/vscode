/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../media/sessionWorkNavigation.css';
import { $, reset } from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IconLabel } from '../../../../../base/browser/ui/iconLabel/iconLabel.js';
import { IObjectTreeElement, ITreeNode, ITreeRenderer } from '../../../../../base/browser/ui/tree/tree.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, observableSignalFromEvent } from '../../../../../base/common/observable.js';
import { equals } from '../../../../../base/common/objects.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { WorkbenchObjectTree } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { SessionsBoardFocusContext } from '../../../../common/contextkeys.js';
import { agentsBackground } from '../../../../common/theme.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsBoardService } from '../../../../services/sessions/browser/sessionsBoardService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { getSessionWorkViewLabel, isPromotableSessionWorkView, PromotableSessionWorkView, SessionWorkView } from '../../../../services/sessions/common/sessionWorkQuery.js';
import { SessionWorkDragAndDrop } from './sessionWorkDragAndDrop.js';

interface IWorkNavigationItem {
	readonly id: string;
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly view?: SessionWorkView;
	readonly collection?: string;
	readonly savedView?: string;
	readonly command?: string;
}

interface INavigationTemplate {
	readonly root: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: IconLabel;
}

class NavigationRenderer implements ITreeRenderer<IWorkNavigationItem, void, INavigationTemplate> {
	readonly templateId = 'workNavigation';

	renderTemplate(container: HTMLElement): INavigationTemplate {
		const root = $('.session-work-navigation-row');
		const icon = $('span');
		icon.setAttribute('aria-hidden', 'true');
		const labelContainer = $('span.session-work-navigation-label');
		const label = new IconLabel(labelContainer);
		root.append(icon, labelContainer);
		container.appendChild(root);
		return { root, icon, label };
	}

	renderElement(node: ITreeNode<IWorkNavigationItem, void>, _index: number, template: INavigationTemplate): void {
		reset(template.icon, renderIcon(node.element.icon));
		template.label.setLabel(node.element.label, undefined, { title: node.element.label });
	}

	disposeTemplate(template: INavigationTemplate): void { template.label.dispose(); }
}

/** Reuses the sidebar's content slot while the work overview is visible. */
export class SessionWorkNavigation extends Disposable {
	private readonly tree: WorkbenchObjectTree<IWorkNavigationItem, void>;

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISessionsBoardService private readonly board: ISessionsBoardService,
		@ISessionsService private readonly sessions: ISessionsService,
		@ISessionGroupsService groups: ISessionGroupsService,
		@ICommandService commandService: ICommandService,
		@INotificationService notificationService: INotificationService,
		@IContextMenuService contextMenuService: IContextMenuService,
	) {
		super();
		container.classList.add('session-work-navigation');
		const scopedContext = this._register(contextKeyService.createScoped(container));
		SessionsBoardFocusContext.bindTo(scopedContext).set(true);
		const scopedInstantiation = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContext])));
		const dnd = this._register(scopedInstantiation.createInstance(SessionWorkDragAndDrop<IWorkNavigationItem>, () => undefined, item => item.collection));
		this.tree = this._register(scopedInstantiation.createInstance(
			WorkbenchObjectTree<IWorkNavigationItem, void>, 'SessionWorkNavigation', container,
			{ getHeight: () => 32, getTemplateId: () => 'workNavigation' },
			[new NavigationRenderer()], {
			identityProvider: { getId: item => item.id },
			accessibilityProvider: {
				getWidgetAriaLabel: () => localize('sessionsWork.navigation', "Work views and collections"),
				getAriaLabel: item => item.label,
			},
			keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: item => item.label },
			multipleSelectionSupport: false,
			horizontalScrolling: false,
			overrideStyles: { listBackground: agentsBackground },
			dnd,
		},
		));
		this._register(this.tree.onDidOpen(async event => {
			const item = event.element;
			if (!item) { return; }
			try {
				if (item.command) {
					await commandService.executeCommand(item.command);
				} else if (item.savedView) {
					this.board.selectView(item.savedView);
				} else if (item.view) {
					this.board.updateOptions({ view: item.view, collection: item.collection, filter: '', status: undefined });
				}
			} catch (error) {
				notificationService.error(error);
			}
		}));
		this._register(this.tree.onContextMenu(event => {
			const item = event.element;
			if (item?.collection) {
				void commandService.executeCommand('sessions.work.manageCollection', item.collection).catch(error => notificationService.error(error));
			} else if (item?.savedView) {
				void commandService.executeCommand('sessions.work.removeSavedView', item.savedView).catch(error => notificationService.error(error));
			} else if (isPromotableSessionWorkView(item?.view)) {
				const view = item.view;
				contextMenuService.showContextMenu({
					getAnchor: () => event.anchor,
					getActions: () => [toAction({
						id: 'sessions.work.unpinView',
						label: localize('sessionsWork.unpinView', "Remove from Sidebar"),
						run: () => this.board.setViewPromoted(view, false),
					})],
				});
			}
		}));
		const groupsChanged = observableSignalFromEvent(this, groups.onDidChange);
		this._register(autorun(reader => {
			if (!this.sessions.isSessionBoardVisible.read(reader)) { return; }
			groupsChanged.read(reader);
			const options = this.board.options.read(reader);
			const savedViews = this.board.savedViews.read(reader);
			const promotedViews = this.board.promotedViews.read(reader);
			const viewIcons: Record<PromotableSessionWorkView, ThemeIcon> = {
				needsInput: Codicon.bell, review: Codicon.gitPullRequest, inProgress: Codicon.play, all: Codicon.commentDiscussion,
			};
			const items: IObjectTreeElement<IWorkNavigationItem>[] = [
				{ element: { id: 'overview', label: getSessionWorkViewLabel('overview'), icon: Codicon.layout, view: 'overview' } },
				...groups.getGroups().map(group => ({ element: { id: `collection:${group.id}`, label: group.name, icon: Codicon.folder, view: 'all' as const, collection: group.id } })),
				...promotedViews.map(view => ({ element: { id: view, label: getSessionWorkViewLabel(view), icon: viewIcons[view], view } })),
				...savedViews.map(view => ({ element: { id: `saved:${view.id}`, label: view.name, icon: Codicon.bookmark, savedView: view.id } })),
				{ element: { id: 'createCollection', label: localize('sessionsWork.newCollection', "Create Collection..."), icon: Codicon.add, command: 'sessions.work.createCollection' } },
			];
			this.tree.setChildren(null, items);
			const elements = items.map(item => item.element);
			const saved = savedViews.find(view => equals(view.options, options));
			const target = saved ? elements.find(item => item.savedView === saved.id) : options.collection
				? elements.find(item => item.collection === options.collection)
				: elements.find(item => !item.collection && item.view === options.view);
			this.tree.setSelection(target ? [target] : []);
		}));
	}

	layout(height: number, width: number): void { this.tree.layout(height, width); }
	focus(): void { this.tree.domFocus(); }
}
