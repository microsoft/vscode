/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableMap, IDisposable, DisposableStore, Disposable } from '../../../../base/common/lifecycle';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions';
import { AccessibleViewType, ExtensionContentProvider } from '../../../../platform/accessibility/browser/accessibleView';
import { AccessibleViewRegistry } from '../../../../platform/accessibility/browser/accessibleViewRegistry';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding';
import { Registry } from '../../../../platform/registry/common/platform';
import { FocusedViewContext } from '../../../common/contextkeys';
import { IViewsRegistry, Extensions, IViewDescriptor } from '../../../common/views';
import { IViewsService } from '../../../services/views/common/viewsService';

export class ExtensionAccessibilityHelpDialogContribution extends Disposable {
	static ID = 'extensionAccessibilityHelpDialogContribution';
	private _viewHelpDialogMap = this._register(new DisposableMap<string, IDisposable>());
	constructor(@IKeybindingService keybindingService: IKeybindingService) {
		super();
		this._register(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).onViewsRegistered(e => {
			for (const view of e) {
				for (const viewDescriptor of view.views) {
					if (viewDescriptor.accessibilityHelpContent) {
						this._viewHelpDialogMap.set(viewDescriptor.id, registerAccessibilityHelpAction(keybindingService, viewDescriptor));
					}
				}
			}
		}));
		this._register(Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).onViewsDeregistered(e => {
			for (const viewDescriptor of e.views) {
				if (viewDescriptor.accessibilityHelpContent) {
					this._viewHelpDialogMap.get(viewDescriptor.id)?.dispose();
				}
			}
		}));
	}
}

function registerAccessibilityHelpAction(keybindingService: IKeybindingService, viewDescriptor: IViewDescriptor): IDisposable {
	const disposableStore = new DisposableStore();
	const content = viewDescriptor.accessibilityHelpContent?.value;
	if (!content) {
		throw new Error('No content provided for the accessibility help dialog');
	}
	disposableStore.add(AccessibleViewRegistry.register({
		priority: 95,
		name: viewDescriptor.id,
		type: AccessibleViewType.Help,
		when: FocusedViewContext.isEqualTo(viewDescriptor.id),
		getProvider: (accessor: ServicesAccessor) => {
			const viewsService = accessor.get(IViewsService);
			return new ExtensionContentProvider(
				viewDescriptor.id,
				{ type: AccessibleViewType.Help },
				() => content,
				() => viewsService.openView(viewDescriptor.id, true),
			);
		},
	}));

	disposableStore.add(keybindingService.onDidUpdateKeybindings(() => {
		disposableStore.clear();
		disposableStore.add(registerAccessibilityHelpAction(keybindingService, viewDescriptor));
	}));
	return disposableStore;
}
