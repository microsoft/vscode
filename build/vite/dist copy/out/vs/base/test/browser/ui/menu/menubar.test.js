/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { $, ModifierKeyEmitter } from '../../../../browser/dom.js';
import { unthemedMenuStyles } from '../../../../browser/ui/menu/menu.js';
import { MenuBar } from '../../../../browser/ui/menu/menubar.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';
function getButtonElementByAriaLabel(menubarElement, ariaLabel) {
    let i;
    for (i = 0; i < menubarElement.childElementCount; i++) {
        if (menubarElement.children[i].getAttribute('aria-label') === ariaLabel) {
            return menubarElement.children[i];
        }
    }
    return null;
}
function getTitleDivFromButtonDiv(menuButtonElement) {
    let i;
    for (i = 0; i < menuButtonElement.childElementCount; i++) {
        if (menuButtonElement.children[i].classList.contains('menubar-menu-title')) {
            return menuButtonElement.children[i];
        }
    }
    return null;
}
function getMnemonicFromTitleDiv(menuTitleDiv) {
    let i;
    for (i = 0; i < menuTitleDiv.childElementCount; i++) {
        if (menuTitleDiv.children[i].tagName.toLocaleLowerCase() === 'mnemonic') {
            return menuTitleDiv.children[i].textContent;
        }
    }
    return null;
}
function validateMenuBarItem(menubar, menubarContainer, label, readableLabel, mnemonic) {
    menubar.push([
        {
            actions: [],
            label: label
        }
    ]);
    const buttonElement = getButtonElementByAriaLabel(menubarContainer, readableLabel);
    assert(buttonElement !== null, `Button element not found for ${readableLabel} button.`);
    const titleDiv = getTitleDivFromButtonDiv(buttonElement);
    assert(titleDiv !== null, `Title div not found for ${readableLabel} button.`);
    const mnem = getMnemonicFromTitleDiv(titleDiv);
    assert.strictEqual(mnem, mnemonic, 'Mnemonic not correct');
}
suite('Menubar', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const container = $('.container');
    const withMenuMenubar = (callback) => {
        const menubar = new MenuBar(container, {
            enableMnemonics: true,
            visibility: 'visible'
        }, unthemedMenuStyles);
        callback(menubar);
        menubar.dispose();
        ModifierKeyEmitter.disposeInstance();
    };
    test('English File menu renders mnemonics', function () {
        withMenuMenubar(menubar => {
            validateMenuBarItem(menubar, container, '&File', 'File', 'F');
        });
    });
    test('Russian File menu renders mnemonics', function () {
        withMenuMenubar(menubar => {
            validateMenuBarItem(menubar, container, '&Файл', 'Файл', 'Ф');
        });
    });
    test('Chinese File menu renders mnemonics', function () {
        withMenuMenubar(menubar => {
            validateMenuBarItem(menubar, container, '文件(&F)', '文件', 'F');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVudWJhci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS90ZXN0L2Jyb3dzZXIvdWkvbWVudS9tZW51YmFyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxDQUFDLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNuRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDakUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFbkYsU0FBUywyQkFBMkIsQ0FBQyxjQUEyQixFQUFFLFNBQWlCO0lBQ2xGLElBQUksQ0FBQyxDQUFDO0lBQ04sS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxjQUFjLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUV2RCxJQUFJLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLFNBQVMsRUFBRSxDQUFDO1lBQ3pFLE9BQU8sY0FBYyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQWdCLENBQUM7UUFDbEQsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNiLENBQUM7QUFFRCxTQUFTLHdCQUF3QixDQUFDLGlCQUE4QjtJQUMvRCxJQUFJLENBQUMsQ0FBQztJQUNOLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsaUJBQWlCLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUMxRCxJQUFJLGlCQUFpQixDQUFDLFFBQVEsQ0FB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