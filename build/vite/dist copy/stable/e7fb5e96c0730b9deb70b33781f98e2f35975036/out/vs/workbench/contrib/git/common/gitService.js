/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export var GitRefType;
(function (GitRefType) {
    GitRefType[GitRefType["Head"] = 0] = "Head";
    GitRefType[GitRefType["RemoteHead"] = 1] = "RemoteHead";
    GitRefType[GitRefType["Tag"] = 2] = "Tag";
})(GitRefType || (GitRefType = {}));
export const IGitService = createDecorator('gitService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2dpdC9jb21tb24vZ2l0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFN0YsTUFBTSxDQUFOLElBQVksVUFJWDtBQUpELFdBQVksVUFBVTtJQUNyQiwyQ0FBSSxDQUFBO0lBQ0osdURBQVUsQ0FBQTtJQUNWLHlDQUFHLENBQUE7QUFDSixDQUFDLEVBSlcsVUFBVSxLQUFWLFVBQVUsUUFJckI7QUF5RUQsTUFBTSxDQUFDLE1BQU0sV0FBVyxHQUFHLGVBQWUsQ0FBYyxZQUFZLENBQUMsQ0FBQyJ9