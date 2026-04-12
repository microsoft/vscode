/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { addDisposableListener } from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
export async function showBrowserToast(controller, options, token) {
    const toast = await triggerBrowserToast(options.title, {
        detail: options.body,
        sticky: !options.silent
    });
    if (!toast) {
        return { supported: false, clicked: false };
    }
    const disposables = new DisposableStore();
    controller.onDidCreateToast(toast);
    const cts = new CancellationTokenSource(token);
    disposables.add(toDisposable(() => {
        controller.onDidDisposeToast(toast);
        toast.dispose();
        cts.dispose(true);
    }));
    return new Promise(r => {
        const resolve = (result) => {
            r(result); // first return the result before...
            disposables.dispose(); // ...disposing which would invalidate the result object
        };
        disposables.add(cts.token.onCancellationRequested(() => resolve({ supported: true, clicked: false })));
        Event.once(toast.onClick)(() => resolve({ supported: true, clicked: true }));
        Event.once(toast.onClose)(() => resolve({ supported: true, clicked: false }));
        Event.once(toast.onError)(() => resolve({ supported: false, clicked: false }));
    });
}
async function triggerBrowserToast(message, options) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        return;
    }
    const disposables = new DisposableStore();
    const notification = new Notification(message, {
        body: options?.detail,
        requireInteraction: options?.sticky,
    });
    const onClick = disposables.add(new Emitter());
    const onClose = disposables.add(new Emitter());
    const onError = disposables.add(new Emitter());
    disposables.add(addDisposableListener(notification, 'click', () => onClick.fire()));
    disposables.add(addDisposableListener(notification, 'close', () => onClose.fire()));
    disposables.add(addDisposableListener(notification, 'error', () => onError.fire()));
    disposables.add(toDisposable(() => notification.close()));
    return {
        onClick: onClick.event,
        onClose: onClose.event,
        onError: onError.event,
        dispose: () => disposables.dispose()
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9hc3RzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci90b2FzdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDeEUsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQVFsRyxNQUFNLENBQUMsS0FBSyxVQUFVLGdCQUFnQixDQUFDLFVBQWdDLEVBQUUsT0FBc0IsRUFBRSxLQUF3QjtJQUN4SCxNQUFNLEtBQUssR0FBRyxNQUFNLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUU7UUFDdEQsTUFBTSxFQUFFLE9BQU8sQ0FBQyxJQUFJO1FBQ3BCLE1BQU0sRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNO0tBQ3ZCLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNaLE9BQU8sRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsQ0FBQztJQUM3QyxDQUFDO0lBRUQsTUFBTSxXQUFXLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUMxQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFFbkMsTUFBTSxHQUFHLEdBQUcsSUFBSSx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUUvQyxXQUFXLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxHQUFHLEVBQUU7UUFDakMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLEtB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