/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAsyncDataSource, ITreeRenderer, ITreeNode } from 'vs/base/browser/ui/tree/tree';
import { CallHierarchyItem, CallHierarchyDirection, CallHierarchyProvider } from 'vs/workbench/contrib/callHierarchy/common/callHierarchy';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IIdentityProvider, IListVirtualDelegate } from 'vs/base/browser/ui/list/list';
import { FuzzyScore, createMatches } from 'vs/base/common/filters';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { symbolKindToCssClass, Location } from 'vs/editor/common/modes';
import { ILabelService } from 'vs/platform/label/common/label';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { $, append } from 'vs/base/browser/dom';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { localize } from 'vs/nls';

export class Call {
	constructor(
		readonly direction: CallHierarchyDirection,
		readonly item: CallHierarchyItem,
		readonly locations: Location[]
	) { }
}

export class SingleDirectionDataSource implements IAsyncDataSource<CallHierarchyItem, Call> {

	constructor(
		public provider: CallHierarchyProvider,
		public direction: () => CallHierarchyDirection
	) { }

	hasChildren(_element: CallHierarchyItem): boolean {
		return true;
	}

	async getChildren(element: CallHierarchyItem | Call): Promise<Call[]> {
		if (element instanceof Call) {
			element = element.item;
		}
		const direction = this.direction();
		const calls = await this.provider.resolveCallHierarchyItem(element, direction, CancellationToken.None);
		return calls
			? calls.map(([item, locations]) => new Call(direction, item, locations))
			: [];
	}
}

export class IdentityProvider implements IIdentityProvider<Call> {
	getId(element: Call): { toString(): string; } {
		return element.item._id;
	}
}

class CallRenderingTemplate {
	readonly disposable: IDisposable[];
	readonly iconLabel: IconLabel;
	readonly badge: CountBadge;
}

export class CallRenderer implements ITreeRenderer<Call, FuzzyScore, CallRenderingTemplate> {

	static id = 'CallRenderer';

	templateId: string = CallRenderer.id;

	constructor(
		@ILabelService private readonly _labelService: ILabelService,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	renderTemplate(parent: HTMLElement): CallRenderingTemplate {
		const container = append(parent, $('.call'));
		const iconLabel = new IconLabel(container, { supportHighlights: true });
		const badge = new CountBadge(append(container, $('.count')));
		const listener = attachBadgeStyler(badge, this._themeService);
		return { iconLabel, badge, disposable: [iconLabel, listener] };
	}

	renderElement(node: ITreeNode<Call, FuzzyScore>, _index: number, template: CallRenderingTemplate): void {
		const { element, filterData } = node;
		const detail = element.item.detail || this._labelService.getUriLabel(element.item.uri, { relative: true });

		template.iconLabel.setLabel(
			element.item.name,
			detail,
			{
				labelEscapeNewLines: true,
				matches: createMatches(filterData),
				extraClasses: [symbolKindToCssClass(element.item.kind, true)]
			}
		);

		template.badge.setCount(element.locations.length);
		template.badge.setTitleFormat(element.direction === CallHierarchyDirection.CallsTo
			? localize('count.to', "{0} calls to")
			: localize('count.from', "{0} calls from"));

	}
	disposeTemplate(template: CallRenderingTemplate): void {
		dispose(template.disposable);
	}
}

export class VirtualDelegate implements IListVirtualDelegate<Call> {

	getHeight(_element: Call): number {
		return 22;
	}

	getTemplateId(_element: Call): string {
		return CallRenderer.id;
	}
}
