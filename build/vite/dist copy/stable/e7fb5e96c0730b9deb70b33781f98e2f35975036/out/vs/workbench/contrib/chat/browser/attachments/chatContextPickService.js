/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { derived, ObservablePromise } from '../../../../../base/common/observable.js';
import { compare } from '../../../../../base/common/strings.js';
import { isObject } from '../../../../../base/common/types.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export function isChatContextPickerPickItem(item) {
    return isObject(item) && typeof item.asAttachment === 'function';
}
/**
 * Helper for use in {@IChatContextPickerItem} that wraps a simple query->promise
 * function into the requisite observable.
 */
export function picksWithPromiseFn(fn) {
    return (query, token) => {
        const promise = derived(reader => {
            const queryValue = query.read(reader);
            const cts = new CancellationTokenSource(token);
            reader.store.add(toDisposable(() => cts.dispose(true)));
            return new ObservablePromise(fn(queryValue, cts.token));
        });
        return promise.map((value, reader) => {
            const result = value.promiseResult.read(reader);
            return { picks: result?.data || [], busy: result === undefined };
        });
    };
}
export const IChatContextPickService = createDecorator('IContextPickService');
export class ChatContextPickService {
    constructor() {
        this._picks = [];
        this.items = this._picks;
    }
    registerChatContextItem(pick) {
        this._picks.push(pick);
        this._picks.sort((a, b) => {
            const valueA = a.ordinal ?? 0;
            const valueB = b.ordinal ?? 0;
            if (valueA === valueB) {
                return compare(a.label, b.label);
            }
            else if (valueA < valueB) {
                return 1;
            }
            else {
                return -1;
            }
        });
        return toDisposable(() => {
            const index = this._picks.indexOf(pick);
            if (index >= 0) {
                this._picks.splice(index, 1);
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0Q29udGV4dFBpY2tTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sRUFBcUIsdUJBQXVCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN4RyxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLE9BQU8sRUFBZSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBa0JoRyxNQUFNLFVBQVUsMkJBQTJCLENBQUMsSUFBYTtJQUN4RCxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxPQUFRLElBQW1DLENBQUMsWUFBWSxLQUFLLFVBQVUsQ0FBQztBQUNsRyxDQUFDO0FBNENEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxFQUEyRTtJQUM3RyxPQUFPLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxFQUFFO1FBQ3ZCLE1BQU0sT0FBTyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUNoQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RDLE1BQU0sR0FBRyxHQUFHLElBQUksdUJBQXVCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hELE9BQU8sSUFBSSxpQkFBaUIsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ3pELENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3BDLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2hELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLE1BQU0sS0FBSyxTQUFTLEVBQUUsQ0FBQztRQUNsRSxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQztBQUNILENBQUM7QUFlRCxNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxlQUFlLENBQTBCLHFCQUFxQixDQUFDLENBQUM7QUFFdkcsTUFBTSxPQUFPLHNCQUFzQjtJQUFuQztRQUlrQixXQUFNLEdBQTRCLEVBQUUsQ0FBQztRQUU3QyxVQUFLLEdBQW9DLElBQUksQ0FBQyxNQUFNLENBQUM7SUF3Qi9ELENBQUM7SUF0QkEsdUJBQXVCLENBQUMsSUFBMkI7UUFDbEQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFdkIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDekIsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUM7WUFDOUIsTUFBTSxNQUFNLEdBQUcsQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUM7WUFDOUIsSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUM7Z0JBQ3ZCLE9BQU8sT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xDLENBQUM7aUJBQU0sSUFBSSxNQUFNLEdBQUcsTUFBTSxFQUFFLENBQUM7Z0JBQzVCLE9BQU8sQ0FBQyxDQUFDO1lBQ1YsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDWCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLFlBQVksQ0FBQyxHQUFHLEVBQUU7WUFDeEIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDeEMsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM5QixDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QifQ==