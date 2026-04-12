/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { LanguageService } from '../../../../../editor/common/services/languageService.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { GettingStartedDetailsRenderer } from '../../browser/gettingStartedDetailsRenderer.js';
import { convertInternalMediaPathToFileURI } from '../../browser/gettingStartedService.js';
import { TestExtensionService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
suite('Getting Started Markdown Renderer', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('renders theme picker markdown with images', async () => {
        const fileService = new TestFileService();
        const languageService = new LanguageService();
        const renderer = new GettingStartedDetailsRenderer(fileService, new TestNotificationService(), new TestExtensionService(), languageService);
        const mdPath = convertInternalMediaPathToFileURI('theme_picker').with({ query: JSON.stringify({ moduleId: 'vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker' }) });
        const mdBase = FileAccess.asFileUri('vs/workbench/contrib/welcomeGettingStarted/common/media/');
        const rendered = await renderer.renderMarkdown(mdPath, mdBase);
        const imageSrcs = [...rendered.matchAll(/img src="[^"]*"/g)].map(match => match[0]);
        for (const src of imageSrcs) {
            const targetSrcFormat = /^img src=".*\/vs\/workbench\/contrib\/welcomeGettingStarted\/common\/media\/.*.png"$/;
            assert(targetSrcFormat.test(src), `${src} didnt match regex`);
        }
        languageService.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0dGluZ1N0YXJ0ZWRNYXJrZG93blJlbmRlcmVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvdGVzdC9icm93c2VyL2dldHRpbmdTdGFydGVkTWFya2Rvd25SZW5kZXJlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbkcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZFQUE2RSxDQUFDO0FBQ3RILE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxpQ0FBaUMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzNGLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUd6RyxLQUFLLENBQUMsbUNBQW1DLEVBQUUsR0FBRyxFQUFFO0lBRS9DLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLDJDQUEyQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzVELE1BQU0sV0FBVyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDMUMsTUFBTSxlQUFlLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQUM5QyxNQUFNLFFBQVEsR0FBRyxJQUFJLDZCQUE2QixDQUFDLFdBQVcsRUFBRSxJQUFJLHVCQUF1QixFQUFFLEVBQUUsSUFBSSxvQkFBb0IsRUFBRSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzVJLE1BQU0sTUFBTSxHQUFHLGlDQUFpQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsUUFBUSxFQUFFLHNFQUFzRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkwsTUFBTSxNQUFNLEdBQUcsVUFBVSxDQUFDLFNBQVMsQ0FBQywwREFBMEQsQ0FBQyxDQUFDO1FBQ2hHLE1BQU0sUUFBUSxHQUFHLE1BQU0sUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFDL0QsTUFBTSxTQUFTLEdBQUcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLEtBQUssTUFBTSxHQUFHLElBQUksU0FBUyxFQUFFLENBQUM7WUFDN0IsTUFBTSxlQUFlLEdBQUcsc0ZBQXNGLENBQUM7WUFDL0csTUFBTSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLG9CQUFvQixDQUFDLENBQUM7UUFDL0QsQ0FBQztRQUNELGVBQWUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUMzQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=