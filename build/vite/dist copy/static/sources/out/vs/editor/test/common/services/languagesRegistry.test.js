/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LanguagesRegistry } from '../../../common/services/languagesRegistry.js';
suite('LanguagesRegistry', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('output language does not have a name', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'outputLangId',
                extensions: [],
                aliases: [],
                mimetypes: ['outputLanguageMimeType'],
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), []);
        registry.dispose();
    });
    test('language with alias does have a name', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId',
                extensions: [],
                aliases: ['LangName'],
                mimetypes: ['bla'],
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'LangName', languageId: 'langId' }]);
        assert.deepStrictEqual(registry.getLanguageName('langId'), 'LangName');
        registry.dispose();
    });
    test('language without alias gets a name', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId',
                extensions: [],
                mimetypes: ['bla'],
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'langId', languageId: 'langId' }]);
        assert.deepStrictEqual(registry.getLanguageName('langId'), 'langId');
        registry.dispose();
    });
    test('bug #4360: f# not shown in status bar', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId',
                extensions: ['.ext1'],
                aliases: ['LangName'],
                mimetypes: ['bla'],
            }]);
        registry._registerLanguages([{
                id: 'langId',
                extensions: ['.ext2'],
                aliases: [],
                mimetypes: ['bla'],
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'LangName', languageId: 'langId' }]);
        assert.deepStrictEqual(registry.getLanguageName('langId'), 'LangName');
        registry.dispose();
    });
    test('issue #5278: Extension cannot override language name anymore', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId',
                extensions: ['.ext1'],
                aliases: ['LangName'],
                mimetypes: ['bla'],
            }]);
        registry._registerLanguages([{
                id: 'langId',
                extensions: ['.ext2'],
                aliases: ['BetterLanguageName'],
                mimetypes: ['bla'],
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'BetterLanguageName', languageId: 'langId' }]);
        assert.deepStrictEqual(registry.getLanguageName('langId'), 'BetterLanguageName');
        registry.dispose();
    });
    test('mimetypes are generated if necessary', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId'
            }]);
        assert.deepStrictEqual(registry.getMimeType('langId'), 'text/x-langId');
        registry.dispose();
    });
    test('first mimetype wins', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId',
                mimetypes: ['text/langId', 'text/langId2']
            }]);
        assert.deepStrictEqual(registry.getMimeType('langId'), 'text/langId');
        registry.dispose();
    });
    test('first mimetype wins 2', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'langId'
            }]);
        registry._registerLanguages([{
                id: 'langId',
                mimetypes: ['text/langId']
            }]);
        assert.deepStrictEqual(registry.getMimeType('langId'), 'text/x-langId');
        registry.dispose();
    });
    test('aliases', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'a'
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'a', languageId: 'a' }]);
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a'), 'a');
        assert.deepStrictEqual(registry.getLanguageName('a'), 'a');
        registry._registerLanguages([{
                id: 'a',
                aliases: ['A1', 'A2']
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'A1', languageId: 'a' }]);
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a1'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a2'), 'a');
        assert.deepStrictEqual(registry.getLanguageName('a'), 'A1');
        registry._registerLanguages([{
                id: 'a',
                aliases: ['A3', 'A4']
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'A3', languageId: 'a' }]);
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a1'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a2'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a3'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a4'), 'a');
        assert.deepStrictEqual(registry.getLanguageName('a'), 'A3');
        registry.dispose();
    });
    test('empty aliases array means no alias', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'a'
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'a', languageId: 'a' }]);
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a'), 'a');
        assert.deepStrictEqual(registry.getLanguageName('a'), 'a');
        registry._registerLanguages([{
                id: 'b',
                aliases: []
            }]);
        assert.deepStrictEqual(registry.getSortedRegisteredLanguageNames(), [{ languageName: 'a', languageId: 'a' }]);
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('a'), 'a');
        assert.deepStrictEqual(registry.getLanguageIdByLanguageName('b'), 'b');
        assert.deepStrictEqual(registry.getLanguageName('a'), 'a');
        assert.deepStrictEqual(registry.getLanguageName('b'), null);
        registry.dispose();
    });
    test('extensions', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'a',
                aliases: ['aName'],
                extensions: ['aExt']
            }]);
        assert.deepStrictEqual(registry.getExtensions('a'), ['aExt']);
        registry._registerLanguages([{
                id: 'a',
                extensions: ['aExt2']
            }]);
        assert.deepStrictEqual(registry.getExtensions('a'), ['aExt', 'aExt2']);
        registry.dispose();
    });
    test('extensions of primary language registration come first', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'a',
                extensions: ['aExt3']
            }]);
        assert.deepStrictEqual(registry.getExtensions('a')[0], 'aExt3');
        registry._registerLanguages([{
                id: 'a',
                configuration: URI.file('conf.json'),
                extensions: ['aExt']
            }]);
        assert.deepStrictEqual(registry.getExtensions('a')[0], 'aExt');
        registry._registerLanguages([{
                id: 'a',
                extensions: ['aExt2']
            }]);
        assert.deepStrictEqual(registry.getExtensions('a')[0], 'aExt');
        registry.dispose();
    });
    test('filenames', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'a',
                aliases: ['aName'],
                filenames: ['aFilename']
            }]);
        assert.deepStrictEqual(registry.getFilenames('a'), ['aFilename']);
        registry._registerLanguages([{
                id: 'a',
                filenames: ['aFilename2']
            }]);
        assert.deepStrictEqual(registry.getFilenames('a'), ['aFilename', 'aFilename2']);
        registry.dispose();
    });
    test('configuration', () => {
        const registry = new LanguagesRegistry(false);
        registry._registerLanguages([{
                id: 'a',
                aliases: ['aName'],
                configuration: URI.file('/path/to/aFilename')
            }]);
        assert.deepStrictEqual(registry.getConfigurationFiles('a'), [URI.file('/path/to/aFilename')]);
        assert.deepStrictEqual(registry.getConfigurationFiles('aname'), []);
        assert.deepStrictEqual(registry.getConfigurationFiles('aName'), []);
        registry._registerLanguages([{
                id: 'a',
                configuration: URI.file('/path/to/aFilename2')
            }]);
        assert.deepStrictEqual(registry.getConfigurationFiles('a'), [URI.file('/path/to/aFilename'), URI.file('/path/to/aFilename2')]);
        assert.deepStrictEqual(registry.getConfigurationFiles('aname'), []);
        assert.deepStrictEqual(registry.getConfigurationFiles('aName'), []);
        registry.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VzUmVnaXN0cnkudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZXNSZWdpc3RyeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFbEYsS0FBSyxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtJQUUvQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7UUFDakQsTUFBTSxRQUFRLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU5QyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLGNBQWM7Z0JBQ2xCLFVBQVUsRUFBRSxFQUFFO2dCQUNkLE9BQU8sRUFBRSxFQUFFO2dCQUNYLFNBQVMsRUFBRSxDQUFDLHdCQUF3QixDQUFDO2FBQ3JDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUV4RSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsc0NBQXNDLEVBQUUsR0FBRyxFQUFFO1FBQ2pELE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxRQUFRO2dCQUNaLFVBQVUsRUFBRSxFQUFFO2dCQUNkLE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQztnQkFDckIsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDO2FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFILE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUV2RSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO1FBQy9DLE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxRQUFRO2dCQUNaLFVBQVUsRUFBRSxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQzthQUNsQixDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxRQUFRLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN4SCxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFckUsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtRQUNsRCxNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsUUFBUTtnQkFDWixVQUFVLEVBQUUsQ0FBQyxPQUFPLENBQUM7Z0JBQ3JCLE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQztnQkFDckIsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDO2FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUosUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxRQUFRO2dCQUNaLFVBQVUsRUFBRSxDQUFDLE9BQU8sQ0FBQztnQkFDckIsT0FBTyxFQUFFLEVBQUU7Z0JBQ1gsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDO2FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzFILE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUV2RSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO1FBQ3pFLE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxRQUFRO2dCQUNaLFVBQVUsRUFBRSxDQUFDLE9BQU8sQ0FBQztnQkFDckIsT0FBTyxFQUFFLENBQUMsVUFBVSxDQUFDO2dCQUNyQixTQUFTLEVBQUUsQ0FBQyxLQUFLLENBQUM7YUFDbEIsQ0FBQyxDQUFDLENBQUM7UUFFSixRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLFFBQVE7Z0JBQ1osVUFBVSxFQUFFLENBQUMsT0FBTyxDQUFDO2dCQUNyQixPQUFPLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQztnQkFDL0IsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDO2FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLG9CQUFvQixFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEksTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxFQUFFLG9CQUFvQixDQUFDLENBQUM7UUFFakYsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtRQUNqRCxNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsUUFBUTthQUNaLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXhFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNwQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7UUFDaEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU5QyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLFFBQVE7Z0JBQ1osU0FBUyxFQUFFLENBQUMsYUFBYSxFQUFFLGNBQWMsQ0FBQzthQUMxQyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUV0RSxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxRQUFRO2FBQ1osQ0FBQyxDQUFDLENBQUM7UUFFSixRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLFFBQVE7Z0JBQ1osU0FBUyxFQUFFLENBQUMsYUFBYSxDQUFDO2FBQzFCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXhFLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNwQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxFQUFFO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxHQUFHO2FBQ1AsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxFQUFFLENBQUMsRUFBRSxZQUFZLEVBQUUsR0FBRyxFQUFFLFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUcsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdkUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBRTNELFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRztnQkFDUCxPQUFPLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO2FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9HLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU1RCxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLEdBQUc7Z0JBQ1AsT0FBTyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQzthQUNyQixDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUMvRyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN4RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFNUQsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtRQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRzthQUNQLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsRUFBRSxDQUFDLEVBQUUsWUFBWSxFQUFFLEdBQUcsRUFBRSxVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlHLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLEdBQUcsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3ZFLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUUzRCxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLEdBQUc7Z0JBQ1AsT0FBTyxFQUFFLEVBQUU7YUFDWCxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFlBQVksRUFBRSxHQUFHLEVBQUUsVUFBVSxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5RyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUN2RSxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDM0QsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBRTVELFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNwQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQyxZQUFZLEVBQUUsR0FBRyxFQUFFO1FBQ3ZCLE1BQU0sUUFBUSxHQUFHLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFOUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxHQUFHO2dCQUNQLE9BQU8sRUFBRSxDQUFDLE9BQU8sQ0FBQztnQkFDbEIsVUFBVSxFQUFFLENBQUMsTUFBTSxDQUFDO2FBQ3BCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUU5RCxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLEdBQUc7Z0JBQ1AsVUFBVSxFQUFFLENBQUMsT0FBTyxDQUFDO2FBQ3JCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFdkUsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtRQUNuRSxNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRztnQkFDUCxVQUFVLEVBQUUsQ0FBQyxPQUFPLENBQUM7YUFDckIsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFFaEUsUUFBUSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQzVCLEVBQUUsRUFBRSxHQUFHO2dCQUNQLGFBQWEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQztnQkFDcEMsVUFBVSxFQUFFLENBQUMsTUFBTSxDQUFDO2FBQ3BCLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBRS9ELFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRztnQkFDUCxVQUFVLEVBQUUsQ0FBQyxPQUFPLENBQUM7YUFDckIsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFL0QsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7UUFDdEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUU5QyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQztnQkFDNUIsRUFBRSxFQUFFLEdBQUc7Z0JBQ1AsT0FBTyxFQUFFLENBQUMsT0FBTyxDQUFDO2dCQUNsQixTQUFTLEVBQUUsQ0FBQyxXQUFXLENBQUM7YUFDeEIsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBRWxFLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRztnQkFDUCxTQUFTLEVBQUUsQ0FBQyxZQUFZLENBQUM7YUFDekIsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUMsQ0FBQztRQUVoRixRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDcEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtRQUMxQixNQUFNLFFBQVEsR0FBRyxJQUFJLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxDQUFDO1FBRTlDLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRztnQkFDUCxPQUFPLEVBQUUsQ0FBQyxPQUFPLENBQUM7Z0JBQ2xCLGFBQWEsRUFBRSxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDO2FBQzdDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3BFLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXBFLFFBQVEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUM1QixFQUFFLEVBQUUsR0FBRztnQkFDUCxhQUFhLEVBQUUsR0FBRyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQzthQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVKLE1BQU0sQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDL0gsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDcEUsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMscUJBQXFCLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFcEUsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ3BCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==