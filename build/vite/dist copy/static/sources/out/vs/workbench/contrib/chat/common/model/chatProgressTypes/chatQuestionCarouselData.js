/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DeferredPromise } from '../../../../../../base/common/async.js';
/**
 * Runtime representation of a question carousel with a {@link DeferredPromise}
 * that is resolved when the user submits answers. {@link toJSON} strips the
 * completion so only serialisable data is persisted.
 */
export class ChatQuestionCarouselData {
    constructor(questions, allowSkip, resolveId, data, isUsed, message, source) {
        this.questions = questions;
        this.allowSkip = allowSkip;
        this.resolveId = resolveId;
        this.data = data;
        this.isUsed = isUsed;
        this.message = message;
        this.source = source;
        this.kind = 'questionCarousel';
        this.completion = new DeferredPromise();
    }
    toJSON() {
        return {
            kind: this.kind,
            questions: this.questions,
            allowSkip: this.allowSkip,
            resolveId: this.resolveId,
            data: this.data,
            isUsed: this.isUsed,
            message: this.message,
            source: this.source,
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUt6RTs7OztHQUlHO0FBQ0gsTUFBTSxPQUFPLHdCQUF3QjtJQU9wQyxZQUNRLFNBQTBCLEVBQzFCLFNBQWtCLEVBQ2xCLFNBQWtCLEVBQ2xCLElBQTJCLEVBQzNCLE1BQWdCLEVBQ2hCLE9BQWtDLEVBQ2xDLE1BQXVCO1FBTnZCLGNBQVMsR0FBVCxTQUFTLENBQWlCO1FBQzFCLGNBQVMsR0FBVCxTQUFTLENBQVM7UUFDbEIsY0FBUyxHQUFULFNBQVMsQ0FBUztRQUNsQixTQUFJLEdBQUosSUFBSSxDQUF1QjtRQUMzQixXQUFNLEdBQU4sTUFBTSxDQUFVO1FBQ2hCLFlBQU8sR0FBUCxPQUFPLENBQTJCO1FBQ2xDLFdBQU0sR0FBTixNQUFNLENBQWlCO1FBYmYsU0FBSSxHQUFHLGtCQUEyQixDQUFDO1FBQ25DLGVBQVUsR0FBRyxJQUFJLGVBQWUsRUFBaUQsQ0FBQztJQWE5RixDQUFDO0lBRUwsTUFBTTtRQUNMLE9BQU87WUFDTixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVM7WUFDekIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztZQUN6QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtTQUNuQixDQUFDO0lBQ0gsQ0FBQztDQUNEIn0=