/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export class TestTreeSitterLibraryService {
    getParserClass() {
        throw new Error('not implemented in TestTreeSitterLibraryService');
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
        throw new Error('not implemented in TestTreeSitterLibraryService');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy90ZXN0VHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBTWhHLE1BQU0sT0FBTyw0QkFBNEI7SUFHeEMsY0FBYztRQUNiLE1BQU0sSUFBSSxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztJQUNwRSxDQUFDO0lBRUQsZ0JBQWdCLENBQUMsVUFBa0IsRUFBRSxNQUEyQjtRQUMvRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxXQUFXLENBQUMsVUFBa0IsRUFBRSxtQkFBNEIsRUFBRSxNQUEyQjtRQUN4RixPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFVBQWtCO1FBQzFDLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxtQkFBbUIsQ0FBQyxVQUFrQixFQUFFLE1BQTJCO1FBQ2xFLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELHNCQUFzQixDQUFDLFVBQWtCLEVBQUUsTUFBMkI7UUFDckUsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsS0FBSyxDQUFDLFdBQVcsQ0FBQyxRQUFrQixFQUFFLFdBQW1CO1FBQ3hELE1BQU0sSUFBSSxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztJQUNwRSxDQUFDO0NBQ0QifQ==