/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export var OutlineSortOrder;
(function (OutlineSortOrder) {
    OutlineSortOrder[OutlineSortOrder["ByPosition"] = 0] = "ByPosition";
    OutlineSortOrder[OutlineSortOrder["ByName"] = 1] = "ByName";
    OutlineSortOrder[OutlineSortOrder["ByKind"] = 2] = "ByKind";
})(OutlineSortOrder || (OutlineSortOrder = {}));
export var IOutlinePane;
(function (IOutlinePane) {
    IOutlinePane.Id = 'outline';
})(IOutlinePane || (IOutlinePane = {}));
// --- context keys
export const ctxFollowsCursor = new RawContextKey('outlineFollowsCursor', false);
export const ctxFilterOnType = new RawContextKey('outlineFiltersOnType', false);
export const ctxSortMode = new RawContextKey('outlineSortMode', 0 /* OutlineSortOrder.ByPosition */);
export const ctxAllCollapsed = new RawContextKey('outlineAllCollapsed', false);
export const ctxFocused = new RawContextKey('outlineFocused', true);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0bGluZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUdyRixNQUFNLENBQU4sSUFBa0IsZ0JBSWpCO0FBSkQsV0FBa0IsZ0JBQWdCO0lBQ2pDLG1FQUFVLENBQUE7SUFDViwyREFBTSxDQUFBO0lBQ04sMkRBQU0sQ0FBQTtBQUNQLENBQUMsRUFKaUIsZ0JBQWdCLEtBQWhCLGdCQUFnQixRQUlqQztBQVFELE1BQU0sS0FBVyxZQUFZLENBRTVCO0FBRkQsV0FBaUIsWUFBWTtJQUNmLGVBQUUsR0FBRyxTQUFTLENBQUM7QUFDN0IsQ0FBQyxFQUZnQixZQUFZLEtBQVosWUFBWSxRQUU1QjtBQVFELG1CQUFtQjtBQUVuQixNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGFBQWEsQ0FBVSxzQkFBc0IsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMxRixNQUFNLENBQUMsTUFBTSxlQUFlLEdBQUcsSUFBSSxhQUFhLENBQVUsc0JBQXNCLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDekYsTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFHLElBQUksYUFBYSxDQUFtQixpQkFBaUIsc0NBQThCLENBQUM7QUFDL0csTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHLElBQUksYUFBYSxDQUFVLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3hGLE1BQU0sQ0FBQyxNQUFNLFVBQVUsR0FBRyxJQUFJLGFBQWEsQ0FBVSxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsQ0FBQyJ9