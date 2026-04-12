/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DeferredPromise } from '../../base/common/async.js';
import { Emitter } from '../../base/common/event.js';
import { Disposable } from '../../base/common/lifecycle.js';
export class DialogsModel extends Disposable {
    constructor() {
        super(...arguments);
        this.dialogs = [];
        this._onWillShowDialog = this._register(new Emitter());
        this.onWillShowDialog = this._onWillShowDialog.event;
        this._onDidShowDialog = this._register(new Emitter());
        this.onDidShowDialog = this._onDidShowDialog.event;
    }
    show(dialog) {
        const promise = new DeferredPromise();
        const item = {
            args: dialog,
            close: result => {
                this.dialogs.splice(0, 1);
                if (result instanceof Error) {
                    promise.error(result);
                }
                else {
                    promise.complete(result);
                }
                this._onDidShowDialog.fire();
            }
        };
        this.dialogs.push(item);
        this._onWillShowDialog.fire();
        return {
            item,
            result: promise.p
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGlhbG9ncy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb21tb24vZGlhbG9ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDN0QsT0FBTyxFQUFTLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzVELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQXdCNUQsTUFBTSxPQUFPLFlBQWEsU0FBUSxVQUFVO0lBQTVDOztRQUVVLFlBQU8sR0FBc0IsRUFBRSxDQUFDO1FBRXhCLHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ2hFLHFCQUFnQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFFeEMscUJBQWdCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDL0Qsb0JBQWUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO0lBMEJ4RCxDQUFDO0lBeEJBLElBQUksQ0FBQyxNQUFtQjtRQUN2QixNQUFNLE9BQU8sR0FBRyxJQUFJLGVBQWUsRUFBNkIsQ0FBQztRQUVqRSxNQUFNLElBQUksR0FBb0I7WUFDN0IsSUFBSSxFQUFFLE1BQU07WUFDWixLQUFLLEVBQUUsTUFBTSxDQUFDLEVBQUU7Z0JBQ2YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMxQixJQUFJLE1BQU0sWUFBWSxLQUFLLEVBQUUsQ0FBQztvQkFDN0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDdkIsQ0FBQztxQkFBTSxDQUFDO29CQUNQLE9BQU8sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQzFCLENBQUM7Z0JBQ0QsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQzlCLENBQUM7U0FDRCxDQUFDO1FBRUYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEIsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBRTlCLE9BQU87WUFDTixJQUFJO1lBQ0osTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1NBQ2pCLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==