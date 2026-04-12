/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class StandaloneTreeSitterLibraryService {
    getParserClass() {
        throw new Error('not implemented in StandaloneTreeSitterLibraryService');
    }
    supportsLanguage(languageId, reader) {
        return false;
    }
    getLanguage(languageId, ignoreSupportsCheck, reader) {
        return undefined;
    }
    async getLanguagePromise(languageId) {
        return undefined;
    }
    getInjectionQueries(languageId, reader) {
        return null;
    }
    getHighlightingQueries(languageId, reader) {
        return null;
    }
    async createQuery(language, querySource) {
        throw new Error('not implemented in StandaloneTreeSitterLibraryService');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhbmRhbG9uZVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxNQUFNLE9BQU8sa0NBQWtDO0lBRzlDLGNBQWM7UUFDYixNQUFNLElBQUksS0FBSyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7SUFDMUUsQ0FBQztJQUVELGdCQUFnQixDQUFDLFVBQWtCLEVBQUUsTUFBMkI7UUFDL0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsV0FBVyxDQUFDLFVBQWtCLEVBQUUsbUJBQTRCLEVBQUUsTUFBMkI7UUFDeEYsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxVQUFrQjtRQUMxQyxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsbUJBQW1CLENBQUMsVUFBa0IsRUFBRSxNQUEyQjtRQUNsRSxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxzQkFBc0IsQ0FBQyxVQUFrQixFQUFFLE1BQTJCO1FBQ3JFLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELEtBQUssQ0FBQyxXQUFXLENBQUMsUUFBa0IsRUFBRSxXQUFtQjtRQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLHVEQUF1RCxDQUFDLENBQUM7SUFDMUUsQ0FBQztDQUNEIn0=