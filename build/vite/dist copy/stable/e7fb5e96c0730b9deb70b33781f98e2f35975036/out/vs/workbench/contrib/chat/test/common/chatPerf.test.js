/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { getMarks } from '../../../../../base/common/performance.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatPerfMark, clearChatMarks, markChat } from '../../common/chatPerf.js';
suite('chatPerf', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let sessionResource;
    setup(() => {
        sessionResource = URI.parse(`test://session/${Date.now()}`);
    });
    teardown(() => {
        clearChatMarks(sessionResource);
    });
    test('markChat emits a mark with the expected prefix', () => {
        markChat(sessionResource, ChatPerfMark.RequestStart);
        const marks = getMarks().filter(m => m.name.includes(sessionResource.toString()));
        assert.strictEqual(marks.length, 1);
        assert.ok(marks[0].name.startsWith('code/chat/'));
        assert.ok(marks[0].name.endsWith('/request/start'));
    });
    test('clearChatMarks removes all marks for the session', () => {
        markChat(sessionResource, ChatPerfMark.RequestStart);
        markChat(sessionResource, ChatPerfMark.FirstToken);
        clearChatMarks(sessionResource);
        const marks = getMarks().filter(m => m.name.includes(sessionResource.toString()));
        assert.strictEqual(marks.length, 0);
    });
    test('clearChatMarks does not affect marks from a different session', () => {
        const otherSession = URI.parse(`test://session/other-${Date.now()}`);
        markChat(sessionResource, ChatPerfMark.RequestStart);
        markChat(otherSession, ChatPerfMark.FirstToken);
        clearChatMarks(sessionResource);
        const remaining = getMarks().filter(m => m.name.includes(otherSession.toString()));
        assert.strictEqual(remaining.length, 1);
        clearChatMarks(otherSession);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdFBlcmYudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdFBlcmYudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUNoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsWUFBWSxFQUFFLGNBQWMsRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUVsRixLQUFLLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtJQUV0Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksZUFBb0IsQ0FBQztJQUV6QixLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsZUFBZSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsa0JBQWtCLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDN0QsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2IsY0FBYyxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQ2pDLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtRQUMzRCxRQUFRLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUVyRCxNQUFNLEtBQUssR0FBRyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNwQyxNQUFNLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7UUFDbEQsTUFBTSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7SUFDckQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1FBQzdELFFBQVEsQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ3JELFFBQVEsQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBRW5ELGNBQWMsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUVoQyxNQUFNLEtBQUssR0FBRyxRQUFRLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyQyxDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywrREFBK0QsRUFBRSxHQUFHLEVBQUU7UUFDMUUsTUFBTSxZQUFZLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyx3QkFBd0IsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNyRSxRQUFRLENBQUMsZUFBZSxFQUFFLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNyRCxRQUFRLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUVoRCxjQUFjLENBQUMsZUFBZSxDQUFDLENBQUM7UUFFaEMsTUFBTSxTQUFTLEdBQUcsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNuRixNQUFNLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFeEMsY0FBYyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzlCLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==