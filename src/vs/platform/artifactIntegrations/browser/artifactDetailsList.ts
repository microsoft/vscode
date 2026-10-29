/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, reset } from '../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../base/browser/markdownRenderer.js';
import { ActionBar } from '../../../base/browser/ui/actionbar/actionbar.js';
import { IHoverDelegate } from '../../../base/browser/ui/hover/hoverDelegate.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListRenderer } from '../../../base/browser/ui/list/list.js';
import { IAction } from '../../../base/common/actions.js';
import { Codicon } from '../../../base/common/codicons.js';
import { Event } from '../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IHoverService } from '../../hover/browser/hover.js';
import { asCssVariable, getColorRegistry } from '../../theme/common/colorUtils.js';
import { getIconRegistry } from '../../theme/common/iconRegistry.js';
import { ArtifactDetails, ArtifactDetailsItem, ArtifactIcon } from '../common/artifactIntegration.js';
import './media/artifactDetailsList.css';

export function getArtifactThemeIcon(value: ArtifactIcon): ThemeIcon {
	const id = getIconRegistry().getIcon(value.id) ? value.id : Codicon.link.id;
	const color = value.colorId && Object.hasOwn(getColorRegistry().getColorSchema().properties ?? {}, value.colorId) ? { id: value.colorId } : undefined;
	return { id, color };
}

export function renderArtifactIcon(value: ThemeIcon, iconClass?: string): HTMLElement {
	const container = $('span.artifact-icon', { 'aria-hidden': 'true' });
	if (value.color) {
		container.style.color = asCssVariable(value.color.id);
	}
	const glyph = append(container, renderIcon(value));
	if (value.color) {
		glyph.style.color = 'inherit';
	}
	if (iconClass) {
		glyph.classList.add(iconClass);
	}
	return container;
}

export type { ArtifactDetailsItem };

export function getArtifactDetailsDescription(details: ArtifactDetails): string {
	return details.descriptionFormat === 'markdown'
		? renderAsPlaintext(new MarkdownString(details.description ?? ''), { omitMarkdownSyntax: true }).trim()
		: details.description?.trim() ?? '';
}

/** Supplies the actions shown at the end of a details item row while the row is hovered, focused, or selected. */
export interface IArtifactDetailsItemActionProvider {
	/** Shared by every row, so moving between rows' actions shows their hovers without another delay. */
	readonly hoverDelegate: IHoverDelegate;
	/** Fires when the actions of rendered items changed, so rows update in place and keep keyboard focus. */
	readonly onDidChange: Event<void>;
	/** Fires when the owning list's focused item changed. */
	readonly onDidChangeFocus: Event<void>;
	getActions(item: ArtifactDetailsItem): readonly IAction[];
	/** Whether the item is the owning list's focused item, whose actions alone are in the tab order. */
	isFocused(item: ArtifactDetailsItem): boolean;
}

/** An item action that has keyboard focus, identified independently of the row that renders it. */
export interface IArtifactDetailsItemActionFocus {
	readonly itemId: string;
	readonly actionId: string;
}

interface IArtifactDetailsItemTemplate {
	readonly row: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly description?: HTMLElement;
	readonly actionBar?: ActionBar;
	readonly store: DisposableStore;
	item?: ArtifactDetailsItem;
}

export class ArtifactDetailsItemRenderer implements IListRenderer<ArtifactDetailsItem, IArtifactDetailsItemTemplate> {
	static readonly rowHeight = 28;
	readonly templateId = 'artifactDetailsItem';
	readonly rowHeight: number;
	private readonly templates = new Set<IArtifactDetailsItemTemplate>();

	constructor(private readonly hoverService: IHoverService, private readonly showDescription = false, private readonly actionProvider?: IArtifactDetailsItemActionProvider) {
		this.rowHeight = showDescription ? 40 : ArtifactDetailsItemRenderer.rowHeight;
	}

	renderTemplate(container: HTMLElement): IArtifactDetailsItemTemplate {
		const store = new DisposableStore();
		const row = append(container, $('.artifact-details-item'));
		const icon = append(row, $('span.artifact-details-item-icon'));
		const labels = append(row, $('.artifact-details-item-labels'));
		const template: IArtifactDetailsItemTemplate = {
			row, icon, label: append(labels, $('span.artifact-details-item-label')), store,
			description: this.showDescription ? append(labels, $('span.artifact-details-item-description')) : undefined,
			actionBar: this.actionProvider ? store.add(new ActionBar(append(row, $('.artifact-details-item-actions')), { hoverDelegate: this.actionProvider.hoverDelegate })) : undefined,
		};
		const { actionBar } = template;
		const actionProvider = this.actionProvider;
		if (actionBar && actionProvider) {
			this.templates.add(template);
			store.add(toDisposable(() => this.templates.delete(template)));
			store.add(actionProvider.onDidChange(() => {
				if (template.item) {
					this.renderActions(template, template.item, true);
				}
			}));
			store.add(actionProvider.onDidChangeFocus(() => {
				if (template.item) {
					actionBar.setFocusable(actionProvider.isFocused(template.item));
				}
			}));
		}
		// Anchored to the labels so the item hover does not compete with the row actions' hovers.
		store.add(this.hoverService.setupDelayedHover(labels, () => ({
			content: template.item ? getArtifactDetailsItemLabel(template.item) : '',
		})));
		return template;
	}

	renderElement(item: ArtifactDetailsItem, _index: number, template: IArtifactDetailsItemTemplate): void {
		// Lists reuse rows by position, so focus inside a row only belongs to the same item.
		const sameItem = template.item?.id === item.id;
		template.item = item;
		reset(template.icon, renderArtifactIcon(getArtifactThemeIcon(item.icon)));
		template.label.textContent = item.label;
		if (template.description) {
			template.description.textContent = item.description ?? '';
			template.description.hidden = !item.description;
		}
		this.renderActions(template, item, sameItem);
	}

	private renderActions(template: IArtifactDetailsItemTemplate, item: ArtifactDetailsItem, restoreFocus: boolean): void {
		const { actionBar } = template;
		if (!actionBar || !this.actionProvider) {
			return;
		}
		const actions = this.actionProvider.getActions(item);
		const focused = restoreFocus ? this.focusedAction(actionBar) : undefined;
		actionBar.clear();
		actionBar.push(actions, { icon: true, label: false });
		actionBar.setFocusable(this.actionProvider.isFocused(item));
		actionBar.setAriaLabel(localize('artifactItemActions', "Actions for {0}", item.label));
		template.row.classList.toggle('has-actions', actions.length > 0);
		if (focused) {
			// Keep focus on the same action, or on the action now at its position, or return it to the list.
			const index = actions.findIndex(action => action.id === focused.id);
			if (actions.length) {
				actionBar.focus(index >= 0 ? index : Math.min(focused.index, actions.length - 1));
			} else {
				template.row.closest<HTMLElement>('.monaco-list')?.focus();
			}
		}
	}

	private focusedAction(actionBar: ActionBar): { readonly id: string; readonly index: number } | undefined {
		const index = actionBar.isFocused() ? actionBar.viewItems.findIndex((_item, index) => actionBar.isFocused(index)) : -1;
		return index >= 0 ? { id: actionBar.viewItems[index].action.id, index } : undefined;
	}

	/** The item action that has keyboard focus, so a list update can restore it to the same item wherever it moves. */
	getFocusedAction(): IArtifactDetailsItemActionFocus | undefined {
		for (const template of this.templates) {
			const focused = template.item && template.actionBar && this.focusedAction(template.actionBar);
			if (template.item && focused) {
				return { itemId: template.item.id, actionId: focused.id };
			}
		}
		return undefined;
	}

	/** Focuses an item's action if its row is rendered. */
	focusAction(target: IArtifactDetailsItemActionFocus): boolean {
		for (const template of this.templates) {
			const index = template.item?.id === target.itemId ? template.actionBar?.viewItems.findIndex(item => item.action.id === target.actionId) ?? -1 : -1;
			if (index >= 0) {
				template.actionBar!.focus(index);
				return true;
			}
		}
		return false;
	}

	disposeTemplate(template: IArtifactDetailsItemTemplate): void {
		template.store.dispose();
	}
}

export function getArtifactDetailsItemLabel(item: ArtifactDetailsItem): string {
	return item.description ? localize('artifactItemDescription', "{0}: {1}", item.label, item.description) : item.label;
}
