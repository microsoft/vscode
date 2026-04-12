/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { isMacintosh, isLinux, isWindows } from '../../../../../base/common/platform.js';
import { OutputLinkComputer } from '../../common/outputLinkComputer.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('OutputLinkProvider', () => {
    function toOSPath(p) {
        if (isMacintosh || isLinux) {
            return p.replace(/\\/g, '/');
        }
        return p;
    }
    test('OutputLinkProvider - Link detection', function () {
        const rootFolder = isWindows ? URI.file('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala') :
            URI.file('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala');
        const patterns = OutputLinkComputer.createPatterns(rootFolder);
        const contextService = new TestContextService();
        let line = toOSPath('Foo bar');
        let result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 0);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString());
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 84);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336 in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#336');
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 88);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336:9
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336:9 in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#336,9');
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 90);
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336:9 in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#336,9');
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 90);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts>dir
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts>dir in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString());
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 84);
        // Example: at [C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336:9]
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:336:9] in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#336,9');
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 90);
        // Example: at [C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts]
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts] in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts]').toString());
        // Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js on line 8
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts on line 8');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#8');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 90);
        // Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js on line 8, column 13
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts on line 8, column 13');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#8,13');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 101);
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts on LINE 8, COLUMN 13');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#8,13');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 101);
        // Example: C:\Users\someone\AppData\Local\Temp\_monacodata_9888\workspaces\express\server.js:line 8
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts:line 8');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#8');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 87);
        // Example: at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts)
        line = toOSPath(' at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts)');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString());
        assert.strictEqual(result[0].range.startColumn, 15);
        assert.strictEqual(result[0].range.endColumn, 94);
        // Example: at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts:278)
        line = toOSPath(' at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts:278)');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#278');
        assert.strictEqual(result[0].range.startColumn, 15);
        assert.strictEqual(result[0].range.endColumn, 98);
        // Example: at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts:278:34)
        line = toOSPath(' at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts:278:34)');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#278,34');
        assert.strictEqual(result[0].range.startColumn, 15);
        assert.strictEqual(result[0].range.endColumn, 101);
        line = toOSPath(' at File.put (C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Game.ts:278:34)');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString() + '#278,34');
        assert.strictEqual(result[0].range.startColumn, 15);
        assert.strictEqual(result[0].range.endColumn, 101);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts(45): error
        line = toOSPath('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/lib/something/Features.ts(45): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 102);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts (45,18): error
        line = toOSPath('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/lib/something/Features.ts (45): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 103);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts(45,18): error
        line = toOSPath('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/lib/something/Features.ts(45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 105);
        line = toOSPath('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/lib/something/Features.ts(45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 105);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts (45,18): error
        line = toOSPath('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/lib/something/Features.ts (45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 106);
        line = toOSPath('C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/lib/something/Features.ts (45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 106);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts(45): error
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features.ts(45): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 102);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts (45,18): error
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features.ts (45): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 103);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts(45,18): error
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features.ts(45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 105);
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features.ts(45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 105);
        // Example: C:/Users/someone/AppData/Local/Temp/_monacodata_9888/workspaces/mankala/Features.ts (45,18): error
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features.ts (45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 106);
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features.ts (45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 106);
        // Example: C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features Special.ts (45,18): error.
        line = toOSPath('C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\lib\\something\\Features Special.ts (45,18): error');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/lib/something/Features Special.ts').toString() + '#45,18');
        assert.strictEqual(result[0].range.startColumn, 1);
        assert.strictEqual(result[0].range.endColumn, 114);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts.
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts. in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString());
        assert.strictEqual(result[0].range.startColumn, 5);
        assert.strictEqual(result[0].range.endColumn, 84);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        // Example: at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game\\
        line = toOSPath(' at C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game\\ in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        // Example: at "C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts"
        line = toOSPath(' at "C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts" in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString());
        assert.strictEqual(result[0].range.startColumn, 6);
        assert.strictEqual(result[0].range.endColumn, 85);
        // Example: at 'C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts'
        line = toOSPath(' at \'C:\\Users\\someone\\AppData\\Local\\Temp\\_monacodata_9888\\workspaces\\mankala\\Game.ts\' in');
        result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].url, contextService.toResource('/Game.ts').toString());
        assert.strictEqual(result[0].range.startColumn, 6);
        assert.strictEqual(result[0].range.endColumn, 85);
    });
    test('OutputLinkProvider - #106847', function () {
        const rootFolder = isWindows ? URI.file('C:\\Users\\username\\Desktop\\test-ts') :
            URI.file('C:/Users/username/Desktop');
        const patterns = OutputLinkComputer.createPatterns(rootFolder);
        const contextService = new TestContextService();
        const line = toOSPath('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa C:\\Users\\username\\Desktop\\test-ts\\prj.conf C:\\Users\\username\\Desktop\\test-ts\\prj.conf C:\\Users\\username\\Desktop\\test-ts\\prj.conf');
        const result = OutputLinkComputer.detectLinks(line, 1, patterns, contextService);
        assert.strictEqual(result.length, 3);
        for (const res of result) {
            assert.ok(res.range.startColumn > 0 && res.range.endColumn > 0);
        }
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0TGlua1Byb3ZpZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9vdXRwdXQvdGVzdC9icm93c2VyL291dHB1dExpbmtQcm92aWRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEQsT0FBTyxFQUFFLFdBQVcsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDeEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsS0FBSyxDQUFDLG9CQUFvQixFQUFFLEdBQUcsRUFBRTtJQUVoQyxTQUFTLFFBQVEsQ0FBQyxDQUFTO1FBQzFCLElBQUksV0FBVyxJQUFJLE9BQU8sRUFBRSxDQUFDO1lBQzVCLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDOUIsQ0FBQztRQUVELE9BQU8sQ0FBQyxDQUFDO0lBQ1YsQ0FBQztJQUVELElBQUksQ0FBQyxxQ0FBcUMsRUFBRTtRQUMzQyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsaUZBQWlGLENBQUMsQ0FBQyxDQUFDO1lBQzNILEdBQUcsQ0FBQyxJQUFJLENBQUMseUVBQXlFLENBQUMsQ0FBQztRQUVyRixNQUFNLFFBQVEsR0FBRyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLENB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