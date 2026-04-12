/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
export class TerminalLinkProviderService {
    constructor() {
        this._linkProviders = new Set();
        this._onDidAddLinkProvider = new Emitter();
        this._onDidRemoveLinkProvider = new Emitter();
    }
    get linkProviders() { return this._linkProviders; }
    get onDidAddLinkProvider() { return this._onDidAddLinkProvider.event; }
    get onDidRemoveLinkProvider() { return this._onDidRemoveLinkProvider.event; }
    registerLinkProvider(linkProvider) {
        const disposables = [];
        this._linkProviders.add(linkProvider);
        this._onDidAddLinkProvider.fire(linkProvider);
        return {
            dispose: () => {
                for (const disposable of disposables) {
                    disposable.dispose();
                }
                this._linkProviders.delete(linkProvider);
                this._onDidRemoveLinkProvider.fire(linkProvider);
            }
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxMaW5rUHJvdmlkZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2xpbmtzL2Jyb3dzZXIvdGVybWluYWxMaW5rUHJvdmlkZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUdyRSxNQUFNLE9BQU8sMkJBQTJCO0lBQXhDO1FBR1MsbUJBQWMsR0FBRyxJQUFJLEdBQUcsRUFBaUMsQ0FBQztRQUdqRCwwQkFBcUIsR0FBRyxJQUFJLE9BQU8sRUFBaUMsQ0FBQztRQUVyRSw2QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBaUMsQ0FBQztJQWlCMUYsQ0FBQztJQXJCQSxJQUFJLGFBQWEsS0FBaUQsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQztJQUcvRixJQUFJLG9CQUFvQixLQUEyQyxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRTdHLElBQUksdUJBQXVCLEtBQTJDLE9BQU8sSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFbkgsb0JBQW9CLENBQUMsWUFBMkM7UUFDL0QsTUFBTSxXQUFXLEdBQWtCLEVBQUUsQ0FBQztRQUN0QyxJQUFJLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzlDLE9BQU87WUFDTixPQUFPLEVBQUUsR0FBRyxFQUFFO2dCQUNiLEtBQUssTUFBTSxVQUFVLElBQUksV0FBVyxFQUFFLENBQUM7b0JBQ3RDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDdEIsQ0FBQztnQkFDRCxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQztnQkFDekMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNsRCxDQUFDO1NBQ0QsQ0FBQztJQUNILENBQUM7Q0FDRCJ9