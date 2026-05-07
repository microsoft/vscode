/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatPhoneInputPresenter.css';
import * as dom from '../../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../../base/browser/touch.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { localize } from '../../../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IModePickerDelegate } from './modePickerActionItem.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';

/**
 * Implementation of the phone-only chat-input picker presenter, registered
 * by the agents-window (sessions) layer. Stays in `vs/workbench` as an
 * interface so the workbench chat input can compile and run with no
 * sessions dependency; the default singleton is a no-op.
 */
export interface IChatPhonePresenterImpl {
	/**
	 * Whether the phone presenter is currently active. Workbench code
	 * consults this to decide between desktop popups and the bottom-sheet
	 * presentation. Drives a `_updateToolbar()` refresh on flips.
	 */
	readonly enabled: IObservable<boolean>;

	/**
	 * Show a unified bottom sheet listing both Mode and Model rows for the
	 * given chat input pickers. Resolves once the user dismisses the sheet.
	 *
	 * `modeDelegate` / `modelDelegate` are optional: callers without
	 * access to a workbench `ChatInputPart` (e.g. the agents-window
	 * agent-host mode pill, which does not own the chat input) can pass
	 * `undefined` and the implementation will fall back to its
	 * agent-host data path.
	 */
	showCombinedModeAndModelSheet(
		target: HTMLElement,
		modeDelegate: IModePickerDelegate | undefined,
		modelDelegate: IModelPickerDelegate | undefined,
	): Promise<void>;
}

export const IChatPhoneInputPresenter = createDecorator<IChatPhoneInputPresenter>('chatPhoneInputPresenter');

/**
 * Workbench-layer hook for phone-only chat-input picker presentation.
 *
 * The default singleton is a no-op (`enabled === false`, sheet calls
 * resolve immediately). The agents-window layer (`vs/sessions`) registers
 * a real implementation via {@link setImpl} that opens the same bottom-
 * sheet picker the empty new-chat input already uses.
 *
 * Workbench callers should:
 *   1. Read `enabled.get()` to decide whether to render the standard
 *      desktop pickers or hand off to the phone presenter.
 *   2. Subscribe to `enabled` (e.g. via `autorun`) so the toolbar can be
 *      refreshed when the phone state changes (rotation, etc.).
 */
export interface IChatPhoneInputPresenter {
	readonly _serviceBrand: undefined;

	/** `true` when an impl is registered AND it reports phone layout. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Show the unified phone-layout Mode + Model sheet. No-ops when
	 * {@link enabled} is `false`.
	 */
	showCombinedModeAndModelSheet(
		target: HTMLElement,
		modeDelegate: IModePickerDelegate | undefined,
		modelDelegate: IModelPickerDelegate | undefined,
	): Promise<void>;

	/**
	 * Register the phone implementation. Returns a disposable that removes
	 * the registration. Only one impl is active at a time; the most recent
	 * registration wins.
	 */
	setImpl(impl: IChatPhonePresenterImpl): IDisposable;
}

class ChatPhoneInputPresenterService extends Disposable implements IChatPhoneInputPresenter {

	declare readonly _serviceBrand: undefined;

	private readonly _impl = observableValue<IChatPhonePresenterImpl | undefined>(this, undefined);

	readonly enabled: IObservable<boolean> = derived(this, reader => {
		const impl = this._impl.read(reader);
		return impl ? impl.enabled.read(reader) : false;
	});

	showCombinedModeAndModelSheet(
		target: HTMLElement,
		modeDelegate: IModePickerDelegate | undefined,
		modelDelegate: IModelPickerDelegate | undefined,
	): Promise<void> {
		const impl = this._impl.get();
		return impl ? impl.showCombinedModeAndModelSheet(target, modeDelegate, modelDelegate) : Promise.resolve();
	}

	setImpl(impl: IChatPhonePresenterImpl): IDisposable {
		this._impl.set(impl, undefined);
		return toDisposable(() => {
			if (this._impl.get() === impl) {
				this._impl.set(undefined, undefined);
			}
		});
	}
}

registerSingleton(IChatPhoneInputPresenter, ChatPhoneInputPresenterService, InstantiationType.Delayed);

/**
 * Phone-only action view item used in place of the desktop Model and Mode
 * pickers. Renders a single chip whose label shows the current model name
 * with the current mode's icon as a leading marker; tapping it opens the
 * unified bottom sheet through the {@link IChatPhoneInputPresenter}.
 *
 * Visually mirrors the chip used in the empty new-chat input (see
 * `MobileChatInputConfigPicker` in `vs/sessions`) so the two chat-input
 * surfaces present a consistent mobile experience.
 */
export class MobileChatInputCombinedPickerActionItem extends BaseActionViewItem {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _triggerElement: HTMLElement | undefined;

	constructor(
		action: IAction,
		private readonly _modeDelegate: IModePickerDelegate,
		private readonly _modelDelegate: IModelPickerDelegate,
		@IChatPhoneInputPresenter private readonly _presenter: IChatPhoneInputPresenter,
	) {
		super(undefined, action);
	}

	override render(container: HTMLElement): void {
		// Skip `super.render` so the base view item doesn't install its
		// own Gesture/Tap/CLICK on the container — that would dispatch
		// each tap twice (container runs the action, trigger opens the sheet).
		this.element = container;
		container.classList.add('chat-input-picker-item');
		this._renderDisposables.clear();

		const trigger = dom.append(container, dom.$('a.action-label.chat-phone-input-chip'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showSheet();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showSheet();
			}
		}));

		// Reactively re-render the chip when the active mode (label/icon)
		// or the selected model changes.
		this._renderDisposables.add(autorun(reader => {
			const currentMode = this._modeDelegate.currentMode.read(reader);
			currentMode.label.read(reader);
			currentMode.icon.read(reader);
			this._modelDelegate.currentModel.read(reader);
			this._updateTrigger();
		}));
	}

	private _updateTrigger(): void {
		const trigger = this._triggerElement;
		if (!trigger) {
			return;
		}
		dom.clearNode(trigger);

		const currentMode = this._modeDelegate.currentMode.get();
		const modeIcon = currentMode.icon.get();
		if (modeIcon) {
			dom.append(trigger, renderIcon(modeIcon));
		}

		const currentModel = this._modelDelegate.currentModel.get();
		const labelText = currentModel?.metadata.name
			?? localize('chatPhoneInput.autoLabel', "Auto");
		const labelSpan = dom.append(trigger, dom.$('span.chat-input-picker-label'));
		labelSpan.textContent = labelText;

		dom.append(trigger, renderIcon(Codicon.chevronDown));

		const ariaParts: string[] = [];
		const modeLabel = currentMode.label.get();
		if (modeLabel) {
			ariaParts.push(modeLabel);
		}
		ariaParts.push(labelText);
		trigger.ariaLabel = localize(
			'chatPhoneInput.triggerAriaLabel',
			"Pick Mode and Model, {0}",
			ariaParts.join(', '),
		);
	}

	/** Belt-and-braces: keep the action's `run()` suppressed even if `super.render` is reintroduced. */
	override onClick(): void { /* handled by trigger */ }

	private async _showSheet(): Promise<void> {
		const trigger = this._triggerElement;
		if (!trigger) {
			return;
		}
		trigger.setAttribute('aria-expanded', 'true');
		try {
			await this._presenter.showCombinedModeAndModelSheet(trigger, this._modeDelegate, this._modelDelegate);
		} finally {
			trigger.setAttribute('aria-expanded', 'false');
			trigger.focus();
		}
	}
}
