"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* eslint-disable no-restricted-globals */
/**
 * Preload script for pages loaded in Integrated Browser
 *
 * It runs in an isolated context that Electron calls an "isolated world".
 * Specifically the isolated world with worldId 999, which shows in DevTools as "Electron Isolated Context".
 * Despite being isolated, it still runs on the same page as the JS from the actual loaded website
 * which runs on the so-called "main world" (worldId 0. In DevTools as "top").
 *
 * Learn more: see Electron docs for Security, contextBridge, and Context Isolation.
 */
(function () {
    const { contextBridge, ipcRenderer } = require('electron');
    // #######################################################################
    // ###                                                                 ###
    // ###       !!! DO NOT USE GET/SET PROPERTIES ANYWHERE HERE !!!       ###
    // ###       !!!  UNLESS THE ACCESS IS WITHOUT SIDE EFFECTS  !!!       ###
    // ###       (https://github.com/electron/electron/issues/25516)       ###
    // ###                                                                 ###
    // #######################################################################
    // Ctrl/Cmd keybindings that correspond to native editing shortcuts and should be handled by the browser / OS and not forwarded to the workbench.
    const nativeCtrlCmdKeybindings = {
        mac: {
            always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'backspace', 'delete']),
            noShift: new Set(['a', 'c', 'v', 'x', 'z']),
            withShift: new Set(['v', 'z']),
        },
        nonMac: {
            always: new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'home', 'end', 'backspace', 'delete']),
            noShift: new Set(['a', 'c', 'v', 'x', 'z', 'y']),
            withShift: new Set(['v', 'z']),
        }
    };
    // Listen for keydown events that the page did not handle and forward them for shortcut handling.
    window.addEventListener('keydown', (event) => {
        // Require that the event is trusted -- i.e. user-initiated.
        // eslint-disable-next-line no-restricted-syntax
        if (!(event instanceof KeyboardEvent) || !event.isTrusted) {
            return;
        }
        // If the event was already handled by the page, do not forward it.
        if (event.defaultPrevented) {
            return;
        }
        const isNonEditingKey = event.key === 'Escape' ||
            /^F\d+$/.test(event.key) ||
            event.key.startsWith('Audio') || event.key.startsWith('Media') || event.key.startsWith('Browser');
        // Only forward if there's a command modifier or it's a non-editing key
        // (most plain key events should just be handled natively by the browser and not forwarded)
        if (!(event.ctrlKey || event.altKey || event.metaKey) && !isNonEditingKey) {
            return;
        }
        // Never handle plain modifier key presses as keybindings
        if (event.key === 'Control' || event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta') {
            return;
        }
        const isMac = navigator.platform.indexOf('Mac') >= 0;
        // Alt+Key special character handling (Alt + Numpad keys on Windows/Linux, Alt + any key on Mac)
        if (event.altKey && !event.ctrlKey && !event.metaKey) {
            if (isMac || /^Numpad\d+$/.test(event.code)) {
                return;
            }
        }
        // Allow native shortcuts to be handled by the browser
        const ctrlCmd = isMac ? event.metaKey : event.ctrlKey;
        if (ctrlCmd && !event.altKey) {
            const key = event.key.toLowerCase();
            const keySetsToCheck = [
                nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'].always,
                nativeCtrlCmdKeybindings[isMac ? 'mac' : 'nonMac'][event.shiftKey ? 'withShift' : 'noShift'],
            ];
            if (keySetsToCheck.some(set => set.has(key))) {
                return;
            }
            // Emoji picker on Mac
            if (isMac && event.ctrlKey && !event.shiftKey && key === ' ') {
                return;
            }
        }
        // Everything else should be forwarded to the workbench for potential shortcut handling.
        event.preventDefault();
        event.stopPropagation();
        ipcRenderer.send('vscode:browserView:keydown', {
            key: event.key,
            keyCode: event.keyCode,
            code: event.code,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            metaKey: event.metaKey,
            repeat: event.repeat
        });
    });
    const globals = {
        /**
         * Get the currently selected text in the page.
         */
        getSelectedText() {
            try {
                // Even if the page has overridden window.getSelection, our call here will still reach the original
                // implementation. That's because Electron proxies functions, such as getSelectedText here, that are
                // exposed to a different context via exposeInIsolatedWorld or exposeInMainWorld.
                return window.getSelection()?.toString() ?? '';
            }
            catch {
                return '';
            }
        }
    };
    try {
        // Use `contextBridge` APIs to expose globals to the same isolated world where this preload script runs (worldId 999).
        // The globals object will be recursively frozen (and for functions also proxied) by Electron to prevent
        // modification within the given context.
        contextBridge.exposeInIsolatedWorld(999, 'browserViewAPI', globals);
    }
    catch (error) {
        console.error(error);
    }
}());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlbG9hZC1icm93c2VyVmlldy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvcHJlbG9hZC1icm93c2VyVmlldy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7QUFFaEcsMENBQTBDO0FBRTFDOzs7Ozs7Ozs7R0FTRztBQUNILENBQUM7SUFFQSxNQUFNLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUUzRCwwRUFBMEU7SUFDMUUsMEVBQTBFO0lBQzFFLDBFQUEwRTtJQUMxRSwwRUFBMEU7SUFDMUUsMEVBQTBFO0lBQzFFLDBFQUEwRTtJQUMxRSwwRUFBMEU7SUFFMUUsaUpBQWlKO0lBQ2pKLE1BQU0sd0JBQXdCLEdBQUc7UUFDaEMsR0FBRyxFQUFFO1lBQ0osTUFBTSxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLFdBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztZQUMzRixPQUFPLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDM0MsU0FBUyxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1NBQzlCO1FBQ0QsTUFBTSxFQUFFO1lBQ1AsTUFBTSxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzFHLE9BQU8sRUFBRSxJQUFJLEdBQUcsQ0FBQyxDQUFDLEdBQUcs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