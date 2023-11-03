/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIdentityProvider, IKeyboardNavigationLabelProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { ITreeNode, ITreeRenderer } from 'vs/base/browser/ui/tree/tree';
import { FuzzyScore } from 'vs/base/common/filters';
import { IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import * as dom from 'vs/base/browser/dom';
import { AriaRole } from 'vs/base/browser/ui/aria/aria';

export function createOutlineTree(instantiationService: IInstantiationService, container: HTMLElement, listBackground: string) {

	const treeRenderer = instantiationService.createInstance(OutputOutlineTreeRenderer);

	const tree = <WorkbenchObjectTree<TreeElement, FuzzyScore>>instantiationService.createInstance(WorkbenchObjectTree, 'OutputOutline',
		container, new OutputOutlineVirtualDelegate(), [treeRenderer], {
		identityProvider: new OutputOutlineIdentityProvider(),
		accessibilityProvider: {
			getAriaLabel(element: TreeElement): string {
				return element.ariaLabel ?? element.label;
			},
			getRole(element: TreeElement): AriaRole {
				return 'treeitem';
			},
			getWidgetAriaLabel(): string {
				return localize('outputOutline', "Output Outline");
			}
		},
		keyboardNavigationLabelProvider: new OutputOutlineKeyboardNavigationLabelProvider(),
		multipleSelectionSupport: false,
		overrideStyles: {
			listBackground: listBackground
		}
	});
	return tree;
}

const ItemHeight = 22;

class OutputOutlineVirtualDelegate implements IListVirtualDelegate<TreeElement> {
	getHeight(_element: TreeElement): number {
		return ItemHeight;
	}

	getTemplateId(element: TreeElement): string {
		return OutputOutlineElementTemplate.id;
	}
}

export class OutputOutlineKeyboardNavigationLabelProvider implements IKeyboardNavigationLabelProvider<TreeElement> {
	getKeyboardNavigationLabel(element: TreeElement): { toString(): string } {
		return element.label;
	}
}

class TreeElement {
	constructor(public readonly id: string, public readonly line: number, public readonly label: string, public readonly ariaLabel: string | undefined) {

	}
}

export class OutputOutlineIdentityProvider implements IIdentityProvider<TreeElement> {
	getId(item: TreeElement): { toString(): string } {
		return item.id;
	}
}

class OutputOutlineElementTemplate implements IDisposable {
	static readonly id = 'OutputOutlineElementTemplate';

	readonly icon: HTMLElement;
	readonly label: HTMLSpanElement;

	constructor(
		container: HTMLElement,
	) {
		container.classList.add('output-outline-node-item');
		this.icon = dom.append(container, dom.$('.output-outline-node-item-icon'));
		const labelContainer = dom.append(container, dom.$('.output-outline-node-item-label-container'));
		this.label = dom.append(labelContainer, dom.$('span.output-outline-node-item-label'));
	}

	dispose() {
	}

	reset() {
		this.icon.className = '';
		this.icon.style.backgroundImage = '';
	}
}

class OutputOutlineTreeRenderer implements ITreeRenderer<TreeElement, FuzzyScore, OutputOutlineElementTemplate> {

	readonly templateId: string = OutputOutlineElementTemplate.id;


	constructor(
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
	}

	renderTemplate(container: HTMLElement): OutputOutlineElementTemplate {
		return new OutputOutlineElementTemplate(container);
	}

	renderElement(
		node: ITreeNode<TreeElement, FuzzyScore>,
		index: number,
		template: OutputOutlineElementTemplate,
		height: number | undefined
	): void {
		template.reset();

		const { element: item } = node;

		template.label.textContent = item.label;

	}

	disposeTemplate(template: OutputOutlineElementTemplate): void {
		template.dispose();
	}
}

