/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, IFocusTracker, ModifierKeyEmitter, trackFocus } from '../../../base/browser/dom.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IObservable, IReader, observableFromEvent, observableValue } from '../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IModifierKeyStatus, IUserInteractionService } from './userInteractionService.js';

export class UserInteractionService implements IUserInteractionService {
	readonly _serviceBrand: undefined;

	private readonly _modifierObservables = new WeakMap<Window, IObservable<IModifierKeyStatus>>();

	readModifierKeyStatus(element: HTMLElement | Window, reader: IReader | undefined): IModifierKeyStatus {
		const win = element instanceof Window ? element : getWindow(element);
		let obs = this._modifierObservables.get(win);
		if (!obs) {
			const emitter = ModifierKeyEmitter.getInstance();
			obs = observableFromEvent<IModifierKeyStatus>(
				this,
				emitter.event,
				() => ({
					ctrlKey: emitter.keyStatus.ctrlKey,
					shiftKey: emitter.keyStatus.shiftKey,
					altKey: emitter.keyStatus.altKey,
					metaKey: emitter.keyStatus.metaKey,
				})
			);
			this._modifierObservables.set(win, obs);
		}
		return obs.read(reader);
	}

	createFocusTracker(element: HTMLElement | Window, store: DisposableStore): IObservable<boolean> {
		const tracker = store.add(trackFocus(element));
		const hasFocusWithin = (el: HTMLElement | Window): boolean => {
			if (el instanceof Window) {
				return el.document.hasFocus();
			}
			const shadowRoot = el.getRootNode() instanceof ShadowRoot ? el.getRootNode() as ShadowRoot : null;
			const activeElement = shadowRoot ? shadowRoot.activeElement : el.ownerDocument.activeElement;
			return el.contains(activeElement);
		};

		const value = observableValue<boolean>('isFocused', hasFocusWithin(element));
		store.add(tracker.onDidFocus(() => value.set(true, undefined)));
		store.add(tracker.onDidBlur(() => value.set(false, undefined)));
		return value;
	}

	createHoverTracker(element: Element, store: DisposableStore): IObservable<boolean> {
		const value = observableValue<boolean>('isHovered', false);
		const onEnter = () => value.set(true, undefined);
		const onLeave = () => value.set(false, undefined);
		element.addEventListener('mouseenter', onEnter);
		element.addEventListener('mouseleave', onLeave);
		store.add({
			dispose: () => {
				element.removeEventListener('mouseenter', onEnter);
				element.removeEventListener('mouseleave', onLeave);
			}
		});
		return value;
	}

	createDomFocusTracker(element: HTMLElement): IFocusTracker {
		return trackFocus(element);
	}
}

registerSingleton(IUserInteractionService, UserInteractionService, InstantiationType.Delayed);
