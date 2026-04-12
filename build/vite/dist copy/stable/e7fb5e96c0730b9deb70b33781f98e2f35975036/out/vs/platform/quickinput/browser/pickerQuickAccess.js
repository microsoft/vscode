/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { timeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { isKeyModified } from '../common/quickInput.js';
import { isFunction } from '../../../base/common/types.js';
export var TriggerAction;
(function (TriggerAction) {
    /**
     * Do nothing after the button was clicked.
     */
    TriggerAction[TriggerAction["NO_ACTION"] = 0] = "NO_ACTION";
    /**
     * Close the picker.
     */
    TriggerAction[TriggerAction["CLOSE_PICKER"] = 1] = "CLOSE_PICKER";
    /**
     * Update the results of the picker.
     */
    TriggerAction[TriggerAction["REFRESH_PICKER"] = 2] = "REFRESH_PICKER";
    /**
     * Remove the item from the picker.
     */
    TriggerAction[TriggerAction["REMOVE_ITEM"] = 3] = "REMOVE_ITEM";
})(TriggerAction || (TriggerAction = {}));
function isPicksWithActive(obj) {
    const candidate = obj;
    return Array.isArray(candidate.items);
}
function isFastAndSlowPicks(obj) {
    const candidate = obj;
    return !!candidate.picks && candidate.additionalPicks instanceof Promise;
}
export class PickerQuickAccessProvider extends Disposable {
    constructor(prefix, options) {
        super();
        this.prefix = prefix;
        this.options = options;
    }
    provide(picker, token, runOptions) {
        const disposables = new DisposableStore();
        // Apply options if any
        picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;
        // Disable filtering & sorting, we control the results
        picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;
        // Set initial picks and update on type
        let picksCts = undefined;
        const picksDisposable = disposables.add(new MutableDisposable());
        const updatePickerItems = async () => {
            // Cancel any previous ask for picks and busy
            picksCts?.dispose(true);
            picker.busy = false;
            // Setting the .value will call dispose() on the previous value, so we need to do this AFTER cancelling with dispose(true).
            const picksDisposables = picksDisposable.value = new DisposableStore();
            // Create new cancellation source for this run
            picksCts = picksDisposables.add(new CancellationTokenSource(token));
            // Collect picks and support both long running and short or combined
            const picksToken = picksCts.token;
            let picksFilter = picker.value.substring(this.prefix.length);
            if (!this.options?.shouldSkipTrimPickFilter) {
                picksFilter = picksFilter.trim();
            }
            const providedPicks = this._getPicks(picksFilter, picksDisposables, picksToken, runOptions);
            const applyPicks = (picks, skipEmpty) => {
                let items;
                let activeItem = undefined;
                if (isPicksWithActive(picks)) {
                    items = picks.items;
                    activeItem = picks.active;
                }
                else {
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
                        }
                        else {
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
            const applyFastAndSlowPicks = async (fastAndSlowPicks) => {
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
                            let picks;
                            let activePick = undefined;
                            if (isPicksWithActive(fastAndSlowPicks.picks)) {
                                picks = fastAndSlowPicks.picks.items;
                                activePick = fastAndSlowPicks.picks.active;
                            }
                            else {
                                picks = fastAndSlowPicks.picks;
                            }
                            let additionalPicks;
                            let additionalActivePick = undefined;
                            if (isPicksWithActive(awaitedAdditionalPicks)) {
                                additionalPicks = awaitedAdditionalPicks.items;
                                additionalActivePick = awaitedAdditionalPicks.active;
                            }
                            else {
                                additionalPicks = awaitedAdditionalPicks;
                            }
                            if (additionalPicks.length > 0 || !fastPicksApplied) {
                                // If we do not have any activePick or additionalActivePick
                                // we try to preserve the currently active pick from the
                                // fast results. This fixes an issue where the user might
                                // have made a pick active before the additional results
                                // kick in.
                                // See https://github.com/microsoft/vscode/issues/102480
                                let fallbackActivePick = undefined;
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
                        }
                        finally {
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
                    }
                    else {
                        applyPicks(awaitedPicks);
                    }
                }
                finally {
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
            if (runOptions?.handleAccept) {
                if (!event.inBackground) {
                    picker.hide(); // hide picker unless we accept in background
                }
                runOptions.handleAccept?.(picker.activeItems[0], event.inBackground);
                return;
            }
            const [item] = picker.selectedItems;
            if (typeof item?.accept === 'function') {
                const isAttachAction = isKeyModified(picker.keyMods) && !!item.attach;
                if (isAttachAction) {
                    item.attach(picker.keyMods, event);
                    return;
                }
                if (!event.inBackground) {
                    picker.hide(); // hide picker unless we accept in background
                }
                item.accept(picker.keyMods, event);
            }
        }));
        const buttonTrigger = async (button, item) => {
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
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlja2VyUXVpY2tBY2Nlc3MuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBZSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hILE9BQU8sRUFBMEcsYUFBYSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFaEssT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTNELE1BQU0sQ0FBTixJQUFZLGFBcUJYO0FBckJELFdBQVksYUFBYTtJQUV4Qjs7T0FFRztJQUNILDJEQUFTLENBQUE7SUFFVDs7T0FFRztJQUNILGlFQUFZLENBQUE7SUFFWjs7T0FFRztJQUNILHFFQUFjLENBQUE7SUFFZDs7T0FFRztJQUNILCtEQUFXLENBQUE7QUFDWixDQUFDLEVBckJXLGFBQWEsS0FBYixhQUFhLFFBcUJ4QjtBQThGRCxTQUFTLGlCQUFpQixDQUFJLEdBQVk7SUFDekMsTUFBTSxTQUFTLEdBQUcsR0FBeUIsQ0FBQztJQUU1QyxPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3ZDLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFJLEdBQVk7SUFDMUMsTUFBTSxTQUFTLEdBQUcsR0FBMEIsQ0FBQztJQUU3QyxPQUFPLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLFNBQVMsQ0FBQyxlQUFlLFlBQVksT0FBTyxDQUFDO0FBQzFFLENBQUM7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