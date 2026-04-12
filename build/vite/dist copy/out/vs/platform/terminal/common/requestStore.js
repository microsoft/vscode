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
import { timeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, dispose, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
/**
 * A helper class to track requests that have replies. Using this it's easy to implement an event
 * that accepts a reply.
 */
let RequestStore = class RequestStore extends Disposable {
    /**
     * @param timeout How long in ms to allow requests to go unanswered for, undefined will use the
     * default (15 seconds).
     */
    constructor(timeout, _logService) {
        super();
        this._logService = _logService;
        this._lastRequestId = 0;
        this._pendingRequests = new Map();
        this._pendingRequestDisposables = new Map();
        this._onCreateRequest = this._register(new Emitter());
        this.onCreateRequest = this._onCreateRequest.event;
        this._timeout = timeout === undefined ? 15000 : timeout;
        this._register(toDisposable(() => {
            for (const d of this._pendingRequestDisposables.values()) {
                dispose(d);
            }
        }));
    }
    /**
     * Creates a request.
     * @param args The arguments to pass to the onCreateRequest event.
     */
    createRequest(args) {
        return new Promise((resolve, reject) => {
            const requestId = ++this._lastRequestId;
            this._pendingRequests.set(requestId, resolve);
            this._onCreateRequest.fire({ requestId, ...args });
            const tokenSource = new CancellationTokenSource();
            timeout(this._timeout, tokenSource.token).then(() => reject(`Request ${requestId} timed out (${this._timeout}ms)`));
            this._pendingRequestDisposables.set(requestId, [toDisposable(() => tokenSource.cancel())]);
        });
    }
    /**
     * Accept a reply to a request.
     * @param requestId The request ID originating from the onCreateRequest event.
     * @param data The reply data.
     */
    acceptReply(requestId, data) {
        const resolveRequest = this._pendingRequests.get(requestId);
        if (resolveRequest) {
            this._pendingRequests.delete(requestId);
            dispose(this._pendingRequestDisposables.get(requestId) || []);
            this._pendingRequestDisposables.delete(requestId);
            resolveRequest(data);
        }
        else {
            this._logService.warn(`RequestStore#acceptReply was called without receiving a matching request ${requestId}`);
        }
    }
};
RequestStore = __decorate([
    __param(1, ILogService)
], RequestStore);
export { RequestStore };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVxdWVzdFN0b3JlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3JlcXVlc3RTdG9yZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDeEQsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUV0RDs7O0dBR0c7QUFDSSxJQUFNLFlBQVksR0FBbEIsTUFBTSxZQUE2QixTQUFRLFVBQVU7SUFTM0Q7OztPQUdHO0lBQ0gsWUFDQyxPQUEyQixFQUNkLFdBQXlDO1FBRXRELEtBQUssRUFBRSxDQUFDO1FBRnNCLGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBZC9DLG1CQUFjLEdBQUcsQ0FBQyxDQUFDO1FBRW5CLHFCQUFnQixHQUF1QyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ2pFLCtCQUEwQixHQUErQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBRTFELHFCQUFnQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQXVDLENBQUMsQ0FBQztRQUM5RixvQkFBZSxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUM7UUFXdEQsSUFBSSxDQUFDLFFBQVEsR0FBRyxPQUFPLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUN4RCxJQUFJLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDaEMsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLENBQUMsMEJBQTBCLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQztnQkFDMUQsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1osQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQ7OztPQUdHO0lBQ0gsYUFBYSxDQUFDLElBQWlCO1FBQzlCLE9BQU8sSUFBSSxPQUFPLENBQUksQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7WUFDekMsTUFBTSxTQUFTLEdBQUcsRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDO1lBQ3hDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxTQUFTLEVBQUUsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ25ELE1BQU0sV0FBVyxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztZQUNsRCxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLFNBQVMsZUFBZSxJQUFJLENBQUMsUUFBUSxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3BILElBQUksQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1RixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsV0FBVyxDQUFDLFNBQWlCLEVBQUUsSUFBTztRQUNyQyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQzVELElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEIsSUFBSSxDQUFDLGdCQUFnQixDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN4QyxPQUFPLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUM5RCxJQUFJLENBQUMsMEJBQTBCLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2xELGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0QixDQUFDO2FBQU0sQ0FBQztZQUNQLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDRFQUE0RSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQ2hILENBQUM7SUFDRixDQUFDO0NBQ0QsQ0FBQTtBQXpEWSxZQUFZO0lBZXRCLFdBQUEsV0FBVyxDQUFBO0dBZkQsWUFBWSxDQXlEeEIifQ==