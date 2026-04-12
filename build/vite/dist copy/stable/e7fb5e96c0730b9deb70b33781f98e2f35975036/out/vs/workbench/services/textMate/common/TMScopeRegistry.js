/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as resources from '../../../../base/common/resources.js';
export class TMScopeRegistry {
    constructor() {
        this._scopeNameToLanguageRegistration = Object.create(null);
    }
    reset() {
        this._scopeNameToLanguageRegistration = Object.create(null);
    }
    register(def) {
        if (this._scopeNameToLanguageRegistration[def.scopeName]) {
            const existingRegistration = this._scopeNameToLanguageRegistration[def.scopeName];
            if (!resources.isEqual(existingRegistration.location, def.location)) {
                console.warn(`Overwriting grammar scope name to file mapping for scope ${def.scopeName}.\n` +
                    `Old grammar file: ${existingRegistration.location.toString()}.\n` +
                    `New grammar file: ${def.location.toString()}`);
            }
        }
        this._scopeNameToLanguageRegistration[def.scopeName] = def;
    }
    getGrammarDefinition(scopeName) {
        return this._scopeNameToLanguageRegistration[scopeName] || null;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVE1TY29wZVJlZ2lzdHJ5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RleHRNYXRlL2NvbW1vbi9UTVNjb3BlUmVnaXN0cnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQXdCbEUsTUFBTSxPQUFPLGVBQWU7SUFJM0I7UUFDQyxJQUFJLENBQUMsZ0NBQWdDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRU0sS0FBSztRQUNYLElBQUksQ0FBQyxnQ0FBZ0MsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzdELENBQUM7SUFFTSxRQUFRLENBQUMsR0FBNEI7UUFDM0MsSUFBSSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUM7WUFDMUQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUMsZ0NBQWdDLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ2xGLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztnQkFDckUsT0FBTyxDQUFDLElBQUksQ0FDWCw0REFBNEQsR0FBRyxDQUFDLFNBQVMsS0FBSztvQkFDOUUscUJBQXFCLG9CQUFvQixDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsS0FBSztvQkFDbEUscUJBQXFCLEdBQUcsQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FDOUMsQ0FBQztZQUNILENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsR0FBRyxHQUFHLENBQUM7SUFDNUQsQ0FBQztJQUVNLG9CQUFvQixDQUFDLFNBQWlCO1FBQzVDLE9BQU8sSUFBSSxDQUFDLGdDQUFnQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLElBQUksQ0FBQztJQUNqRSxDQUFDO0NBQ0QifQ==