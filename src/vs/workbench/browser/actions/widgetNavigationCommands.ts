/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { WorkbenchListFocusContextKey, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey } from 'vs/platform/list/browser/listService';
import { Event } from 'vs/base/common/event';
import { combinedDisposable, toDisposable, IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

/** INavigatableContainer represents a logical container composed of widgets that can
	be navigated back and forth with key shortcuts */
interface INavigatableContainer {
	/**
	 * The container may coomposed of multiple parts that share no DOM ancestor
	 * (e.g., the main body and filter box of MarkersView may be separated).
	 * To track the focus of container we must pass in focus/blur events of all parts
	 * as `focusNotifiers`.
	 *
	 * Each element of `focusNotifiers` notifies the focus/blur event for a part of
	 * the container. The container is considered focused if at least one part being
	 * focused, and blurred if all parts being blurred.
	 */
	readonly focusNotifiers: readonly IFocusNotifier[];
	focusPreviousWidget(): void;
	focusNextWidget(): void;
}

interface IFocusNotifier {
	readonly onDidFocus: Event<any>;
	readonly onDidBlur: Event<any>;
}

function handleFocusEventsGroup(group: readonly IFocusNotifier[], handler: (isFocus: boolean) => void): IDisposable {
	const focusedIndices = new Set<number>();
	return combinedDisposable(...group.map((events, index) => combinedDisposable(
		events.onDidFocus(() => {
			if (!focusedIndices.size) {
				handler(true);
			}
			focusedIndices.add(index);
		}),
		events.onDidBlur(() => {
			focusedIndices.delete(index);
			if (!focusedIndices.size) {
				handler(false);
			}
		}),
	)));
}

const NavigatableContainerFocusedContextKey = new RawContextKey<boolean>('navigatableContainerFocused', false);

class NavigatableContainerManager implements IDisposable {
	private static INSTANCE: NavigatableContainerManager | undefined;

	private readonly containers = new Set<INavigatableContainer>();
	private lastContainer: INavigatableContainer | undefined;
	private focused: IContextKey<boolean>;


	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this.focused = NavigatableContainerFocusedContextKey.bindTo(contextKeyService);
		NavigatableContainerManager.INSTANCE = this;
	}

	dispose(): void {
		this.containers.clear();
		this.focused.reset();
		NavigatableContainerManager.INSTANCE = undefined;
	}

	static register(container: INavigatableContainer): IDisposable {
		const instance = this.INSTANCE;
		if (!instance) {
			return Disposable.None;
		}
		instance.containers.add(container);

		return combinedDisposable(
			handleFocusEventsGroup(container.focusNotifiers, (isFocus) => {
				if (isFocus) {
					instance.focused.set(true);
					instance.lastContainer = container;
				} else if (instance.lastContainer === container) {
					instance.focused.set(false);
					instance.lastContainer = undefined;
				}
			}),
			toDisposable(() => {
				instance.containers.delete(container);
				if (instance.lastContainer === container) {
					instance.focused.set(false);
					instance.lastContainer = undefined;
				}
			})
		);
	}

	static getActive(): INavigatableContainer | undefined {
		return this.INSTANCE?.lastContainer;
	}
}

export function registerNavigatableContainer(container: INavigatableContainer): IDisposable {
	return NavigatableContainerManager.register(container);
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(NavigatableContainerManager, LifecyclePhase.Starting);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'widgetNavigation.focusPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		NavigatableContainerFocusedContextKey,
		ContextKeyExpr.or(
			WorkbenchListFocusContextKey?.negate(),
			WorkbenchListScrollAtTopContextKey,
		)
	),
	primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
	handler: () => {
		const activeContainer = NavigatableContainerManager.getActive();
		activeContainer?.focusPreviousWidget();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'widgetNavigation.focusNext',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		NavigatableContainerFocusedContextKey,
		ContextKeyExpr.or(
			WorkbenchListFocusContextKey?.negate(),
			WorkbenchListScrollAtBottomContextKey,
		)
	),
	primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
	handler: () => {
		const activeContainer = NavigatableContainerManager.getActive();
		activeContainer?.focusNextWidget();
	}
});
