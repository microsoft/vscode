/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
export class ExtensionHostDebugBroadcastChannel extends Disposable {
    constructor() {
        super(...arguments);
        this._onCloseEmitter = this._register(new Emitter());
        this._onReloadEmitter = this._register(new Emitter());
        this._onTerminateEmitter = this._register(new Emitter());
        this._onAttachEmitter = this._register(new Emitter());
    }
    static { this.ChannelName = 'extensionhostdebugservice'; }
    call(ctx, command, arg) {
        switch (command) {
            case 'close':
                return Promise.resolve(this._onCloseEmitter.fire({ sessionId: arg[0] }));
            case 'reload':
                return Promise.resolve(this._onReloadEmitter.fire({ sessionId: arg[0] }));
            case 'terminate':
                return Promise.resolve(this._onTerminateEmitter.fire({ sessionId: arg[0] }));
            case 'attach':
                return Promise.resolve(this._onAttachEmitter.fire({ sessionId: arg[0], port: arg[1], subId: arg[2] }));
        }
        throw new Error('Method not implemented.');
    }
    listen(ctx, event, arg) {
        switch (event) {
            case 'close':
                return this._onCloseEmitter.event;
            case 'reload':
                return this._onReloadEmitter.event;
            case 'terminate':
                return this._onTerminateEmitter.event;
            case 'attach':
                return this._onAttachEmitter.event;
        }
        throw new Error('Method not implemented.');
    }
}
export class ExtensionHostDebugChannelClient extends Disposable {
    constructor(channel) {
        super();
        this.channel = channel;
    }
    reload(sessionId) {
        this.channel.call('reload', [sessionId]);
    }
    get onReload() {
        return this.channel.listen('reload');
    }
    close(sessionId) {
        this.channel.call('close', [sessionId]);
    }
    get onClose() {
        return this.channel.listen('close');
    }
    attachSession(sessionId, port, subId) {
        this.channel.call('attach', [sessionId, port, subId]);
    }
    get onAttachSession() {
        return this.channel.listen('attach');
    }
    terminateSession(sessionId, subId) {
        this.channel.call('terminate', [sessionId, subId]);
    }
    get onTerminateSession() {
        return this.channel.listen('terminate');
    }
    openExtensionDevelopmentHostWindow(args, debugRenderer) {
        return this.channel.call('openExtensionDevelopmentHostWindow', [args, debugRenderer]);
    }
    attachToCurrentWindowRenderer(windowId) {
        return this.channel.call('attachToCurrentWindowRenderer', [windowId]);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSG9zdERlYnVnSXBjLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZGVidWcvY29tbW9uL2V4dGVuc2lvbkhvc3REZWJ1Z0lwYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBSS9ELE1BQU0sT0FBTyxrQ0FBNkMsU0FBUSxVQUFVO0lBQTVFOztRQUlrQixvQkFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXNCLENBQUMsQ0FBQztRQUNwRSxxQkFBZ0IsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUF1QixDQUFDLENBQUM7UUFDdEUsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBMEIsQ0FBQyxDQUFDO1FBQzVFLHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXVCLENBQUMsQ0FBQztJQTZCeEYsQ0FBQzthQWxDZ0IsZ0JBQVcsR0FBRywyQkFBMkIsQUFBOUIsQ0FBK0I7SUFPMUQsSUFBSSxDQUFDLEdBQWEsRUFBRSxPQUFlLEVBQUUsR0FBUztRQUM3QyxRQUFRLE9BQU8sRUFBRSxDQUFDO1lBQ2pCLEtBQUssT0FBTztnQkFDWCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzFFLEtBQUssUUFBUTtnQkFDWixPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFD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