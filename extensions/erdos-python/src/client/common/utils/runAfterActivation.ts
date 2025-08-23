// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const itemsToRun: (() => void)[] = [];
let activationCompleted = false;

/**
 * Add items to be run after extension activation. This will add item
 * to the end of the list. This function will immediately run the item
 * if extension is already activated.
 */
export function addItemsToRunAfterActivation(run: () => void): void {
    if (activationCompleted) {
        run();
    } else {
        itemsToRun.push(run);
    }
}

/**
 * This should be called after extension activation is complete.
 */
export function runAfterActivation(): void {
    activationCompleted = true;
    while (itemsToRun.length > 0) {
        const run = itemsToRun.shift();
        if (run) {
            run();
        }
    }
}
