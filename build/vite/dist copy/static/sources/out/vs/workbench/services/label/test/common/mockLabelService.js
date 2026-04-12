/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { basename, normalize } from '../../../../../base/common/path.js';
export class MockLabelService {
    constructor() {
        this.onDidChangeFormatters = new Emitter().event;
    }
    registerCachedFormatter(formatter) {
        throw new Error('Method not implemented.');
    }
    getUriLabel(resource, options) {
        return normalize(resource.fsPath);
    }
    getUriBasenameLabel(resource) {
        return basename(resource.fsPath);
    }
    getWorkspaceLabel(workspace, options) {
        return '';
    }
    getHostLabel(scheme, authority) {
        return '';
    }
    getHostTooltip() {
        return '';
    }
    getSeparator(scheme, authority) {
        return '/';
    }
    registerFormatter(formatter) {
        return Disposable.None;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0xhYmVsU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYWJlbC90ZXN0L2NvbW1vbi9tb2NrTGFiZWxTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxxQ0FBcUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0seUNBQXlDLENBQUM7QUFDbEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUt6RSxNQUFNLE9BQU8sZ0JBQWdCO0lBQTdCO1FBMkJVLDBCQUFxQixHQUFpQyxJQUFJLE9BQU8sRUFBeUIsQ0FBQyxLQUFLLENBQUM7SUFDM0csQ0FBQztJQXpCQSx1QkFBdUIsQ0FBQyxTQUFpQztRQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUM7SUFDNUMsQ0FBQztJQUNELFdBQVcsQ0FBQyxRQUFhLEVBQUUsT0FBNEU7UUFDdEcsT0FBTyxTQUFTLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ25DLENBQUM7SUFDRCxtQkFBbUIsQ0FBQyxRQUFhO1FBQ2hDLE9BQU8sUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBQ0QsaUJBQWlCLENBQUMsU0FBa0QsRUFBRSxPQUFnQztRQUNyRyxPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFDRCxZQUFZLENBQUMsTUFBYyxFQUFFLFNBQWtCO1FBQzlDLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNNLGNBQWM7UUFDcEIsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0lBQ0QsWUFBWSxDQUFDLE1BQWMsRUFBRSxTQUFrQjtRQUM5QyxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7SUFDRCxpQkFBaUIsQ0FBQyxTQUFpQztRQUNsRCxPQUFPLFVBQVUsQ0FBQyxJQUFJLENBQUM7SUFDeEIsQ0FBQztDQUVEIn0=