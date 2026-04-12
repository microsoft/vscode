/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../common/errors.js';
import { getMonacoEnvironment } from './browser.js';
export function createTrustedTypesPolicy(policyName, policyOptions) {
    const monacoEnvironment = getMonacoEnvironment();
    if (monacoEnvironment?.createTrustedTypesPolicy) {
        try {
            return monacoEnvironment.createTrustedTypesPolicy(policyName, policyOptions);
        }
        catch (err) {
            onUnexpectedError(err);
            return undefined;
        }
    }
    try {
        // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
        return globalThis.trustedTypes?.createPolicy(policyName, policyOptions);
    }
    catch (err) {
        onUnexpectedError(err);
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJ1c3RlZFR5cGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL3RydXN0ZWRUeXBlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFJcEQsTUFBTSxVQUFVLHdCQUF3QixDQUN2QyxVQUFrQixFQUNsQixhQUF1QjtJQUd2QixNQUFNLGlCQUFpQixHQUFHLG9CQUFvQixFQUFFLENBQUM7SUFFakQsSUFBSSxpQkFBaUIsRUFBRSx3QkFBd0IsRUFBRSxDQUFDO1FBQ2pELElBQUksQ0FBQztZQUNKLE9BQU8saUJBQWlCLENBQUMsd0JBQXdCLENBQUMsVUFBVSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQzlFLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2QsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdkIsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFDRCxJQUFJLENBQUM7UUFDSix1RkFBdUY7UUFDdkYsT0FBUSxVQUFrQixDQUFDLFlBQVksRUFBRSxZQUFZLENBQUMsVUFBVSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ2xGLENBQUM7SUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1FBQ2QsaUJBQWlCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdkIsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztBQUNGLENBQUMifQ==