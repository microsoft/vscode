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

/** INavigableContainer represents a logical container composed of widgets that can
	be navigated back and forth with key shortcuts */
interface INavigableContainer {
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

const NavigableContainerFocusedContextKey = new RawContextKey<boolean>('navigableContainerFocused', false);

class NavigableContainerManager implements IDisposable {
	private static INSTANCE: NavigableContainerManager | undefined;

	private readonly containers = new Set<INavigableContainer>();
	private lastContainer: INavigableContainer | undefined;
	private focused: IContextKey<boolean>;


	constructor(@IContextKeyService contextKeyService: IContextKeyService) {
		this.focused = NavigableContainerFocusedContextKey.bindTo(contextKeyService);
		NavigableContainerManager.INSTANCE = this;
	}

	dispose(): void {
		this.containers.clear();
		this.focused.reset();
		NavigableContainerManager.INSTANCE = undefined;
	}

	static register(container: INavigableContainer): IDisposable {
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

	static getActive(): INavigableContainer | undefined {
		return this.INSTANCE?.lastContainer;
	}
}

export function registerNavigableContainer(container: INavigableContainer): IDisposable {
	return NavigableContainerManager.register(container);
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(NavigableContainerManager, LifecyclePhase.Starting);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'widgetNavigation.focusPrevious',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		NavigableContainerFocusedContextKey,
		ContextKeyExpr.or(
			WorkbenchListFocusContextKey?.negate(),
			WorkbenchListScrollAtTopContextKey,
		)
	),
	primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
	handler: () => {
		const activeContainer = NavigableContainerManager.getActive();
		activeContainer?.focusPreviousWidget();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'widgetNavigation.focusNext',
	weight: KeybindingWeight.WorkbenchContrib,
	when: ContextKeyExpr.and(
		NavigableContainerFocusedContextKey,
		ContextKeyExpr.or(
			WorkbenchListFocusContextKey?.negate(),
			WorkbenchListScrollAtBottomContextKey,
		)
	),
	primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
	handler: () => {
		const activeContainer = NavigableContainerManager.getActive();
		activeContainer?.focusNextWidget();
	}
});
