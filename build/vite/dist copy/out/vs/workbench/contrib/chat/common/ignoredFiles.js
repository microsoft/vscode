/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
export const ILanguageModelIgnoredFilesService = createDecorator('languageModelIgnoredFilesService');
export class LanguageModelIgnoredFilesService {
    constructor() {
        this._providers = new Set();
    }
    async fileIsIgnored(uri, token) {
        // Just use the first provider
        const provider = this._providers.values().next().value;
        return provider ?
            provider.isFileIgnored(uri, token) :
            false;
    }
    registerIgnoredFileProvider(provider) {
        this._providers.add(provider);
        return toDisposable(() => {
            this._providers.delete(provider);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWdub3JlZEZpbGVzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vaWdub3JlZEZpbGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBZSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVqRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFNN0YsTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsZUFBZSxDQUFvQyxrQ0FBa0MsQ0FBQyxDQUFDO0FBUXhJLE1BQU0sT0FBTyxnQ0FBZ0M7SUFBN0M7UUFHa0IsZUFBVSxHQUFHLElBQUksR0FBRyxFQUFxQyxDQUFDO0lBZ0I1RSxDQUFDO0lBZEEsS0FBSyxDQUFDLGFBQWEsQ0FBQyxHQUFRLEVBQUUsS0FBd0I7UUFDckQsOEJBQThCO1FBQzlCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUMsS0FBSyxDQUFDO1FBQ3ZELE9BQU8sUUFBUSxDQUFDLENBQUM7WUFDaEIsUUFBUSxDQUFDLGFBQWEsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNwQyxLQUFLLENBQUM7SUFDUixDQUFDO0lBRUQsMkJBQTJCLENBQUMsUUFBMkM7UUFDdEUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDOUIsT0FBTyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ3hCLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQztDQUNEIn0=