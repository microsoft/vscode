/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const sameOriginWindowChainCache = new WeakMap();
function getParentWindowIfSameOrigin(w) {
    if (!w.parent || w.parent === w) {
        return null;
    }
    // Cannot really tell if we have access to the parent window unless we try to access something in it
    try {
        const location = w.location;
        const parentLocation = w.parent.location;
        if (location.origin !== 'null' && parentLocation.origin !== 'null' && location.origin !== parentLocation.origin) {
            return null;
        }
    }
    catch (e) {
        return null;
    }
    return w.parent;
}
export class IframeUtils {
    /**
     * Returns a chain of embedded windows with the same origin (which can be accessed programmatically).
     * Having a chain of length 1 might mean that the current execution environment is running outside of an iframe or inside an iframe embedded in a window with a different origin.
     */
    static getSameOriginWindowChain(targetWindow) {
        let windowChainCache = sameOriginWindowChainCache.get(targetWindow);
        if (!windowChainCache) {
            windowChainCache = [];
            sameOriginWindowChainCache.set(targetWindow, windowChainCache);
            let w = targetWindow;
            let parent;
            do {
                parent = getParentWindowIfSameOrigin(w);
                if (parent) {
                    windowChainCache.push({
                        window: new WeakRef(w),
                        iframeElement: w.frameElement || null
                    });
                }
                else {
                    windowChainCache.push({
                        window: new WeakRef(w),
                        iframeElement: null
                    });
                }
                w = parent;
            } while (w);
        }
        return windowChainCache.slice(0);
    }
    /**
     * Returns the position of `childWindow` relative to `ancestorWindow`
     */
    static getPositionOfChildWindowRelativeToAncestorWindow(childWindow, ancestorWindow) {
        if (!ancestorWindow || childWindow === ancestorWindow) {
            return {
                top: 0,
                left: 0
            };
        }
        let top = 0, left = 0;
        const windowChain = this.getSameOriginWindowChain(childWindow);
        for (const windowChainEl of windowChain) {
            const windowInChain = windowChainEl.window.deref();
            top += windowInChain?.scrollY ?? 0;
            left += windowInChain?.scrollX ?? 0;
            if (windowInChain === ancestorWindow) {
                break;
            }
            if (!windowChainEl.iframeElement) {
                break;
            }
            const boundingRect = windowChainEl.iframeElement.getBoundingClientRect();
            top += boundingRect.top;
            left += boundingRect.left;
        }
        return {
            top: top,
            left: left
        };
    }
}
/**
 * Returns a sha-256 composed of `parentOrigin` and `salt` converted to base 32
 */
export async function parentOriginHash(parentOrigin, salt) {
    // This same code is also inlined at `src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html`
    if (!crypto.subtle) {
        throw new Error(`'crypto.subtle' is not available so webviews will not work. This is likely because the editor is not running in a secure context (https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts).`);
    }
    const strData = JSON.stringify({ parentOrigin, salt });
    const encoder = new TextEncoder();
    const arrData = encoder.encode(strData);
    const hash = await crypto.subtle.digest('sha-256', arrData);
    return sha256AsBase32(hash);
}
function sha256AsBase32(bytes) {
    const array = Array.from(new Uint8Array(bytes));
    const hexArray = array.map(b => b.toString(16).padStart(2, '0')).join('');
    // sha256 has 256 bits, so we need at most ceil(lg(2^256-1)/lg(32)) = 52 chars to represent it in base 32
    return BigInt(`0x${hexArray}`).toString(32).padStart(52, '0');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWZyYW1lLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL2lmcmFtZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQWdCaEcsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLE9BQU8sRUFBd0MsQ0FBQztBQUV2RixTQUFTLDJCQUEyQixDQUFDLENBQVM7SUFDN0MsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUNqQyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxvR0FBb0c7SUFDcEcsSUFBSSxDQUFDO1FBQ0osTUFBTSxRQUFRLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQztRQUM1QixNQUFNLGNBQWMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUN6QyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssTUFBTSxJQUFJLGNBQWMsQ0FBQyxNQUFNLEtBQUssTUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLEtBQUssY0FBYyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2pILE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztJQUNGLENBQUM7SUFBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBQ1osT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsT0FBTyxDQUFDLENBQUMsTUFBTSxDQUFDO0FBQ2pCLENBQUM7QUFFRCxNQUFNLE9BQU8sV0FBVztJQUV2Qjs7O09BR0c7SUFDSyxNQUFNLENBQUMsd0JBQXdCLENBQUMsWUFBb0I7UUFDM0QsSUFBSSxnQkFBZ0IsR0FBRywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDdkIsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDO1lB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