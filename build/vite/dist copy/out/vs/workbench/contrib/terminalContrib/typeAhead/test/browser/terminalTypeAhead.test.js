/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { stub, useFakeTimers } from 'sinon';
import { Emitter } from '../../../../../../base/common/event.js';
import { PredictionStats, TypeAheadAddon } from '../../browser/terminalTypeAheadAddon.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { DEFAULT_LOCAL_ECHO_EXCLUDE } from '../../common/terminalTypeAheadConfiguration.js';
import { isString } from '../../../../../../base/common/types.js';
const CSI = `\x1b[`;
var CursorMoveDirection;
(function (CursorMoveDirection) {
    CursorMoveDirection["Back"] = "D";
    CursorMoveDirection["Forwards"] = "C";
})(CursorMoveDirection || (CursorMoveDirection = {}));
suite('Workbench - Terminal Typeahead', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    suite('PredictionStats', () => {
        let stats;
        let add;
        let succeed;
        let fail;
        setup(() => {
            add = ds.add(new Emitter());
            succeed = ds.add(new Emitter());
            fail = ds.add(new Emitter());
            // eslint-disable-next-line local/code-no-any-casts
            stats = ds.add(new PredictionStats({
                onPredictionAdded: add.event,
                onPredictionSucceeded: succeed.event,
                onPredictionFailed: fail.event,
            }));
        });
        test('creates sane data', () => {
            const stubs = createPredictionStubs(5);
            const clock = useFakeTimers();
            try {
                for (const s of stubs) {
                    add.fire(s);
                }
                for (let i = 0; i < stubs.length; i++) {
                    clock.tick(100);
                    (i % 2 ? fail : succeed).fire(stubs[i]);
                }
                assert.strictEqual(stats.accuracy, 3 / 5);
                assert.strictEqual(stats.sampleSize, 5);
                assert.deepStrictEqual(stats.latency, {
                    count: 3,
                    min: 100,
                    max: 500,
                    median: 300
                });
            }
            finally {
                clock.restore();
            }
        });
        test('circular buffer', () => {
            const bufferSize = 24;
            const stubs = createPredictionStubs(bufferSize * 2);
            for (const s of stubs.slice(0, bufferSize)) {
                add.fire(s);
                succeed.fire(s);
            }
            assert.strictEqual(stats.accuracy, 1);
            for (const s of stubs.slice(bufferSize, bufferSize * 3 / 2)) {
                add.fire(s);
                fail.fire(s);
            }
            assert.strictEqual(stats.accuracy, 0.5);
            for (const s of stubs.slice(bufferSize * 3 / 2)) {
                add.fire(s);
                fail.fire(s);
            }
            assert.strictEqual(stats.accuracy, 0);
        });
    });
    suite('timeline', () => {
        let onBeforeProcessData;
        let publicLog;
        let config;
        let addon;
        const predictedHelloo = [
            `${CSI}?25l`, // hide cursor
            `${CSI}2;7H`, // move cursor
            'o', // new character
            `${CSI}2;8H`, // place cursor back at end of line
            `${CSI}?25h`, // show cursor
        ].join('');
        const expectProcessed = (input, output) => {
            const evt = { data: input };
            onBeforeProcessData.fire(evt);
            assert.strictEqual(JSON.stringify(evt.data), JSON.stringify(output));
        };
        setup(() => {
            onBeforeProcessData = ds.add(new Emitter());
            config = upcastPartial({
                localEchoStyle: 'italic',
                localEchoLatencyThreshold: 0,
                localEchoExcludePrograms: DEFAULT_LOCAL_ECHO_EXCLUDE,
            });
            publicLog = stub();
            addon = new TestTypeAheadAddon(upcastPartial({ onBeforeProcessData: onBeforeProcessData.event }), new TestConfigurationService({ terminal: { integrated: { ...config } } }), upcastPartial({ publicLog }));
            addon.unlockMakingPredictions();
        });
        teardown(() => {
            addon.dispose();
        });
        test('predicts a single character', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            t.expectWritten(`${CSI}3mo${CSI}23m`);
        });
        test('validates character prediction', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed('o', predictedHelloo);
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('validates zsh prediction (#112842)', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed('o', predictedHelloo);
            t.onData('x');
            expectProcessed('\box', [
                `${CSI}?25l`, // hide cursor
                `${CSI}2;8H`, // move cursor
                '\box', // new data
                `${CSI}2;9H`, // place cursor back at end of line
                `${CSI}?25h`, // show cursor
            ].join(''));
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('does not validate zsh prediction on differing lookbehindn (#112842)', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed('o', predictedHelloo);
            t.onData('x');
            expectProcessed('\bqx', [
                `${CSI}?25l`, // hide cursor
                `${CSI}2;8H`, // move cursor cursor
                `${CSI}X`, // delete character
                `${CSI}0m`, // reset style
                '\bqx', // new data
                `${CSI}?25h`, // show cursor
            ].join(''));
            assert.strictEqual(addon.stats?.accuracy, 0.5);
        });
        test('rolls back character prediction', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed('q', [
                `${CSI}?25l`, // hide cursor
                `${CSI}2;7H`, // move cursor cursor
                `${CSI}X`, // delete character
                `${CSI}0m`, // reset style
                'q', // new character
                `${CSI}?25h`, // show cursor
            ].join(''));
            assert.strictEqual(addon.stats?.accuracy, 0);
        });
        test('handles left arrow when we hit the boundary', () => {
            const t = ds.add(createMockTerminal({ lines: ['|'] }));
            addon.activate(t.terminal);
            addon.unlockNavigating();
            const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
            t.onData(`${CSI}${"D" /* CursorMoveDirection.Back */}`);
            t.expectWritten('');
            // Trigger rollback because we don't expect this data
            onBeforeProcessData.fire({ data: 'xy' });
            assert.strictEqual(addon.physicalCursor(t.terminal.buffer.active)?.x, 
            // The cursor should not have changed because we've hit the
            // boundary (start of prompt)
            cursorXBefore);
        });
        test('handles right arrow when we hit the boundary', () => {
            const t = ds.add(createMockTerminal({ lines: ['|'] }));
            addon.activate(t.terminal);
            addon.unlockNavigating();
            const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
            t.onData(`${CSI}${"C" /* CursorMoveDirection.Forwards */}`);
            t.expectWritten('');
            // Trigger rollback because we don't expect this data
            onBeforeProcessData.fire({ data: 'xy' });
            assert.strictEqual(addon.physicalCursor(t.terminal.buffer.active)?.x, 
            // The cursor should not have changed because we've hit the
            // boundary (end of prompt)
            cursorXBefore);
        });
        test('internal cursor state is reset when all predictions are undone', () => {
            const t = ds.add(createMockTerminal({ lines: ['|'] }));
            addon.activate(t.terminal);
            addon.unlockNavigating();
            const cursorXBefore = addon.physicalCursor(t.terminal.buffer.active)?.x;
            t.onData(`${CSI}${"D" /* CursorMoveDirection.Back */}`);
            t.expectWritten('');
            addon.undoAllPredictions();
            assert.strictEqual(addon.physicalCursor(t.terminal.buffer.active)?.x, 
            // The cursor should not have changed because we've hit the
            // boundary (start of prompt)
            cursorXBefore);
        });
        test('restores cursor graphics mode', () => {
            const t = ds.add(createMockTerminal({
                lines: ['hello|'],
                cursorAttrs: { isAttributeDefault: false, isBold: true, isFgPalette: true, getFgColor: 1 },
            }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed('q', [
                `${CSI}?25l`, // hide cursor
                `${CSI}2;7H`, // move cursor cursor
                `${CSI}X`, // delete character
                `${CSI}1;38;5;1m`, // reset style
                'q', // new character
                `${CSI}?25h`, // show cursor
            ].join(''));
            assert.strictEqual(addon.stats?.accuracy, 0);
        });
        test('validates against and applies graphics mode on predicted', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed(`${CSI}4mo`, [
                `${CSI}?25l`, // hide cursor
                `${CSI}2;7H`, // move cursor
                `${CSI}4m`, // new PTY's style
                'o', // new character
                `${CSI}2;8H`, // place cursor back at end of line
                `${CSI}?25h`, // show cursor
            ].join(''));
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('ignores cursor hides or shows', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('o');
            expectProcessed(`${CSI}?25lo${CSI}?25h`, [
                `${CSI}?25l`, // hide cursor from PTY
                `${CSI}?25l`, // hide cursor
                `${CSI}2;7H`, // move cursor
                'o', // new character
                `${CSI}?25h`, // show cursor from PTY
                `${CSI}2;8H`, // place cursor back at end of line
                `${CSI}?25h`, // show cursor
            ].join(''));
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('matches backspace at EOL (bash style)', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('\x7F');
            expectProcessed(`\b${CSI}K`, `\b${CSI}K`);
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('matches backspace at EOL (zsh style)', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('\x7F');
            expectProcessed('\b \b', '\b \b');
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('gradually matches backspace', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            t.onData('\x7F');
            expectProcessed('\b', '');
            expectProcessed(' \b', '\b \b');
            assert.strictEqual(addon.stats?.accuracy, 1);
        });
        test('restores old character after invalid backspace', () => {
            const t = ds.add(createMockTerminal({ lines: ['hel|lo'] }));
            addon.activate(t.terminal);
            addon.unlockNavigating();
            t.onData('\x7F');
            t.expectWritten(`${CSI}2;4H${CSI}X`);
            expectProcessed('x', `${CSI}?25l${CSI}0ml${CSI}2;5H${CSI}0mx${CSI}?25h`);
            assert.strictEqual(addon.stats?.accuracy, 0);
        });
        test('waits for validation before deleting to left of cursor', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            // initially should not backspace (until the server confirms it)
            t.onData('\x7F');
            t.expectWritten('');
            expectProcessed('\b \b', '\b \b');
            t.cursor.x--;
            // enter input on the column...
            t.onData('o');
            onBeforeProcessData.fire({ data: 'o' });
            t.cursor.x++;
            t.clearWritten();
            // now that the column is 'unlocked', we should be able to predict backspace on it
            t.onData('\x7F');
            t.expectWritten(`${CSI}2;6H${CSI}X`);
        });
        test('waits for first valid prediction on a line', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.lockMakingPredictions();
            addon.activate(t.terminal);
            t.onData('o');
            t.expectWritten('');
            expectProcessed('o', 'o');
            t.onData('o');
            t.expectWritten(`${CSI}3mo${CSI}23m`);
        });
        test('disables on title change', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.activate(t.terminal);
            addon.reevaluateNow();
            assert.strictEqual(addon.isShowing, true, 'expected to show initially');
            t.onTitleChange.fire('foo - VIM.exe');
            addon.reevaluateNow();
            assert.strictEqual(addon.isShowing, false, 'expected to hide when vim is open');
            t.onTitleChange.fire('foo - git.exe');
            addon.reevaluateNow();
            assert.strictEqual(addon.isShowing, true, 'expected to show again after vim closed');
        });
        test('adds line wrap prediction even if behind a boundary', () => {
            const t = ds.add(createMockTerminal({ lines: ['hello|'] }));
            addon.lockMakingPredictions();
            addon.activate(t.terminal);
            t.onData('hi'.repeat(50));
            t.expectWritten('');
            expectProcessed('hi', [
                `${CSI}?25l`, // hide cursor
                'hi', // this greeting characters
                ...new Array(36).fill(`${CSI}3mh${CSI}23m${CSI}3mi${CSI}23m`), // rest of the greetings that fit on this line
                `${CSI}2;81H`, // move to end of line
                `${CSI}?25h`
            ].join(''));
        });
    });
});
class TestTypeAheadAddon extends TypeAheadAddon {
    unlockMakingPredictions() {
        this._lastRow = { y: 1, startingX: 100, endingX: 100, charState: 2 /* CharPredictState.Validated */ };
    }
    lockMakingPredictions() {
        this._lastRow = undefined;
    }
    unlockNavigating() {
        this._lastRow = { y: 1, startingX: 1, endingX: 1, charState: 2 /* CharPredictState.Validated */ };
    }
    reevaluateNow() {
        this._reevaluatePredictorStateNow(this.stats, this._timeline);
    }
    get isShowing() {
        return !!this._timeline?.isShowingPredictions;
    }
    undoAllPredictions() {
        this._timeline?.undoAllPredictions();
    }
    physicalCursor(buffer) {
        return this._timeline?.physicalCursor(buffer);
    }
    tentativeCursor(buffer) {
        return this._timeline?.tentativeCursor(buffer);
    }
}
function upcastPartial(v) {
    return v;
}
function createPredictionStubs(n) {
    return new Array(n).fill(0).map(stubPrediction);
}
function stubPrediction() {
    return {
        apply: () => '',
        rollback: () => '',
        matches: () => 0,
        rollForwards: () => '',
    };
}
function createMockTerminal({ lines, cursorAttrs }) {
    const ds = new DisposableStore();
    const written = [];
    const cursor = { y: 1, x: 1 };
    const onTitleChange = ds.add(new Emitter());
    const onData = ds.add(new Emitter());
    const csiEmitter = ds.add(new Emitter());
    for (let y = 0; y < lines.length; y++) {
        const line = lines[y];
        if (line.includes('|')) {
            cursor.y = y + 1;
            cursor.x = line.indexOf('|') + 1;
            lines[y] = line.replace('|', ''); // CodeQL [SM02383] replacing the first occurrence is intended
            break;
        }
    }
    return {
        written,
        cursor,
        expectWritten: (s) => {
            assert.strictEqual(JSON.stringify(written.join('')), JSON.stringify(s));
            written.splice(0, written.length);
        },
        clearWritten: () => written.splice(0, written.length),
        onData: (s) => onData.fire(s),
        csiEmitter,
        onTitleChange,
        dispose: () => ds.dispose(),
        terminal: {
            cols: 80,
            rows: 5,
            onResize: new Emitter().event,
            onData: onData.event,
            onTitleChange: onTitleChange.event,
            parser: {
                registerCsiHandler(_, callback) {
                    ds.add(csiEmitter.event(callback));
                },
            },
            write(line) {
                written.push(line);
            },
            _core: {
                _inputHandler: {
                    _curAttrData: mockCell('', cursorAttrs)
                },
                writeSync() {
                }
            },
            buffer: {
                active: {
                    type: 'normal',
                    baseY: 0,
                    get cursorY() { return cursor.y; },
                    get cursorX() { return cursor.x; },
                    getLine(y) {
                        const s = lines[y - 1] || '';
                        return {
                            length: s.length,
                            getCell: (x) => mockCell(s[x - 1] || ''),
                            translateToString: (trim, start = 0, end = s.length) => {
                                const out = s.slice(start, end);
                                return trim ? out.trimRight() : out;
                            },
                        };
                    },
                }
            }
        }
    };
}
function mockCell(char, attrs = {}) {
    return new Proxy({}, {
        get(_, prop) {
            if (isString(prop) && attrs.hasOwnProperty(prop)) {
                return () => attrs[prop];
            }
            switch (prop) {
                case 'getWidth':
                    return () => 1;
                case 'getChars':
                    return () => char;
                case 'getCode':
                    return () => char.charCodeAt(0) || 0;
                case 'isAttributeDefault':
                    return () => true;
                default:
                    return String(prop).startsWith('is') ? (() => false) : (() => 0);
            }
        },
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxUeXBlQWhlYWQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi90eXBlQWhlYWQvdGVzdC9icm93c2VyL3Rlcm1pbmFsVHlwZUFoZWFkLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBRTVCLE9BQU8sRUFBYSxJQUFJLEVBQUUsYUFBYSxFQUFFLE1BQU0sT0FBTyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNqRSxPQUFPLEVBQWlDLGVBQWUsRUFBRSxjQUFjLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUd6SCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDN0UsT0FBTyxFQUFFLDBCQUEwQixFQUF3QyxNQUFNLGdEQUFnRCxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVsRSxNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUM7QUFFcEIsSUFBVyxtQkFHVjtBQUhELFdBQVcsbUJBQW1CO0lBQzdCLGlDQUFVLENBQUE7SUFDVixxQ0FBYyxDQUFBO0FBQ2YsQ0FBQyxFQUhVLG1CQUFtQixLQUFuQixtQkFBbUIsUUFHN0I7QUFFRCxLQUFLLENBQUMsZ0NBQWdDLEVBQUUsR0FBRyxFQUFFO0lBQzVDLE1BQU0sRUFBRSxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFckQsS0FBSyxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUM3QixJQUFJLEtBQXNCLENBQUM7UUFDM0IsSUFBSSxHQUF5QixDQUFDO1FBQzlCLElBQUksT0FBNkIsQ0FBQztRQUNsQyxJQUFJLElBQTBCLENBQUM7UUFFL0IsS0FBSyxDQUFDLEdBQUcsRUFBRTtZQUNWLEdBQUcsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFlLENBQUMsQ0FBQztZQUN6QyxPQUFPLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sRUFBZSxDQUFDLENBQUM7WUFDN0MsSUFBSSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQWUsQ0FBQyxDQUFDO1lBRTFDLG1EQUFtRDtZQUNuRCxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxJQUFJLGVBQWUsQ0FBQztnQkFDbEMsaUJBQWlCLEVBQUUsR0FBRyxDQUFDLEtBQUs7Z0JBQzVCLHFCQUFxQixFQUFFLE9BQU8sQ0FBQyxLQUFLO2dCQUNwQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsS0FBSzthQUN2QixDQUFDLENBQUMsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtZQUM5QixNQUFNLEtBQUssR0FBRyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxNQUFNLEtBQUssR0FBRyxhQUFhLEVBQUUsQ0FBQztZQUM5QixJQUFJLENBQUM7Z0JBQ0osS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQztvQkFBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLENBQUM7Z0JBRXZDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQ3ZDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ2hCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pDLENBQUM7Z0JBRUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUU7b0JBQ3JDLEtBQUssRUFBRSxDQUFDO29CQUNSLEdBQUcsRUFBRSxHQUFHO29CQUNSLEdBQUcsRUFBRSxHQUFHO29CQUNSLE1BQU0sRUFBRSxHQUFHO2lCQUNYLENBQUMsQ0FBQztZQUNKLENBQUM7b0JBQVMsQ0FBQztnQkFDVixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDakIsQ0FBQztRQUNGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtZQUM1QixNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUM7WUFDdEIsTUFBTSxLQUFLLEdBQUcscUJBQXFCLENBQUMsVUFBVSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRXBELEtBQUssTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLEVBQUUsQ0FBQztnQkFBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBQyxDQUFDO1lBQzdFLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV0QyxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLFVBQVUsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFBQyxDQUFDO1lBQzNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUV4QyxLQUFLLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDL0UsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7SUFFSCxLQUFLLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtRQUN0QixJQUFJLG1CQUFxRCxDQUFDO1FBQzFELElBQUksU0FBb0IsQ0FBQztRQUN6QixJQUFJLE1BQXVDLENBQUM7UUFDNUMsSUFBSSxLQUF5QixDQUFDO1FBRTlCLE1BQU0sZUFBZSxHQUFHO1lBQ3ZCLEdBQUcsR0FBRyxNQUFNLEVBQUUsY0FBYztZQUM1QixHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7WUFDNUIsR0FBRyxFQUFFLGdCQUFnQjtZQUNyQixHQUFHLEdBQUcsTUFBTSxFQUFFLG1DQUFtQztZQUNqRCxHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7U0FDNUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFWCxNQUFNLGVBQWUsR0FBRyxDQUFDLEtBQWEsRUFBRSxNQUFjLEVBQUUsRUFBRTtZQUN6RCxNQUFNLEdBQUcsR0FBRyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUM1QixtQkFBbUIsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDOUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDdEUsQ0FBQyxDQUFDO1FBRUYsS0FBSyxDQUFDLEdBQUcsRUFBRTtZQUNWLG1CQUFtQixHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxPQUFPLEVBQTJCLENBQUMsQ0FBQztZQUNyRSxNQUFNLEdBQUcsYUFBYSxDQUFrQztnQkFDdkQsY0FBYyxFQUFFLFFBQVE7Z0JBQ3hCLHlCQUF5QixFQUFFLENBQUM7Z0JBQzVCLHdCQUF3QixFQUFFLDBCQUEwQjthQUNwRCxDQUFDLENBQUM7WUFDSCxTQUFTLEdBQUcsSUFBSSxFQUFFLENBQUM7WUFDbkIsS0FBSyxHQUFHLElBQUksa0JBQWtCLENBQzdCLGFBQWEsQ0FBMEIsRUFBRSxtQkFBbUIsRUFBRSxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUMxRixJQUFJLHdCQUF3QixDQUFDLEVBQUUsUUFBUSxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsR0FBRyxNQUFNLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFDekUsYUFBYSxDQUFvQixFQUFFLFNBQVMsRUFBRSxDQUFDLENBQy9DLENBQUM7WUFDRixLQUFLLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQztRQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7WUFDYixLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDakIsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO1lBQ3hDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1RCxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtZQUMzQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNkLGVBQWUsQ0FBQyxHQUFHLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDdEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7WUFDL0MsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDZCxlQUFlLENBQUMsR0FBRyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBRXRDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDZCxlQUFlLENBQUMsTUFBTSxFQUFFO2dCQUN2QixHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7Z0JBQzVCLEdBQUcsR0FBRyxNQUFNLEVBQUUsY0FBYztnQkFDNUIsTUFBTSxFQUFFLFdBQVc7Z0JBQ25CLEdBQUcsR0FBRyxNQUFNLEVBQUUsbUNBQW1DO2dCQUNqRCxHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7YUFDNUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNaLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscUVBQXFFLEVBQUUsR0FBRyxFQUFFO1lBQ2hGLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1RCxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsZUFBZSxDQUFDLEdBQUcsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUV0QyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsZUFBZSxDQUFDLE1BQU0sRUFBRTtnQkFDdkIsR0FBRyxHQUFHLE1BQU0sRUFBRSxjQUFjO2dCQUM1QixHQUFHLEdBQUcsTUFBTSxFQUFFLHFCQUFxQjtnQkFDbkMsR0FBRyxHQUFHLEdBQUcsRUFBRSxtQkFBbUI7Z0JBQzlCLEdBQUcsR0FBRyxJQUFJLEVBQUUsY0FBYztnQkFDMUIsTUFBTSxFQUFFLFdBQVc7Z0JBQ25CLEdBQUcsR0FBRyxNQUFNLEVBQUUsY0FBYzthQUM1QixDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ1osTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNoRCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxpQ0FBaUMsRUFBRSxHQUFHLEVBQUU7WUFDNUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFZCxlQUFlLENBQUMsR0FBRyxFQUFFO2dCQUNwQixHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7Z0JBQzVCLEdBQUcsR0FBRyxNQUFNLEVBQUUscUJBQXFCO2dCQUNuQyxHQUFHLEdBQUcsR0FBRyxFQUFFLG1CQUFtQjtnQkFDOUIsR0FBRyxHQUFHLElBQUksRUFBRSxjQUFjO2dCQUMxQixHQUFHLEVBQUUsZ0JBQWdCO2dCQUNyQixHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7YUFDNUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNaLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3hELE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN2RCxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQixLQUFLLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztZQUV6QixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUUsQ0FBQztZQUN6RSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsR0FBRyxHQUFHLGtDQUF3QixFQUFFLENBQUMsQ0FBQztZQUM5QyxDQUFDLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBRXBCLHFEQUFxRDtZQUNyRCxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUV6QyxNQUFNLENBQUMsV0FBVyxDQUNqQixLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDakQsMkRBQTJEO1lBQzNELDZCQUE2QjtZQUM3QixhQUFhLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7WUFDekQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3ZELEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzNCLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBRXpCLE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBRSxDQUFDO1lBQ3pFLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxHQUFHLEdBQUcsc0NBQTRCLEVBQUUsQ0FBQyxDQUFDO1lBQ2xELENBQUMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFcEIscURBQXFEO1lBQ3JELG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBRXpDLE1BQU0sQ0FBQyxXQUFXLENBQ2pCLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztZQUNqRCwyREFBMkQ7WUFDM0QsMkJBQTJCO1lBQzNCLGFBQWEsQ0FBQyxDQUFDO1FBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdFQUFnRSxFQUFFLEdBQUcsRUFBRTtZQUMzRSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDdkQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0IsS0FBSyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFFekIsTUFBTSxhQUFhLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFFLENBQUM7WUFDekUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLEdBQUcsR0FBRyxrQ0FBd0IsRUFBRSxDQUFDLENBQUM7WUFDOUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwQixLQUFLLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUUzQixNQUFNLENBQUMsV0FBVyxDQUNqQixLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDakQsMkRBQTJEO1lBQzNELDZCQUE2QjtZQUM3QixhQUFhLENBQUMsQ0FBQztRQUNqQixDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQywrQkFBK0IsRUFBRSxHQUFHLEVBQUU7WUFDMUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQztnQkFDbkMsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDO2dCQUNqQixXQUFXLEVBQUUsRUFBRSxrQkFBa0IsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxDQUFDLEVBQUU7YUFDMUYsQ0FBQyxDQUFDLENBQUM7WUFDSixLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRWQsZUFBZSxDQUFDLEdBQUcsRUFBRTtnQkFDcEIsR0FBRyxHQUFHLE1BQU0sRUFBRSxjQUFjO2dCQUM1QixHQUFHLEdBQUcsTUFBTSxFQUFFLHFCQUFxQjtnQkFDbkMsR0FBRyxHQUFHLEdBQUcsRUFBRSxtQkFBbUI7Z0JBQzlCLEdBQUcsR0FBRyxXQUFXLEVBQUUsY0FBYztnQkFDakMsR0FBRyxFQUFFLGdCQUFnQjtnQkFDckIsR0FBRyxHQUFHLE1BQU0sRUFBRSxjQUFjO2FBQzVCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDWixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBEQUEwRCxFQUFFLEdBQUcsRUFBRTtZQUNyRSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNkLGVBQWUsQ0FBQyxHQUFHLEdBQUcsS0FBSyxFQUFFO2dCQUM1QixHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7Z0JBQzVCLEdBQUcsR0FBRyxNQUFNLEVBQUUsY0FBYztnQkFDNUIsR0FBRyxHQUFHLElBQUksRUFBRSxrQkFBa0I7Z0JBQzlCLEdBQUcsRUFBRSxnQkFBZ0I7Z0JBQ3JCLEdBQUcsR0FBRyxNQUFNLEVBQUUsbUNBQW1DO2dCQUNqRCxHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7YUFDNUIsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNaLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUMsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsK0JBQStCLEVBQUUsR0FBRyxFQUFFO1lBQzFDLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1RCxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUMzQixDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsZUFBZSxDQUFDLEdBQUcsR0FBRyxRQUFRLEdBQUcsTUFBTSxFQUFFO2dCQUN4QyxHQUFHLEdBQUcsTUFBTSxFQUFFLHVCQUF1QjtnQkFDckMsR0FBRyxHQUFHLE1BQU0sRUFBRSxjQUFjO2dCQUM1QixHQUFHLEdBQUcsTUFBTSxFQUFFLGNBQWM7Z0JBQzVCLEdBQUcsRUFBRSxnQkFBZ0I7Z0JBQ3JCLEdBQUcsR0FBRyxNQUFNLEVBQUUsdUJBQXVCO2dCQUNyQyxHQUFHLEdBQUcsTUFBTSxFQUFFLG1DQUFtQztnQkFDakQsR0FBRyxHQUFHLE1BQU0sRUFBRSxjQUFjO2FBQzVCLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDWixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtZQUNsRCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNqQixlQUFlLENBQUMsS0FBSyxHQUFHLEdBQUcsRUFBRSxLQUFLLEdBQUcsR0FBRyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxzQ0FBc0MsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzNCLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakIsZUFBZSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztZQUNsQyxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZCQUE2QixFQUFFLEdBQUcsRUFBRTtZQUN4QyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDM0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNqQixlQUFlLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzFCLGVBQWUsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDaEMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzVELEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzNCLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO1lBQ3pCLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEdBQUcsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1lBQ3JDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxHQUFHLE9BQU8sR0FBRyxNQUFNLEdBQUcsT0FBTyxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQztZQUN6RSxNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQzlDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsRUFBRTtZQUNuRSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFM0IsZ0VBQWdFO1lBQ2hFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNwQixlQUFlLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ2xDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFFYiwrQkFBK0I7WUFDL0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNkLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDYixDQUFDLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFakIsa0ZBQWtGO1lBQ2xGLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakIsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEdBQUcsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDRDQUE0QyxFQUFFLEdBQUcsRUFBRTtZQUN2RCxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7WUFDOUIsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFM0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNkLENBQUMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDcEIsZUFBZSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUUxQixDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxHQUFHLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtZQUNyQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDNUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFM0IsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxJQUFJLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztZQUV4RSxDQUFDLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUN0QyxLQUFLLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxtQ0FBbUMsQ0FBQyxDQUFDO1lBRWhGLENBQUMsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3RDLEtBQUssQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN0QixNQUFNLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLHlDQUF5QyxDQUFDLENBQUM7UUFDdEYsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFO1lBQ2hFLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUM1RCxLQUFLLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM5QixLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUUzQixDQUFDLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUMxQixDQUFDLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3BCLGVBQWUsQ0FBQyxJQUFJLEVBQUU7Z0JBQ3JCLEdBQUcsR0FBRyxNQUFNLEVBQUUsY0FBYztnQkFDNUIsSUFBSSxFQUFFLDJCQUEyQjtnQkFDakMsR0FBRyxJQUFJLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLE1BQU0sR0FBRyxNQUFNLEdBQUcsTUFBTSxHQUFHLEtBQUssQ0FBQyxFQUFFLDhDQUE4QztnQkFDN0csR0FBRyxHQUFHLE9BQU8sRUFBRSxzQkFBc0I7Z0JBQ3JDLEdBQUcsR0FBRyxNQUFNO2FBQ1osQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDLENBQUMsQ0FBQztBQUVILE1BQU0sa0JBQW1CLFNBQVEsY0FBYztJQUM5Qyx1QkFBdUI7UUFDdEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLFNBQVMsb0NBQTRCLEVBQUUsQ0FBQztJQUMvRixDQUFDO0lBRUQscUJBQXFCO1FBQ3BCLElBQUksQ0FBQyxRQUFRLEdBQUcsU0FBUyxDQUFDO0lBQzNCLENBQUM7SUFFRCxnQkFBZ0I7UUFDZixJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxTQUFTLEVBQUUsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsU0FBUyxvQ0FBNEIsRUFBRSxDQUFDO0lBQzNGLENBQUM7SUFFRCxhQUFhO1FBQ1osSUFBSSxDQUFDLDRCQUE0QixDQUFDLElBQUksQ0FBQyxLQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVUsQ0FBQyxDQUFDO0lBQ2pFLENBQUM7SUFFRCxJQUFJLFNBQVM7UUFDWixPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLG9CQUFvQixDQUFDO0lBQy9DLENBQUM7SUFFRCxrQkFBa0I7UUFDakIsSUFBSSxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsRUFBRSxDQUFDO0lBQ3RDLENBQUM7SUFFRCxjQUFjLENBQUMsTUFBZTtRQUM3QixPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQy9DLENBQUM7SUFFRCxlQUFlLENBQUMsTUFBZTtRQUM5QixPQUFPLElBQUksQ0FBQyxTQUFTLEVBQUUsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2hELENBQUM7Q0FDRDtBQUVELFNBQVMsYUFBYSxDQUFJLENBQWE7SUFDdEMsT0FBTyxDQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxDQUFTO0lBQ3ZDLE9BQU8sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsQ0FBQztBQUNqRCxDQUFDO0FBRUQsU0FBUyxjQUFjO0lBQ3RCLE9BQU87UUFDTixLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRTtRQUNmLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1FBQ2xCLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ2hCLFlBQVksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFO0tBQ3RCLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyxrQkFBa0IsQ0FBQyxFQUFFLEtBQUssRUFBRSxXQUFXLEVBRy9DO0lBQ0EsTUFBTSxFQUFFLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztJQUNqQyxNQUFNLE9BQU8sR0FBYSxFQUFFLENBQUM7SUFDN0IsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztJQUM5QixNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFVLENBQUMsQ0FBQztJQUNwRCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFVLENBQUMsQ0FBQztJQUM3QyxNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksT0FBTyxFQUFZLENBQUMsQ0FBQztJQUVuRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3ZDLE1BQU0sSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0QixJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN4QixNQUFNLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDakIsTUFBTSxDQUFDLENBQUMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNqQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyw4REFBOEQ7WUFDaEcsTUFBTTtRQUNQLENBQUM7SUFDRixDQUFDO0lBRUQsT0FBTztRQUNOLE9BQU87UUFDUCxNQUFNO1FBQ04sYUFBYSxFQUFFLENBQUMsQ0FBUyxFQUFFLEVBQUU7WUFDNUIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25DLENBQUM7UUFDRCxZQUFZLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQztRQUNyRCxNQUFNLEVBQUUsQ0FBQyxDQUFTLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3JDLFVBQVU7UUFDVixhQUFhO1FBQ2IsT0FBTyxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUU7UUFDM0IsUUFBUSxFQUFFO1lBQ1QsSUFBSSxFQUFFLEVBQUU7WUFDUixJQUFJLEVBQUUsQ0FBQztZQUNQLFFBQVEsRUFBRSxJQUFJLE9BQU8sRUFBUSxDQUFDLEtBQUs7WUFDbkMsTUFBTSxFQUFFLE1BQU0sQ0FBQyxLQUFLO1lBQ3BCLGFBQWEsRUFBRSxhQUFhLENBQUMsS0FBSztZQUNsQyxNQUFNLEVBQUU7Z0JBQ1Asa0JBQWtCLENBQUMsQ0FBVSxFQUFFLFFBQW9CO29CQUNsRCxFQUFFLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDcEMsQ0FBQzthQUNEO1lBQ0QsS0FBSyxDQUFDLElBQVk7Z0JBQ2pCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDcEIsQ0FBQztZQUNELEtBQUssRUFBRTtnQkFDTixhQUFhLEVBQUU7b0JBQ2QsWUFBWSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEVBQUUsV0FBVyxDQUFDO2lCQUN2QztnQkFDRCxTQUFTO2dCQUVULENBQUM7YUFDRDtZQUNELE1BQU0sRUFBRTtnQkFDUCxNQUFNLEVBQUU7b0JBQ1AsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsS0FBSyxFQUFFLENBQUM7b0JBQ1IsSUFBSSxPQUFPLEtBQUssT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEMsSUFBSSxPQUFPLEtBQUssT0FBTyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEMsT0FBTyxDQUFDLENBQVM7d0JBQ2hCLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO3dCQUM3QixPQUFPOzRCQUNOLE1BQU0sRUFBRSxDQUFDLENBQUMsTUFBTTs0QkFDaEIsT0FBTyxFQUFFLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7NEJBQ2hELGlCQUFpQixFQUFFLENBQUMsSUFBYSxFQUFFLEtBQUssR0FBRyxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtnQ0FDL0QsTUFBTSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0NBQ2hDLE9BQU8sSUFBSSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQzs0QkFDckMsQ0FBQzt5QkFDRCxDQUFDO29CQUNILENBQUM7aUJBQ0Q7YUFDRDtTQUNzQjtLQUN4QixDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsUUFBUSxDQUFDLElBQVksRUFBRSxRQUFvQyxFQUFFO0lBQ3JFLE9BQU8sSUFBSSxLQUFLLENBQUMsRUFBRSxFQUFFO1FBQ3BCLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSTtZQUNWLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDbEQsT0FBTyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDMUIsQ0FBQztZQUVELFFBQVEsSUFBSSxFQUFFLENBQUM7Z0JBQ2QsS0FBSyxVQUFVO29CQUNkLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUNoQixLQUFLLFVBQVU7b0JBQ2QsT0FBTyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUM7Z0JBQ25CLEtBQUssU0FBUztvQkFDYixPQUFPLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUN0QyxLQUFLLG9CQUFvQjtvQkFDeEIsT0FBTyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUM7Z0JBQ25CO29CQUNDLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNuRSxDQUFDO1FBQ0YsQ0FBQztLQUNELENBQUMsQ0FBQztBQUNKLENBQUMifQ==