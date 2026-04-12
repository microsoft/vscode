/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
let _isHotReloadEnabled = false;
export function enableHotReload() {
    _isHotReloadEnabled = true;
}
export function isHotReloadEnabled() {
    return _isHotReloadEnabled;
}
export function registerHotReloadHandler(handler) {
    if (!isHotReloadEnabled()) {
        return { dispose() { } };
    }
    else {
        const handlers = registerGlobalHotReloadHandler();
        handlers.add(handler);
        return {
            dispose() { handlers.delete(handler); }
        };
    }
}
function registerGlobalHotReloadHandler() {
    if (!hotReloadHandlers) {
        hotReloadHandlers = new Set();
    }
    const g = globalThis;
    if (!g.$hotReload_applyNewExports) {
        g.$hotReload_applyNewExports = args => {
            const args2 = { config: { mode: undefined }, ...args };
            const results = [];
            for (const h of hotReloadHandlers) {
                const result = h(args2);
                if (result) {
                    results.push(result);
                }
            }
            if (results.length > 0) {
                return newExports => {
                    let result = false;
                    for (const r of results) {
                        if (r(newExports)) {
                            result = true;
                        }
                    }
                    return result;
                };
            }
            return undefined;
        };
    }
    return hotReloadHandlers;
}
let hotReloadHandlers = undefined;
if (isHotReloadEnabled()) {
    // This code does not run in production.
    registerHotReloadHandler(({ oldExports, newSrc, config }) => {
        if (config.mode !== 'patch-prototype') {
            return undefined;
        }
        return newExports => {
            for (const key in newExports) {
                const exportedItem = newExports[key];
                console.log(`[hot-reload] Patching prototype methods of '${key}'`, { exportedItem });
                if (typeof exportedItem === 'function' && exportedItem.prototype) {
                    const oldExportedItem = oldExports[key];
                    if (oldExportedItem) {
                        for (const prop of Object.getOwnPropertyNames(exportedItem.prototype)) {
                            const descriptor = Object.getOwnPropertyDescriptor(exportedItem.prototype, prop);
                            // eslint-disable-next-line local/code-no-any-casts
                            const oldDescriptor = Object.getOwnPropertyDescriptor(oldExportedItem.prototype, prop);
                            if (descriptor?.value?.toString() !== oldDescriptor?.value?.toString()) {
                                console.log(`[hot-reload] Patching prototype method '${key}.${prop}'`);
                            }
                            // eslint-disable-next-line local/code-no-any-casts
                            Object.defineProperty(oldExportedItem.prototype, prop, descriptor);
                        }
                        newExports[key] = oldExportedItem;
                    }
                }
            }
            return true;
        };
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG90UmVsb2FkLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vaG90UmVsb2FkLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLElBQUksbUJBQW1CLEdBQUcsS0FBSyxDQUFDO0FBRWhDLE1BQU0sVUFBVSxlQUFlO0lBQzlCLG1CQUFtQixHQUFHLElBQUksQ0FBQztBQUM1QixDQUFDO0FBRUQsTUFBTSxVQUFVLGtCQUFrQjtJQUNqQyxPQUFPLG1CQUFtQixDQUFDO0FBQzVCLENBQUM7QUFDRCxNQUFNLFVBQVUsd0JBQXdCLENBQUMsT0FBeUI7SUFDakUsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztRQUMzQixPQUFPLEVBQUUsT0FBTyxLQUFLLENBQUMsRUFBRSxDQUFDO0lBQzFCLENBQUM7U0FBTSxDQUFDO1FBQ1AsTUFBTSxRQUFRLEdBQUcsOEJBQThCLEVBQUUsQ0FBQztRQUNsRCxRQUFRLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RCLE9BQU87WUFDTixPQUFPLEtBQUssUUFBUSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDdkMsQ0FBQztJQUNILENBQUM7QUFDRixDQUFDO0FBWUQsU0FBUyw4QkFBOEI7SUFDdEMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDeEIsaUJBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztJQUMvQixDQUFDO0lBRUQsTUFBTSxDQUFDLEdBQUcsVUFBMkMsQ0FBQztJQUN0RCxJQUFJLENBQUMsQ0FBQyxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDbkMsQ0FBQyxDQUFDLDBCQUEwQixHQUFHLElBQUksQ0FBQyxFQUFFO1lBQ3JDLE1BQU0sS0FBSyxHQUFHLEVBQUUsTUFBTSxFQUFFLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxFQUFFLEdBQUcsSUFBSSxFQUFFLENBQUM7WUFFdkQsTUFBTSxPQUFPLEdBQThCLEVBQUUsQ0FBQztZQUM5QyxLQUFLLE1BQU0sQ0FBQyxJQUFJLGlCQUFrQixFQUFFLENBQUM7Z0JBQ3BDLE1BQU0sTUFBTSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDeEIsSUFBSSxNQUFNLEVBQUUsQ0FBQztvQkFDWixPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN0QixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztnQkFDeEIsT0FBTyxVQUFVLENBQUMsRUFBRTtvQkFDbkIsSUFBSSxNQUFNLEdBQUcsS0FBSyxDQUFDO29CQUNuQixLQUFLLE1BQU0sQ0FBQyxJQUFJLE9BQU8sRUFBRSxDQUFDO3dCQUN6QixJQUFJLENBQUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDOzRCQUNuQixNQUFNLEdBQUcsSUFBSSxDQUFDO3dCQUNmLENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxPQUFPLE1BQU0sQ0FBQztnQkFDZixDQUFDLENBQUM7WUFDSCxDQUFDO1lBQ0QsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQyxDQUFDO0lBQ0gsQ0FBQztJQUVELE9BQU8saUJBQWlCLENBQUM7QUFDMUIsQ0FBQztBQUVELElBQUksaUJBQWlCLEdBQWdKLFNBQVMsQ0FBQztBQVkvSyxJQUFJLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztJQUMxQix3Q0FBd0M7SUFDeEMsd0JBQXdCLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRTtRQUMzRCxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssaUJBQWlCLEVBQUUsQ0FBQztZQUN2QyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxVQUFVLENBQUMsRUFBRTtZQUNuQixLQUFLLE1BQU0sR0FBRyxJQUFJLFVBQVUsRUFBRSxDQUFDO2dCQUM5QixNQUFNLFlBQVksR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ3JDLE9BQU8sQ0FBQyxHQUFHLENBQUMsK0NBQStDLEdBQUcsR0FBRyxFQUFFLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQztnQkFDckYsSUFBSSxPQUFPLFlBQVksS0FBSyxVQUFVLElBQUksWUFBWSxDQUFDLFNBQVMsRUFBRSxDQUFDO29CQUNsRSxNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3hDLElBQUksZUFBZSxFQUFFLENBQUM7d0JBQ3JCLEtBQUssTUFBTSxJQUFJLElBQUksTUFBTSxDQUFDLG1CQUFtQixDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDOzRCQUN2RSxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsd0JBQXdCLENBQUMsWUFBWSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUUsQ0FBQzs0QkFDbEYsbURBQW1EOzRCQUNuRCxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsd0JBQXdCLENBQUUsZUFBdUIsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7NEJBRWhHLElBQUksVUFBVSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxhQUFhLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLENBQUM7Z0NBQ3hFLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkNBQTJDLEdBQUcsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDOzRCQUN4RSxDQUFDOzRCQUVELG1EQUFtRDs0QkFDbkQsTUFBTSxDQUFDLGNBQWMsQ0FBRSxlQUF1QixDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7d0JBQzdFLENBQUM7d0JBQ0QsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLGVBQWUsQ0FBQztvQkFDbkMsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQyxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDIn0=