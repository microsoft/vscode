/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { QuickInputTreeRenderer } from './quickInputTreeRenderer.js';
/**
 * Delegate for QuickInputTree that provides height and template information.
 */
export class QuickInputTreeDelegate {
    getHeight(_element) {
        return 22;
    }
    getTemplateId(_element) {
        return QuickInputTreeRenderer.ID;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dERlbGVnYXRlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3RyZWUvcXVpY2tJbnB1dERlbGVnYXRlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBRXJFOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHNCQUFzQjtJQUNsQyxTQUFTLENBQUMsUUFBVztRQUNwQixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFRCxhQUFhLENBQUMsUUFBVztRQUN4QixPQUFPLHNCQUFzQixDQUFDLEVBQUUsQ0FBQztJQUNsQyxDQUFDO0NBQ0QifQ==