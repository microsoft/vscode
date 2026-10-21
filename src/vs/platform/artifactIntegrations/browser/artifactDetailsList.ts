/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, reset } from '../../../base/browser/dom.js';
import { renderAsPlaintext } from '../../../base/browser/markdownRenderer.js';
import { renderIcon } from '../../../base/browser/ui/iconLabel/iconLabels.js';
import { IListRenderer } from '../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../base/common/codicons.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { localize } from '../../../nls.js';
import { IHoverService } from '../../hover/browser/hover.js';
import { asCssVariable, getColorRegistry } from '../../theme/common/colorUtils.js';
import { getIconRegistry } from '../../theme/common/iconRegistry.js';
import { ArtifactDetails, ArtifactIcon } from '../common/artifactIntegration.js';
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

export type ArtifactDetailsItem = ArtifactDetails['items'][number];

export function getArtifactDetailsDescription(details: ArtifactDetails): string {
	return details.descriptionFormat === 'markdown'
		? renderAsPlaintext(new MarkdownString(details.description ?? ''), { omitMarkdownSyntax: true }).trim()
		: details.description?.trim() ?? '';
}

interface IArtifactDetailsItemTemplate {
	readonly row: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly description?: HTMLElement;
	readonly store: DisposableStore;
	item?: ArtifactDetailsItem;
}

export class ArtifactDetailsItemRenderer implements IListRenderer<ArtifactDetailsItem, IArtifactDetailsItemTemplate> {
	static readonly rowHeight = 28;
	readonly templateId = 'artifactDetailsItem';
	readonly rowHeight: number;

	constructor(private readonly hoverService: IHoverService, private readonly showDescription = false) {
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
		};
		store.add(this.hoverService.setupDelayedHover(row, () => ({
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
	}

	disposeTemplate(template: IArtifactDetailsItemTemplate): void {
		template.store.dispose();
	}
}

export function getArtifactDetailsItemLabel(item: ArtifactDetailsItem): string {
	return item.description ? localize('artifactItemDescription', "{0}: {1}", item.label, item.description) : item.label;
}
