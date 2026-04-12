/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
export const IChatAttachmentWidgetRegistry = createDecorator('chatAttachmentWidgetRegistry');
export class ChatAttachmentWidgetRegistry {
    constructor() {
        this._factories = new Map();
    }
    registerFactory(kind, factory) {
        this._factories.set(kind, factory);
        return {
            dispose: () => {
                if (this._factories.get(kind) === factory) {
                    this._factories.delete(kind);
                }
            }
        };
    }
    createWidget(attachment, options, container) {
        const factory = this._factories.get(attachment.kind);
        if (!factory) {
            return undefined;
        }
        return factory(attachment, options, container);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQXVCaEcsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsZUFBZSxDQUFnQyw4QkFBOEIsQ0FBQyxDQUFDO0FBcUI1SCxNQUFNLE9BQU8sNEJBQTRCO0lBQXpDO1FBSWtCLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBdUMsQ0FBQztJQXdCOUUsQ0FBQztJQXRCQSxlQUFlLENBQUMsSUFBWSxFQUFFLE9BQW9DO1FBQ2pFLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNuQyxPQUFPO1lBQ04sT0FBTyxFQUFFLEdBQUcsRUFBRTtnQkFDYixJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLE9BQU8sRUFBRSxDQUFDO29CQUMzQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDOUIsQ0FBQztZQUNGLENBQUM7U0FDRCxDQUFDO0lBQ0gsQ0FBQztJQUVELFlBQVksQ0FDWCxVQUFxQyxFQUNyQyxPQUF1RSxFQUN2RSxTQUFzQjtRQUV0QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckQsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2QsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLFVBQVUsRUFBRSxPQUFPLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQUNEIn0=