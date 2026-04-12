/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { BrowserViewGroupRemoteService } from './browserViewGroupRemoteService.js';
import { PlaywrightService } from './playwrightService.js';
/**
 * IPC channel for the Playwright service.
 *
 * Each connected window gets its own {@link PlaywrightService},
 * keyed by the opaque IPC connection context. The client sends an
 * `__initialize` call with its numeric window ID before any other
 * method calls, which eagerly creates the instance. When a window
 * disconnects the instance is automatically disposed.
 */
export class PlaywrightChannel extends Disposable {
    constructor(ipcServer, mainProcessService, logService) {
        super();
        this.logService = logService;
        this._instances = this._register(new DisposableMap());
        this.browserViewGroupRemoteService = new BrowserViewGroupRemoteService(mainProcessService);
        this._register(ipcServer.onDidRemoveConnection(c => {
            this._instances.deleteAndDispose(c.ctx);
        }));
    }
    listen(ctx, event) {
        const instance = this._instances.get(ctx);
        if (!instance) {
            throw new Error(`Window not initialized for context: ${ctx}`);
        }
        const source = instance[event];
        if (typeof source !== 'function') {
            throw new Error(`Event not found: ${event}`);
        }
        return source;
    }
    call(ctx, command, arg) {
        // Handle the one-time initialization call that creates the instance
        if (command === '__initialize') {
            if (typeof arg !== 'number') {
                throw new Error(`Invalid argument for __initialize: expected window ID as number, got ${typeof arg}`);
            }
            if (!this._instances.has(ctx)) {
                const windowId = arg;
                this._instances.set(ctx, new PlaywrightService(windowId, this.browserViewGroupRemoteService, this.logService));
            }
            return Promise.resolve(undefined);
        }
        const instance = this._instances.get(ctx);
        if (!instance) {
            throw new Error(`Window not initialized for context: ${ctx}`);
        }
        const target = instance[command];
        if (typeof target !== 'function') {
            throw new Error(`Method not found: ${command}`);
        }
        const methodArgs = Array.isArray(arg) ? arg : [];
        let res = target.apply(instance, methodArgs);
        if (!(res instanceof Promise)) {
            res = Promise.resolve(res);
        }
        return res;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxheXdyaWdodENoYW5uZWwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9ub2RlL3BsYXl3cmlnaHRDaGFubmVsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFJOUUsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFFM0Q7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLE9BQU8saUJBQWtCLFNBQVEsVUFBVTtJQUtoRCxZQUNDLFNBQTRCLEVBQzVCLGtCQUF1QyxFQUN0QixVQUF1QjtRQUV4QyxLQUFLLEVBQUUsQ0FBQztRQUZTLGVBQVUsR0FBVixVQUFVLENBQWE7UUFOeEIsZUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxhQUFhLEVBQTZCLENBQUMsQ0FBQztRQVM1RixJQUFJLENBQUMsNkJBQTZCLEdBQUcsSUFBSSw2QkFBNkIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQzNGLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQ2xELElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFJLEdBQVcsRUFBRSxLQUFhO1FBQ25DLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFDLElBQUksQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNmLE1BQU0sSUFBSSxLQUFLLENBQUMsdUNBQXVDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELE1BQU0sTUFBTSxHQUFJLFFBQXNELENBQUMsS0FBSyxDQUFDLENBQUM7UUFDOUUsSUFBSSxPQUFPLE1BQU0sS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUNsQyxNQUFNLElBQUksS0FBSyxDQUFDLG9CQUFvQixLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLENBQUM7UUFDRCxPQUFPLE1BQWtCLENBQUM7SUFDM0IsQ0FBQztJQUVELElBQUksQ0FBSSxHQUFXLEVBQUUsT0FBZSxFQUFFLEdBQWE7UUFDbEQsb0VBQW9FO1FBQ3BFLElBQUksT0FBTyxLQUFLLGNBQWMsRUFBRSxDQUFDO1lBQ2hDLElBQUksT0FBTyxHQUFHLEtBQUssUUFBUSxFQUFFLENBQUM7Z0JBQzdCLE1BQU0sSUFBSSxLQUFLLENBQUMsd0VBQXdFLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQztZQUN2RyxDQUFDO1lBQ0QsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQy9CLE1BQU0sUUFBUSxHQUFHLEdBQWEsQ0FBQztnQkFDL0IsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksaUJBQWlCLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNoSCxDQUFDO1lBQ0QsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLFNBQWMsQ0FBQyxDQUFDO1FBQ3hDLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMxQyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDZixNQUFNLElBQUksS0FBSyxDQUFDLHVDQUF1QyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQy9ELENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBSSxRQUErQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3pFLElBQUksT0FBTyxNQUFNLEtBQUssVUFBVSxFQUFFLENBQUM7WUFDbEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxxQkFBcUIsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNqRCxDQUFDO1FBRUQsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDakQsSUFBSSxHQUFHLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLENBQUMsR0FBRyxZQUFZLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDL0IsR0FBRyxHQUFHLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsQ0FBQztRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztDQUNEIn0=