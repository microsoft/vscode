/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyMod, KeyCode } from '../../../base/common/keyCodes.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight, KeybindingsRegistry } from '../../../platform/keybinding/common/keybindingsRegistry.js';
import { WorkbenchListFocusContextKey, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey } from '../../../platform/list/browser/listService.js';
import { Event } from '../../../base/common/event.js';
import { combinedDisposable, toDisposable, IDisposable, Disposable } from '../../../base/common/lifecycle.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../common/contributions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../platform/configuration/common/configuration.js';

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
	readonly name?: string; // for debugging
	focusPreviousWidget(): void;
	focusNextWidget(): void;
}

interface IFocusNotifier {
	readonly onDidFocus: Event<any>;
	readonly onDidBlur: Event<any>;
}

function handleFocusEventsGroup(group: readonly IFocusNotifier[], handler: (isFocus: boolean) => void, onPartFocusChange?: (index: number, state: string) => void): IDisposable {
	const focusedIndices = new Set<number>();
	return combinedDisposable(...group.map((events, index) => combinedDisposable(
		events.onDidFocus(() => {
			onPartFocusChange?.(index, 'focus');
			if (!focusedIndices.size) {
				handler(true);
			}
			focusedIndices.add(index);
		}),
		events.onDidBlur(() => {
			onPartFocusChange?.(index, 'blur');
			focusedIndices.delete(index);
			if (!focusedIndices.size) {
				handler(false);
			}
		}),
	)));
}

const NavigableContainerFocusedContextKey = new RawContextKey<boolean>('navigableContainerFocused', false);

class NavigableContainerManager implements IDisposable {

	static readonly ID = 'workbench.contrib.navigableContainerManager';

	private static INSTANCE: NavigableContainerManager | undefined;

	private readonly containers = new Set<INavigableContainer>();
	private lastContainer: INavigableContainer | undefined;
	private focused: IContextKey<boolean>;


	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILogService private logService: ILogService,
		@IConfigurationService private configurationService: IConfigurationService) {
		this.focused = NavigableContainerFocusedContextKey.bindTo(contextKeyService);
		NavigableContainerManager.INSTANCE = this;
	}

	dispose(): void {
		this.containers.clear();
		this.focused.reset();
		NavigableContainerManager.INSTANCE = undefined;
	}

	private get debugEnabled(): boolean {
		return this.configurationService.getValue('workbench.navigibleContainer.enableDebug');
	}

	private log(msg: string, ...args: any[]): void {
		if (this.debugEnabled) {
			this.logService.debug(msg, ...args);
		}
	}

	static register(container: INavigableContainer): IDisposable {
		const instance = this.INSTANCE;
		if (!instance) {
			return Disposable.None;
		}
		instance.containers.add(container);
		instance.log('NavigableContainerManager.register', container.name);

		return combinedDisposable(
			handleFocusEventsGroup(container.focusNotifiers, (isFocus) => {
				if (isFocus) {
					instance.log('NavigableContainerManager.focus', container.name);
					instance.focused.set(true);
					instance.lastContainer = container;
				} else {
					instance.log('NavigableContainerManager.blur', container.name, instance.lastContainer?.name);
					if (instance.lastContainer === container) {
						instance.focused.set(false);
						instance.lastContainer = undefined;
					}
				}
			}, (index: number, event: string) => {
				instance.log('NavigableContainerManager.partFocusChange', container.name, index, event);
			}),
			toDisposable(() => {
				instance.containers.delete(container);
				instance.log('NavigableContainerManager.unregister', container.name, instance.lastContainer?.name);
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

registerWorkbenchContribution2(NavigableContainerManager.ID, NavigableContainerManager, WorkbenchPhase.BlockStartup);

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
