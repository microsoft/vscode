/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { extensionIcon, pluginIcon } from './aiCustomizationIcons.js';

const $ = DOM.$;

export const CUSTOMIZATION_SOURCE_NODE_HEIGHT = 32;

/** What supplied the customizations nested under a source node. */
export type CustomizationSourceKind = 'plugin' | 'extension' | 'organization';

/**
 * A collapsible row that groups the customizations one plugin, extension, or
 * organization supplies within a scope.
 */
export interface ICustomizationSourceNodeEntry {
	readonly type: 'source-node';
	readonly id: string;
	readonly kind: CustomizationSourceKind;
	readonly label: string;
	readonly count: number;
	/** Opens the source's details; `undefined` when there is nothing to open. */
	readonly open?: () => void;
	/** Accessible name and hover of the open action. */
	readonly openLabel?: string;
}

export function getCustomizationSourceKindLabel(kind: CustomizationSourceKind): string {
	switch (kind) {
		case 'plugin': return localize('customizationSourcePlugin', "Plugin");
		case 'extension': return localize('customizationSourceExtension', "Extension");
		case 'organization': return localize('customizationSourceOrganization', "Organization");
	}
}

export function getCustomizationSourceNodeAriaLabel(entry: ICustomizationSourceNodeEntry): string {
	return localize('customizationSourceNodeAriaLabel', "{0}, {1}, {2} items", entry.label, getCustomizationSourceKindLabel(entry.kind), entry.count);
}

function getCustomizationSourceKindIcon(kind: CustomizationSourceKind): ThemeIcon {
	switch (kind) {
		case 'plugin': return pluginIcon;
		case 'extension': return extensionIcon;
		case 'organization': return Codicon.organization;
	}
}

interface ICustomizationSourceNodeTemplateData {
	readonly container: HTMLElement;
	readonly icon: HTMLElement;
	readonly label: HTMLElement;
	readonly kind: HTMLElement;
	readonly open: HTMLAnchorElement;
	readonly elementDisposables: DisposableStore;
	currentId: string | undefined;
}

/**
 * Renders a plugin, extension, or organization row whose children are the
 * customizations it supplies.
 */
export class CustomizationSourceNodeRenderer<T extends ICustomizationSourceNodeEntry> implements IListRenderer<T, ICustomizationSourceNodeTemplateData> {

	private readonly templates = new Set<ICustomizationSourceNodeTemplateData>();
	private focusedId: string | undefined;

	constructor(
		readonly templateId: string,
		private readonly hoverService: IHoverService,
	) { }

	/** Makes only the focused row's open action tab-focusable. */
	setFocusedId(id: string | undefined): void {
		this.focusedId = id;
		for (const template of this.templates) {
			this.updateTabbability(template);
		}
	}

	renderTemplate(container: HTMLElement): ICustomizationSourceNodeTemplateData {
		container.classList.add('customization-source-node');
		const icon = DOM.append(container, $('.customization-source-node-icon'));
		const label = DOM.append(container, $('.customization-source-node-label'));
		const kind = DOM.append(container, $('.customization-source-node-kind'));
		const open = DOM.append(container, $<HTMLAnchorElement>('a.customization-source-node-open'));
		open.classList.add(...ThemeIcon.asClassNameArray(Codicon.linkExternal));
		open.setAttribute('role', 'button');
		const template: ICustomizationSourceNodeTemplateData = { container, icon, label, kind, open, elementDisposables: new DisposableStore(), currentId: undefined };
		this.templates.add(template);
		return template;
	}

	renderElement(element: T, _index: number, templateData: ICustomizationSourceNodeTemplateData): void {
		templateData.elementDisposables.clear();
		templateData.currentId = element.id;
		templateData.icon.className = 'customization-source-node-icon';
		templateData.icon.classList.add(...ThemeIcon.asClassNameArray(getCustomizationSourceKindIcon(element.kind)));
		templateData.label.textContent = element.label;
		templateData.kind.textContent = getCustomizationSourceKindLabel(element.kind);

		const open = element.open;
		templateData.open.style.display = open ? '' : 'none';
		if (open) {
			const openLabel = element.openLabel ?? element.label;
			templateData.open.setAttribute('aria-label', openLabel);
			templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate('mouse'), templateData.open, openLabel));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.open, DOM.EventType.MOUSE_DOWN, e => e.stopPropagation()));
			templateData.elementDisposables.add(DOM.addDisposableListener(templateData.open, DOM.EventType.CLICK, e => {
				DOM.EventHelper.stop(e, true);
				open();
			}));
			templateData.elementDisposables.add(DOM.addStandardDisposableListener(templateData.open, DOM.EventType.KEY_DOWN, e => {
				if (e.keyCode === KeyCode.Enter || e.keyCode === KeyCode.Space) {
					DOM.EventHelper.stop(e, true);
					open();
				}
			}));
		}
		this.updateTabbability(templateData);
	}

	disposeElement(_element: T, _index: number, templateData: ICustomizationSourceNodeTemplateData): void {
		templateData.currentId = undefined;
		templateData.elementDisposables.clear();
	}

	disposeTemplate(templateData: ICustomizationSourceNodeTemplateData): void {
		this.templates.delete(templateData);
		templateData.elementDisposables.dispose();
	}

	private updateTabbability(templateData: ICustomizationSourceNodeTemplateData): void {
		templateData.open.tabIndex = templateData.currentId !== undefined && templateData.currentId === this.focusedId ? 0 : -1;
	}
}
