/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from 'vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IKeyMods, IQuickPickDidAcceptEvent, IQuickPickSeparator, IQuickPick, IQuickPickItem, IQuickInputButton } from 'vs/platform/quickinput/common/quickInput';
import { IQuickAccessProvider, IQuickAccessProviderRunOptions } from 'vs/platform/quickinput/common/quickAccess';
import { isFunction } from 'vs/base/common/types';

export enum TriggerAction {

	/**
	 * Do nothing after the button was clicked.
	 */
	NO_ACTION,

	/**
	 * Close the picker.
	 */
	CLOSE_PICKER,

	/**
	 * Update the results of the picker.
	 */
	REFRESH_PICKER,

	/**
	 * Remove the item from the picker.
	 */
	REMOVE_ITEM
}

export interface IPickerQuickAccessItem extends IQuickPickItem {

	/**
	* A method that will be executed when the pick item is accepted from
	* the picker. The picker will close automatically before running this.
	*
	* @param keyMods the state of modifier keys when the item was accepted.
	* @param event the underlying event that caused the accept to trigger.
	*/
	accept?(keyMods: IKeyMods, event: IQuickPickDidAcceptEvent): void;

	/**
	 * A method that will be executed when a button of the pick item was
	 * clicked on.
	 *
	 * @param buttonIndex index of the button of the item that
	 * was clicked.
	 *
	 * @param the state of modifier keys when the button was triggered.
	 *
	 * @returns a value that indicates what should happen after the trigger
	 * which can be a `Promise` for long running operations.
	 */
	trigger?(buttonIndex: number, keyMods: IKeyMods): TriggerAction | Promise<TriggerAction>;
}

export interface IPickerQuickAccessSeparator extends IQuickPickSeparator {
	/**
	 * A method that will be executed when a button of the pick item was
	 * clicked on.
	 *
	 * @param buttonIndex index of the button of the item that
	 * was clicked.
	 *
	 * @param the state of modifier keys when the button was triggered.
	 *
	 * @returns a value that indicates what should happen after the trigger
	 * which can be a `Promise` for long running operations.
	 */
	trigger?(buttonIndex: number, keyMods: IKeyMods): TriggerAction | Promise<TriggerAction>;
}

export interface IPickerQuickAccessProviderOptions<T extends IPickerQuickAccessItem> {

	/**
	 * Enables support for opening picks in the background via gesture.
	 */
	readonly canAcceptInBackground?: boolean;

	/**
	 * Enables to show a pick entry when no results are returned from a search.
	 */
	readonly noResultsPick?: T | ((filter: string) => T);

	/** Whether to skip trimming the pick filter string */
	readonly shouldSkipTrimPickFilter?: boolean;
}

export type Pick<T> = T | IQuickPickSeparator;
export type PicksWithActive<T> = { items: readonly Pick<T>[]; active?: T };
export type Picks<T> = readonly Pick<T>[] | PicksWithActive<T>;
export type FastAndSlowPicks<T> = {

	/**
	 * Picks that will show instantly or after a short delay
	 * based on the `mergeDelay` property to reduce flicker.
	 */
	readonly picks: Picks<T>;

	/**
	 * Picks that will show after they have been resolved.
	 */
	readonly additionalPicks: Promise<Picks<T>>;

	/**
	 * A delay in milliseconds to wait before showing the
	 * `picks` to give a chance to merge with `additionalPicks`
	 * for reduced flicker.
	 */
	readonly mergeDelay?: number;
};

function isPicksWithActive<T>(obj: unknown): obj is PicksWithActive<T> {
	const candidate = obj as PicksWithActive<T>;

	return Array.isArray(candidate.items);
}

function isFastAndSlowPicks<T>(obj: unknown): obj is FastAndSlowPicks<T> {
	const candidate = obj as FastAndSlowPicks<T>;

	return !!candidate.picks && candidate.additionalPicks instanceof Promise;
}

export abstract class PickerQuickAccessProvider<T extends IPickerQuickAccessItem> extends Disposable implements IQuickAccessProvider {

	constructor(private prefix: string, protected options?: IPickerQuickAccessProviderOptions<T>) {
		super();
	}

	provide(picker: IQuickPick<T>, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): IDisposable {
		const disposables = new DisposableStore();

		// Apply options if any
		picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;

		// Disable filtering & sorting, we control the results
		picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;

		// Set initial picks and update on type
		let picksCts: CancellationTokenSource | undefined = undefined;
		const picksDisposable = disposables.add(new MutableDisposable());
		const updatePickerItems = async () => {
			const picksDisposables = picksDisposable.value = new DisposableStore();

			// Cancel any previous ask for picks and busy
			picksCts?.dispose(true);
			picker.busy = false;

			// Create new cancellation source for this run
			picksCts = new CancellationTokenSource(token);

			// Collect picks and support both long running and short or combined
			const picksToken = picksCts.token;
			let picksFilter = picker.value.substring(this.prefix.length);

			if (!this.options?.shouldSkipTrimPickFilter) {
				picksFilter = picksFilter.trim();
			}

			const providedPicks = this._getPicks(picksFilter, picksDisposables, picksToken, runOptions);

			const applyPicks = (picks: Picks<T>, skipEmpty?: boolean): boolean => {
				let items: readonly Pick<T>[];
				let activeItem: T | undefined = undefined;

				if (isPicksWithActive(picks)) {
					items = picks.items;
					activeItem = picks.active;
				} else {
					items = picks;
				}

				if (items.length === 0) {
					if (skipEmpty) {
						return false;
					}

					// We show the no results pick if we have no input to prevent completely empty pickers #172613
					if ((picksFilter.length > 0 || picker.hideInput) && this.options?.noResultsPick) {
						if (isFunction(this.options.noResultsPick)) {
							items = [this.options.noResultsPick(picksFilter)];
						} else {
							items = [this.options.noResultsPick];
						}
					}
				}

				picker.items = items;
				if (activeItem) {
					picker.activeItems = [activeItem];
				}

				return true;
			};

			const applyFastAndSlowPicks = async (fastAndSlowPicks: FastAndSlowPicks<T>): Promise<void> => {
				let fastPicksApplied = false;
				let slowPicksApplied = false;

				await Promise.all([

					// Fast Picks: if `mergeDelay` is configured, in order to reduce
					// amount of flicker, we race against the slow picks over some delay
					// and then set the fast picks.
					// If the slow picks are faster, we reduce the flicker by only
					// setting the items once.

					(async () => {
						if (typeof fastAndSlowPicks.mergeDelay === 'number') {
							await timeout(fastAndSlowPicks.mergeDelay);
							if (picksToken.isCancellationRequested) {
								return;
							}
						}

						if (!slowPicksApplied) {
							fastPicksApplied = applyPicks(fastAndSlowPicks.picks, true /* skip over empty to reduce flicker */);
						}
					})(),

					// Slow Picks: we await the slow picks and then set them at
					// once together with the fast picks, but only if we actually
					// have additional results.

					(async () => {
						picker.busy = true;
						try {
							const awaitedAdditionalPicks = await fastAndSlowPicks.additionalPicks;
							if (picksToken.isCancellationRequested) {
								return;
							}

							let picks: readonly Pick<T>[];
							let activePick: Pick<T> | undefined = undefined;
							if (isPicksWithActive(fastAndSlowPicks.picks)) {
								picks = fastAndSlowPicks.picks.items;
								activePick = fastAndSlowPicks.picks.active;
							} else {
								picks = fastAndSlowPicks.picks;
							}

							let additionalPicks: readonly Pick<T>[];
							let additionalActivePick: Pick<T> | undefined = undefined;
							if (isPicksWithActive(awaitedAdditionalPicks)) {
								additionalPicks = awaitedAdditionalPicks.items;
								additionalActivePick = awaitedAdditionalPicks.active;
							} else {
								additionalPicks = awaitedAdditionalPicks;
							}

							if (additionalPicks.length > 0 || !fastPicksApplied) {
								// If we do not have any activePick or additionalActivePick
								// we try to preserve the currently active pick from the
								// fast results. This fixes an issue where the user might
								// have made a pick active before the additional results
								// kick in.
								// See https://github.com/microsoft/vscode/issues/102480
								let fallbackActivePick: Pick<T> | undefined = undefined;
								if (!activePick && !additionalActivePick) {
									const fallbackActivePickCandidate = picker.activeItems[0];
									if (fallbackActivePickCandidate && picks.indexOf(fallbackActivePickCandidate) !== -1) {
										fallbackActivePick = fallbackActivePickCandidate;
									}
								}

								applyPicks({
									items: [...picks, ...additionalPicks],
									active: activePick || additionalActivePick || fallbackActivePick
								});
							}
						} finally {
							if (!picksToken.isCancellationRequested) {
								picker.busy = false;
							}

							slowPicksApplied = true;
						}
					})()
				]);
			};

			// No Picks
			if (providedPicks === null) {
				// Ignore
			}

			// Fast and Slow Picks
			else if (isFastAndSlowPicks(providedPicks)) {
				await applyFastAndSlowPicks(providedPicks);
			}

			// Fast Picks
			else if (!(providedPicks instanceof Promise)) {
				applyPicks(providedPicks);
			}

			// Slow Picks
			else {
				picker.busy = true;
				try {
					const awaitedPicks = await providedPicks;
					if (picksToken.isCancellationRequested) {
						return;
					}

					if (isFastAndSlowPicks(awaitedPicks)) {
						await applyFastAndSlowPicks(awaitedPicks);
					} else {
						applyPicks(awaitedPicks);
					}
				} finally {
					if (!picksToken.isCancellationRequested) {
						picker.busy = false;
					}
				}
			}
		};
		disposables.add(picker.onDidChangeValue(() => updatePickerItems()));
		updatePickerItems();

		// Accept the pick on accept and hide picker
		disposables.add(picker.onDidAccept(event => {
			const [item] = picker.selectedItems;
			if (typeof item?.accept === 'function') {
				if (!event.inBackground) {
					picker.hide(); // hide picker unless we accept in background
				}

				item.accept(picker.keyMods, event);
			}
		}));

		const buttonTrigger = async (button: IQuickInputButton, item: T | IPickerQuickAccessSeparator) => {
			if (typeof item.trigger !== 'function') {
				return;
			}

			const buttonIndex = item.buttons?.indexOf(button) ?? -1;
			if (buttonIndex >= 0) {
				const result = item.trigger(buttonIndex, picker.keyMods);
				const action = (typeof result === 'number') ? result : await result;

				if (token.isCancellationRequested) {
					return;
				}

				switch (action) {
					case TriggerAction.NO_ACTION:
						break;
					case TriggerAction.CLOSE_PICKER:
						picker.hide();
						break;
					case TriggerAction.REFRESH_PICKER:
						updatePickerItems();
						break;
					case TriggerAction.REMOVE_ITEM: {
						const index = picker.items.indexOf(item);
						if (index !== -1) {
							const items = picker.items.slice();
							const removed = items.splice(index, 1);
							const activeItems = picker.activeItems.filter(activeItem => activeItem !== removed[0]);
							const keepScrollPositionBefore = picker.keepScrollPosition;
							picker.keepScrollPosition = true;
							picker.items = items;
							if (activeItems) {
								picker.activeItems = activeItems;
							}
							picker.keepScrollPosition = keepScrollPositionBefore;
						}
						break;
					}
				}
			}
		};

		// Trigger the pick with button index if button triggered
		disposables.add(picker.onDidTriggerItemButton(({ button, item }) => buttonTrigger(button, item)));
		disposables.add(picker.onDidTriggerSeparatorButton(({ button, separator }) => buttonTrigger(button, separator)));

		return disposables;
	}

	/**
	 * Returns an array of picks and separators as needed. If the picks are resolved
	 * long running, the provided cancellation token should be used to cancel the
	 * operation when the token signals this.
	 *
	 * The implementor is responsible for filtering and sorting the picks given the
	 * provided `filter`.
	 *
	 * @param filter a filter to apply to the picks.
	 * @param disposables can be used to register disposables that should be cleaned
	 * up when the picker closes.
	 * @param token for long running tasks, implementors need to check on cancellation
	 * through this token.
	 * @returns the picks either directly, as promise or combined fast and slow results.
	 * Pickers can return `null` to signal that no change in picks is needed.
	 */
	protected abstract _getPicks(filter: string, disposables: DisposableStore, token: CancellationToken, runOptions?: IQuickAccessProviderRunOptions): Picks<T> | Promise<Picks<T> | FastAndSlowPicks<T>> | FastAndSlowPicks<T> | null;
}
