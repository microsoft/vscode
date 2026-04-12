/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as strings from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createTextBufferFactory } from '../../../../common/model/textModel.js';
function testTextBufferFactory(text, eol, mightContainNonBasicASCII, mightContainRTL) {
    const { disposable, textBuffer } = createTextBufferFactory(text).create(1 /* DefaultEndOfLine.LF */);
    assert.strictEqual(textBuffer.mightContainNonBasicASCII(), mightContainNonBasicASCII);
    assert.strictEqual(textBuffer.mightContainRTL(), mightContainRTL);
    assert.strictEqual(textBuffer.getEOL(), eol);
    disposable.dispose();
}
suite('ModelBuilder', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('t1', () => {
        testTextBufferFactory('', '\n', false, false);
    });
    test('t2', () => {
        testTextBufferFactory('Hello world', '\n', false, false);
    });
    test('t3', () => {
        testTextBufferFactory('Hello world\nHow are you?', '\n', false, false);
    });
    test('t4', () => {
        testTextBufferFactory('Hello world\nHow are you?\nIs everything good today?\nDo you enjoy the weather?', '\n', false, false);
    });
    test('carriage return detection (1 \\r\\n 2 \\n)', () => {
        testTextBufferFactory('Hello world\r\nHow are you?\nIs everything good today?\nDo you enjoy the weather?', '\n', false, false);
    });
    test('carriage return detection (2 \\r\\n 1 \\n)', () => {
        testTextBufferFactory('Hello world\r\nHow are you?\r\nIs everything good today?\nDo you enjoy the weather?', '\r\n', false, false);
    });
    test('carriage return detection (3 \\r\\n 0 \\n)', () => {
        testTextBufferFactory('Hello world\r\nHow are you?\r\nIs everything good today?\r\nDo you enjoy the weather?', '\r\n', false, false);
    });
    test('BOM handling', () => {
        testTextBufferFactory(strings.UTF8_BOM_CHARACTER + 'Hello world!', '\n', false, false);
    });
    test('RTL handling 2', () => {
        testTextBufferFactory('Hello world!זוהי עובדה מבוססת שדעתו', '\n', true, true);
    });
    test('RTL handling 3', () => {
        testTextBufferFactory('Hello world!זוהי \nעובדה מבוססת שדעתו', '\n', true, true);
    });
    test('ASCII handling 1', () => {
        testTextBufferFactory('Hello world!!\nHow do you do?', '\n', false, false);
    });
    test('ASCII handling 2', () => {
        testTextBufferFactory('Hello world!!\nHow do you do?Züricha📚📚b', '\n', true, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGluZXNUZXh0QnVmZmVyQnVpbGRlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvZWRpdG9yL3Rlc3QvY29tbW9uL21vZGVsL2xpbmVzVGV4dEJ1ZmZlci9saW5lc1RleHRCdWZmZXJCdWlsZGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sS0FBSyxPQUFPLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFaEYsU0FBUyxxQkFBcUIsQ0FBQyxJQUFZLEVBQUUsR0FBVyxFQUFFLHlCQUFrQyxFQUFFLGVBQXdCO0lBQ3JILE1BQU0sRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLEdBQUcsdUJBQXVCLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSw2QkFBcUIsQ0FBQztJQUU3RixNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyx5QkFBeUIsRUFBRSxFQUFFLHlCQUF5QixDQUFDLENBQUM7SUFDdEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFLEVBQUUsZUFBZSxDQUFDLENBQUM7SUFDbEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDN0MsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ3RCLENBQUM7QUFFRCxLQUFLLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtJQUUxQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLElBQUksQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFO1FBQ2YscUJBQXFCLENBQUMsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDL0MsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUNmLHFCQUFxQixDQUFDLGFBQWEsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7UUFDZixxQkFBcUIsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3hFLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7UUFDZixxQkFBcUIsQ0FBQyxpRkFBaUYsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlILENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxxQkFBcUIsQ0FBQyxtRkFBbUYsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hJLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxxQkFBcUIsQ0FBQyxxRkFBcUYsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3BJLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtRQUN2RCxxQkFBcUIsQ0FBQyx1RkFBdUYsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3RJLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGNBQWMsRUFBRSxHQUFHLEVBQUU7UUFDekIscUJBQXFCLENBQUMsT0FBTyxDQUFDLGtCQUFrQixHQUFHLGNBQWMsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3hGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUMzQixxQkFBcUIsQ0FBQyxxQ0FBcUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdCQUFnQixFQUFFLEdBQUcsRUFBRTtRQUMzQixxQkFBcUIsQ0FBQyx1Q0FBdUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2xGLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM3QixxQkFBcUIsQ0FBQywrQkFBK0IsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzVFLENBQUMsQ0FBQyxDQUFDO0lBQ0gsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUM3QixxQkFBcUIsQ0FBQywyQ0FBMkMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3ZGLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==