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
var TerminalVoiceSession_1;
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { isNumber } from '../../../../../base/common/types.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SpeechTimeoutDefault } from '../../../accessibility/browser/accessibilityConfiguration.js';
import { ISpeechService, SpeechToTextStatus } from '../../../speech/common/speechService.js';
import { alert } from '../../../../../base/browser/ui/aria/aria.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
const symbolMap = {
    'Ampersand': '&',
    'ampersand': '&',
    'Dollar': '$',
    'dollar': '$',
    'Percent': '%',
    'percent': '%',
    'Asterisk': '*',
    'asterisk': '*',
    'Plus': '+',
    'plus': '+',
    'Equals': '=',
    'equals': '=',
    'Exclamation': '!',
    'exclamation': '!',
    'Slash': '/',
    'slash': '/',
    'Backslash': '\\',
    'backslash': '\\',
    'Dot': '.',
    'dot': '.',
    'Period': '.',
    'period': '.',
    'Quote': '\'',
    'quote': '\'',
    'double quote': '"',
    'Double quote': '"',
};
let TerminalVoiceSession = class TerminalVoiceSession extends Disposable {
    static { TerminalVoiceSession_1 = this; }
    static { this._instance = undefined; }
    static getInstance(instantiationService) {
        if (!TerminalVoiceSession_1._instance) {
            TerminalVoiceSession_1._instance = instantiationService.createInstance(TerminalVoiceSession_1);
        }
        return TerminalVoiceSession_1._instance;
    }
    constructor(_speechService, _terminalService, _configurationService, contextKeyService) {
        super();
        this._speechService = _speechService;
        this._terminalService = _terminalService;
        this._configurationService = _configurationService;
        this._input = '';
        this._register(this._terminalService.onDidChangeActiveInstance(() => this.stop()));
        this._register(this._terminalService.onDidDisposeInstance(() => this.stop()));
        this._disposables = this._register(new DisposableStore());
        this._terminalDictationInProgress = TerminalContextKeys.terminalDictationInProgress.bindTo(contextKeyService);
    }
    async start() {
        this.stop();
        let voiceTimeout = this._configurationService.getValue("accessibility.voice.speechTimeout" /* AccessibilityVoiceSettingId.SpeechTimeout */);
        if (!isNumber(voiceTimeout) || voiceTimeout < 0) {
            voiceTimeout = SpeechTimeoutDefault;
        }
        this._acceptTranscriptionScheduler = this._disposables.add(new RunOnceScheduler(() => {
            this._sendText();
            this.stop();
        }, voiceTimeout));
        this._cancellationTokenSource = new CancellationTokenSource();
        this._register(toDisposable(() => this._cancellationTokenSource?.dispose(true)));
        const session = await this._speechService.createSpeechToTextSession(this._cancellationTokenSource?.token, 'terminal');
        this._disposables.add(session.onDidChange((e) => {
            if (this._cancellationTokenSource?.token.isCancellationRequested) {
                return;
            }
            switch (e.status) {
                case SpeechToTextStatus.Started:
                    this._terminalDictationInProgress.set(true);
                    if (!this._decoration) {
                        this._createDecoration();
                    }
                    break;
                case SpeechToTextStatus.Recognizing: {
                    this._updateInput(e);
                    this._renderGhostText(e);
                    this._updateDecoration();
                    if (voiceTimeout > 0) {
                        this._acceptTranscriptionScheduler.cancel();
                    }
                    break;
                }
                case SpeechToTextStatus.Recognized:
                    this._updateInput(e);
                    // Send text immediately like editor dictation
                    this._sendText();
                    // Clear ghost text and input for next recognition
                    this._ghostText?.dispose();
                    this._ghostText = undefined;
                    this._ghostTextMarker?.dispose();
                    this._ghostTextMarker = undefined;
                    // Update decoration position for next recognition
                    this._updateDecoration();
                    this._input = '';
                    break;
                case SpeechToTextStatus.Stopped:
                    this.stop();
                    break;
            }
        }));
    }
    stop(send) {
        this._setInactive();
        if (send) {
            this._acceptTranscriptionScheduler.cancel();
            this._sendText();
        }
        this._ghostText = undefined;
        this._decoration?.dispose();
        this._decoration = undefined;
        this._marker?.dispose();
        this._marker = undefined;
        this._ghostTextMarker = undefined;
        this._cancellationTokenSource?.cancel();
        this._disposables.clear();
        this._input = '';
        this._terminalDictationInProgress.reset();
    }
    _sendText() {
        this._terminalService.activeInstance?.sendText(this._input, false);
        alert(localize('terminalVoiceTextInserted', '{0} inserted', this._input));
    }
    _updateInput(e) {
        if (e.text) {
            let input = e.text.replaceAll(/[.,?;!]/g, '');
            for (const symbol of Object.entries(symbolMap)) {
                input = input.replace(new RegExp('\\b' + symbol[0] + '\\b'), symbol[1]);
            }
            this._input = ' ' + input;
        }
    }
    _createDecoration() {
        const activeInstance = this._terminalService.activeInstance;
        const xterm = activeInstance?.xterm?.raw;
        if (!xterm) {
            return;
        }
        const onFirstLine = xterm.buffer.active.cursorY === 0;
        // Calculate x position based on current cursor position and input length
        const inputLength = this._input.length;
        const xPosition = xterm.buffer.active.cursorX + inputLength;
        this._marker = activeInstance.registerMarker(onFirstLine ? 0 : -1);
        if (!this._marker) {
            return;
        }
        this._decoration = xterm.registerDecoration({
            marker: this._marker,
            layer: 'top',
            x: xPosition,
        });
        if (!this._decoration) {
            this._marker.dispose();
            this._marker = undefined;
            return;
        }
        this._decoration.onRender((e) => {
            e.classList.add(...ThemeIcon.asClassNameArray(Codicon.micFilled), 'terminal-voice', 'recording');
            e.style.transform = onFirstLine ? 'translate(10px, -2px)' : 'translate(-6px, -5px)';
        });
    }
    _updateDecoration() {
        // Dispose the old decoration and recreate it at the new position
        this._decoration?.dispose();
        this._marker?.dispose();
        this._decoration = undefined;
        this._marker = undefined;
        this._createDecoration();
    }
    _setInactive() {
        this._decoration?.element?.classList.remove('recording');
    }
    _renderGhostText(e) {
        this._ghostText?.dispose();
        const text = e.text;
        if (!text) {
            return;
        }
        const activeInstance = this._terminalService.activeInstance;
        const xterm = activeInstance?.xterm?.raw;
        if (!xterm) {
            return;
        }
        this._ghostTextMarker = activeInstance.registerMarker();
        if (!this._ghostTextMarker) {
            return;
        }
        this._disposables.add(this._ghostTextMarker);
        const onFirstLine = xterm.buffer.active.cursorY === 0;
        this._ghostText = xterm.registerDecoration({
            marker: this._ghostTextMarker,
            layer: 'top',
            x: onFirstLine ? xterm.buffer.active.cursorX + 4 : xterm.buffer.active.cursorX + 1,
        });
        if (this._ghostText) {
            this._disposables.add(this._ghostText);
        }
        this._ghostText?.onRender((e) => {
            e.classList.add('terminal-voice-progress-text');
            e.textContent = text;
            e.style.width = (xterm.cols - xterm.buffer.active.cursorX) / xterm.cols * 100 + '%';
        });
    }
};
TerminalVoiceSession = TerminalVoiceSession_1 = __decorate([
    __param(0, ISpeechService),
    __param(1, ITerminalService),
    __param(2, IConfigurationService),
    __param(3, IContextKeyService)
], TerminalVoiceSession);
export { TerminalVoiceSession };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxWb2ljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi92b2ljZS9icm93c2VyL3Rlcm1pbmFsVm9pY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUxRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSw4REFBOEQsQ0FBQztBQUNwRyxPQUFPLEVBQUUsY0FBYyxFQUFtRCxrQkFBa0IsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTlJLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUdyRixNQUFNLFNBQVMsR0FBOEI7SUFDNUMs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