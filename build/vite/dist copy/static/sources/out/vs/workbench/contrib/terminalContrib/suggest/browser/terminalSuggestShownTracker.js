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
import { TimeoutTimer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
export const TERMINAL_SUGGEST_DISCOVERABILITY_KEY = 'terminal.suggest.increasedDiscoverability';
export const TERMINAL_SUGGEST_DISCOVERABILITY_COUNT_KEY = 'terminal.suggest.increasedDiscoverabilityCount';
const TERMINAL_SUGGEST_DISCOVERABILITY_MAX_COUNT = 10;
const TERMINAL_SUGGEST_DISCOVERABILITY_MIN_MS = 10000;
let TerminalSuggestShownTracker = class TerminalSuggestShownTracker extends Disposable {
    constructor(_shellType, _storageService, _extensionService) {
        super();
        this._shellType = _shellType;
        this._storageService = _storageService;
        this._extensionService = _extensionService;
        this._firstShownTracker = undefined;
        this._done = this._storageService.getBoolean(TERMINAL_SUGGEST_DISCOVERABILITY_KEY, -1 /* StorageScope.APPLICATION */, false);
        this._count = this._storageService.getNumber(TERMINAL_SUGGEST_DISCOVERABILITY_COUNT_KEY, -1 /* StorageScope.APPLICATION */, 0);
        this._register(this._extensionService.onWillStop(() => this._firstShownTracker = undefined));
    }
    get done() {
        return this._done;
    }
    resetState() {
        this._done = false;
        this._count = 0;
        this._start = undefined;
        this._firstShownTracker = undefined;
    }
    resetTimer() {
        if (this._timeout) {
            this._timeout.cancel();
            this._timeout = undefined;
        }
        this._start = undefined;
    }
    update(widgetElt) {
        if (this._done) {
            return;
        }
        this._count++;
        this._storageService.store(TERMINAL_SUGGEST_DISCOVERABILITY_COUNT_KEY, this._count, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        if (widgetElt && !widgetElt.classList.contains('increased-discoverability')) {
            widgetElt.classList.add('increased-discoverability');
        }
        if (this._count >= TERMINAL_SUGGEST_DISCOVERABILITY_MAX_COUNT) {
            this._setDone(widgetElt);
        }
        else if (!this._start) {
            this.resetTimer();
            this._start = Date.now();
            this._timeout = this._register(new TimeoutTimer(() => {
                this._setDone(widgetElt);
            }, TERMINAL_SUGGEST_DISCOVERABILITY_MIN_MS));
        }
    }
    _setDone(widgetElt) {
        this._done = true;
        this._storageService.store(TERMINAL_SUGGEST_DISCOVERABILITY_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        if (widgetElt) {
            widgetElt.classList.remove('increased-discoverability');
        }
        if (this._timeout) {
            this._timeout.cancel();
            this._timeout = undefined;
        }
        this._start = undefined;
    }
    getFirstShown(shellType) {
        if (!this._firstShownTracker) {
            this._firstShownTracker = {
                window: true,
                shell: new Set([shellType])
            };
            return { window: true, shell: true };
        }
        const isFirstForWindow = this._firstShownTracker.window;
        const isFirstForShell = !this._firstShownTracker.shell.has(shellType);
        if (isFirstForWindow || isFirstForShell) {
            this.updateShown();
        }
        return {
            window: isFirstForWindow,
            shell: isFirstForShell
        };
    }
    updateShown() {
        if (!this._shellType || !this._firstShownTracker) {
            return;
        }
        this._firstShownTracker.window = false;
        this._firstShownTracker.shell.add(this._shellType);
    }
};
TerminalSuggestShownTracker = __decorate([
    __param(1, IStorageService),
    __param(2, IExtensionService)
], TerminalSuggestShownTracker);
export { TerminalSuggestShownTracker };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdWdnZXN0U2hvd25UcmFja2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N1Z2dlc3QvYnJvd3Nlci90ZXJtaW5hbFN1Z2dlc3RTaG93blRyYWNrZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxVQUFVLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBRWpILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBR3pGLE1BQU0sQ0FBQyxNQUFNLG9DQUFvQyxHQUFHLDJDQUEyQyxDQUFDO0FBQ2hHLE1BQU0sQ0FBQyxNQUFNLDBDQUEwQyxHQUFHLGdEQUFnRCxDQUFDO0FBQzNHLE1BQU0sMENBQTBDLEdBQUcsRUFBRSxDQUFDO0FBQ3RELE1BQU0sdUNBQXVDLEdBQUcsS0FBSyxDQUFDO0FBUS9DLElBQU0sMkJBQTJCLEdBQWpDLE1BQU0sMkJBQTRCLFNBQVEsVUFBVTtJQVExRCxZQUNrQixVQUF5QyxFQUN6QyxlQUFpRCxFQUMvQyxpQkFBcUQ7UUFHeEUsS0FBSyxFQUFFLENBQUM7UUFMUyxlQUFVLEdBQVYsVUFBVSxDQUErQjtRQUN4QixvQkFBZSxHQUFmLGVBQWUsQ0FBaUI7UUFDOUIsc0JBQWlCLEdBQWpCLGlCQUFpQixDQUFtQjtRQUxqRSx1QkFBa0IsR0FBK0UsU0FBUyxDQUFDO1FBU2xILElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsb0NBQW9DLHFDQUE0QixLQUFLLENBQUMsQ0FBQztRQUNwSCxJ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