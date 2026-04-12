/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
export const IExtHostMeteredConnection = createDecorator('IExtHostMeteredConnection');
export class ExtHostMeteredConnection extends Disposable {
    constructor() {
        super();
        this._isConnectionMetered = false;
        this._onDidChangeIsConnectionMetered = this._register(new Emitter());
        this.onDidChangeIsConnectionMetered = this._onDidChangeIsConnectionMetered.event;
    }
    get isConnectionMetered() {
        return this._isConnectionMetered;
    }
    $initializeIsConnectionMetered(isMetered) {
        this._isConnectionMetered = isMetered;
    }
    $onDidChangeIsConnectionMetered(isMetered) {
        if (this._isConnectionMetered !== isMetered) {
            this._isConnectionMetered = isMetered;
            this._onDidChangeIsConnectionMetered.fire(isMetered);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdE1ldGVyZWRDb25uZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBUzFGLE1BQU0sQ0FBQyxNQUFNLHlCQUF5QixHQUFHLGVBQWUsQ0FBNEIsMkJBQTJCLENBQUMsQ0FBQztBQUVqSCxNQUFNLE9BQU8sd0JBQXlCLFNBQVEsVUFBVTtJQVN2RDtRQUNDLEtBQUssRUFBRSxDQUFDO1FBTkQseUJBQW9CLEdBQVksS0FBSyxDQUFDO1FBRTdCLG9DQUErQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVcsQ0FBQyxDQUFDO1FBQ2pGLG1DQUE4QixHQUFtQixJQUFJLENBQUMsK0JBQStCLENBQUMsS0FBSyxDQUFDO0lBSXJHLENBQUM7SUFFRCxJQUFJLG1CQUFtQjtRQUN0QixPQUFPLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztJQUNsQyxDQUFDO0lBRUQsOEJBQThCLENBQUMsU0FBa0I7UUFDaEQsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQztJQUN2QyxDQUFDO0lBRUQsK0JBQStCLENBQUMsU0FBa0I7UUFDakQsSUFBSSxJQUFJLENBQUMsb0JBQW9CLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDN0MsSUFBSSxDQUFDLG9CQUFvQixHQUFHLFNBQVMsQ0FBQztZQUN0QyxJQUFJLENBQUMsK0JBQStCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3RELENBQUM7SUFDRixDQUFDO0NBQ0QifQ==