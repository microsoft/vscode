"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Visibility = void 0;
var Visibility;
(function (Visibility) {
    Visibility["VISIBLE"] = "visible";
    // Can happen in several cases:
    // 1. We've just inserted text
    // 2. User has backspaced to new token
    // 3. A large buffer change (scrolling through history, or pasting text)
    // 4. An error occurs
    Visibility["HIDDEN_UNTIL_KEYPRESS"] = "hidden_until_keypress";
    // Hide until explicitly shown (or we enter a new line), can happen when:
    // 1. The escape key is pressed
    // 2. A keybinding to hide autocomplete is pressed
    // 3. User enters a new token with onlyShowOnTab set
    Visibility["HIDDEN_UNTIL_SHOWN"] = "hidden_until_shown";
    // User inserted full suggestion. Wait until text is rendered, then hide
    // until keypress (2 state updates).
    Visibility["HIDDEN_BY_INSERTION"] = "insertion";
})(Visibility || (exports.Visibility = Visibility = {}));
//# sourceMappingURL=types.js.map