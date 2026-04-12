/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { generateUuid } from '../../../../base/common/uuid.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const IRandomService = createDecorator('randomService');
export class RandomService {
    generateUuid() {
        return generateUuid();
    }
    /** Namespace should be 3 letter. */
    generatePrefixedUuid(namespace) {
        return `${namespace}-${this.generateUuid()}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmFuZG9tU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvYnJvd3Nlci9yYW5kb21TZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFFN0YsTUFBTSxDQUFDLE1BQU0sY0FBYyxHQUFHLGVBQWUsQ0FBaUIsZUFBZSxDQUFDLENBQUM7QUFTL0UsTUFBTSxPQUFPLGFBQWE7SUFHekIsWUFBWTtRQUNYLE9BQU8sWUFBWSxFQUFFLENBQUM7SUFDdkIsQ0FBQztJQUVELG9DQUFvQztJQUNwQyxvQkFBb0IsQ0FBQyxTQUFpQjtRQUNyQyxPQUFPLEdBQUcsU0FBUyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDO0lBQzlDLENBQUM7Q0FDRCJ9