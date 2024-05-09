/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from 'vs/base/common/htmlContent';
import { DisposableMap, IDisposable, DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { AccessibleViewType, ExtensionContentProvider } from 'vs/platform/accessibility/browser/accessibleView';
import { AccessibleViewRegistry } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { Registry } from 'vs/platform/registry/common/platform';
import { FocusedViewContext } from 'vs/workbench/common/contextkeys';
import { IViewsRegistry, Extensions, IViewDescriptor } from 'vs/workbench/common/views';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

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
	const helpContent = resolveExtensionHelpContent(keybindingService, viewDescriptor.accessibilityHelpContent);
	if (!helpContent) {
		throw new Error('No help content for view');
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
				() => helpContent.value,
				() => viewsService.openView(viewDescriptor.id, true)
			);
		}
	}));

	disposableStore.add(keybindingService.onDidUpdateKeybindings(() => {
		disposableStore.clear();
		disposableStore.add(registerAccessibilityHelpAction(keybindingService, viewDescriptor));
	}));
	return disposableStore;
}

function resolveExtensionHelpContent(keybindingService: IKeybindingService, content?: MarkdownString): MarkdownString | undefined {
	if (!content) {
		return;
	}
	let resolvedContent = typeof content === 'string' ? content : content.value;
	const matches = resolvedContent.matchAll(/\<keybinding:(?<commandId>.*)\>/gm);
	for (const match of [...matches]) {
		const commandId = match?.groups?.commandId;
		if (match?.length && commandId) {
			const keybinding = keybindingService.lookupKeybinding(commandId)?.getAriaLabel();
			let kbLabel = keybinding;
			if (!kbLabel) {
				const args = URI.parse(`command:workbench.action.openGlobalKeybindings?${encodeURIComponent(JSON.stringify(commandId))}`);
				kbLabel = ` [Configure a keybinding](${args})`;
			} else {
				kbLabel = ' (' + keybinding + ')';
			}
			resolvedContent = resolvedContent.replace(match[0], kbLabel);
		}
	}
	const result = new MarkdownString(resolvedContent);
	result.isTrusted = true;
	return result;
}
