/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { webContents } from 'electron';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { WebviewProtocolProvider } from './webviewProtocolProvider.js';
import { IWindowsMainService } from '../../windows/electron-main/windows.js';
import { IFileService } from '../../files/common/files.js';
let WebviewMainService = class WebviewMainService extends Disposable {
    constructor(fileService, windowsMainService) {
        super();
        this.windowsMainService = windowsMainService;
        this._onFoundInFrame = this._register(new Emitter());
        this.onFoundInFrame = this._onFoundInFrame.event;
        this._register(new WebviewProtocolProvider(fileService));
    }
    async setIgnoreMenuShortcuts(id, enabled) {
        let contents;
        if (typeof id.windowId === 'number') {
            const { windowId } = id;
            const window = this.windowsMainService.getWindowById(windowId);
            if (!window?.win) {
                throw new Error(`Invalid windowId: ${windowId}`);
            }
            contents = window.win.webContents;
        }
        else {
            const { webContentsId } = id;
            contents = webContents.fromId(webContentsId);
            if (!contents) {
                throw new Error(`Invalid webContentsId: ${webContentsId}`);
            }
        }
        if (!contents.isDestroyed()) {
            contents.setIgnoreMenuShortcuts(enabled);
        }
    }
    async findInFrame(windowId, frameName, text, options) {
        const initialFrame = this.getFrameByName(windowId, frameName);
        const frame = initialFrame;
        if (typeof frame.findInFrame === 'function') {
            frame.findInFrame(text, {
                findNext: options.findNext,
                forward: options.forward,
            });
            const foundInFrameHandler = (_, result) => {
                if (result.finalUpdate) {
                    this._onFoundInFrame.fire(result);
                    frame.removeListener('found-in-frame', foundInFrameHandler);
                }
            };
            frame.on('found-in-frame', foundInFrameHandler);
        }
    }
    async stopFindInFrame(windowId, frameName, options) {
        const initialFrame = this.getFrameByName(windowId, frameName);
        const frame = initialFrame;
        if (typeof frame.stopFindInFrame === 'function') {
            frame.stopFindInFrame(options.keepSelection ? 'keepSelection' : 'clearSelection');
        }
    }
    getFrameByName(windowId, frameName) {
        const window = this.windowsMainService.getWindowById(windowId.windowId);
        if (!window?.win) {
            throw new Error(`Invalid windowId: ${windowId}`);
        }
        const frame = window.win.webContents.mainFrame.framesInSubtree.find(frame => {
            return frame.name === frameName;
        });
        if (!frame) {
            throw new Error(`Unknown frame: ${frameName}`);
        }
        return frame;
    }
};
WebviewMainService = __decorate([
    __param(0, IFileService),
    __param(1, IWindowsMainService)
], WebviewMainService);
export { WebviewMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld01haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vd2Vidmlldy9lbGVjdHJvbi1tYWluL3dlYnZpZXdNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQWUsV0FBVyxFQUFnQixNQUFNLFVBQVUsQ0FBQztBQUNsRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRS9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUVwRCxJQUFNLGtCQUFrQixHQUF4QixNQUFNLGtCQUFtQixTQUFRLFVBQVU7SUFPakQsWUFDZSxXQUF5QixFQUNsQixrQkFBd0Q7UUFFN0UsS0FBSyxFQUFFLENBQUM7UUFGOEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUw3RCxvQkFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXNCLENBQUMsQ0FBQztRQUNyRSxtQkFBYyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDO1FBTzNELElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0lBQzFELENBQUM7SUFFTSxLQUFLLENBQUMsc0JBQXNCLENBQUMsRUFBMEMsRUFBRSxPQUFnQjtRQUMvRixJQUFJLFFBQWlDLENBQUM7UUFFdEMsSUFBSSxPQUFRLEVBQXNCLENBQUMsUUFBUSxLQUFLLFFBQVEsRUFB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