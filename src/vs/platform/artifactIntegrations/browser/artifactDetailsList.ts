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
import { DisposableStore } from '../../../base/common/lifecycle.js';
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
	getActions(item: ArtifactDetailsItem): readonly IAction[];
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
			store.add(actionProvider.onDidChange(() => {
				if (template.item) {
					this.renderActions(actionBar, actionProvider.getActions(template.item), template.item, row);
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
		template.item = item;
		reset(template.icon, renderArtifactIcon(getArtifactThemeIcon(item.icon)));
		template.label.textContent = item.label;
		if (template.description) {
			template.description.textContent = item.description ?? '';
			template.description.hidden = !item.description;
		}
		if (template.actionBar && this.actionProvider) {
			this.renderActions(template.actionBar, this.actionProvider.getActions(item), item, template.row);
		}
	}

	private renderActions(actionBar: ActionBar, actions: readonly IAction[], item: ArtifactDetailsItem, row: HTMLElement): void {
		// Re-rendering replaces the action items; keep keyboard focus on the same position, or return it to the list.
		const focused = actionBar.isFocused() ? actionBar.viewItems.findIndex((_item, index) => actionBar.isFocused(index)) : -1;
		actionBar.clear();
		actionBar.push(actions, { icon: true, label: false });
		actionBar.setAriaLabel(localize('artifactItemActions', "Actions for {0}", item.label));
		row.classList.toggle('has-actions', actions.length > 0);
		if (focused >= 0) {
			if (actions.length) {
				actionBar.focus(Math.min(focused, actions.length - 1));
			} else {
				row.closest<HTMLElement>('.monaco-list')?.focus();
			}
		}
	}

	disposeTemplate(template: IArtifactDetailsItemTemplate): void {
		template.store.dispose();
	}
}

export function getArtifactDetailsItemLabel(item: ArtifactDetailsItem): string {
	return item.description ? localize('artifactItemDescription', "{0}: {1}", item.label, item.description) : item.label;
}
