/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var ChCode;
(function (ChCode) {
    ChCode[ChCode["BOM"] = 65279] = "BOM";
    ChCode[ChCode["SPACE"] = 32] = "SPACE";
    ChCode[ChCode["TAB"] = 9] = "TAB";
    ChCode[ChCode["CARRIAGE_RETURN"] = 13] = "CARRIAGE_RETURN";
    ChCode[ChCode["LINE_FEED"] = 10] = "LINE_FEED";
    ChCode[ChCode["SLASH"] = 47] = "SLASH";
    ChCode[ChCode["LESS_THAN"] = 60] = "LESS_THAN";
    ChCode[ChCode["QUESTION_MARK"] = 63] = "QUESTION_MARK";
    ChCode[ChCode["EXCLAMATION_MARK"] = 33] = "EXCLAMATION_MARK";
})(ChCode || (ChCode = {}));
var State;
(function (State) {
    State[State["ROOT_STATE"] = 0] = "ROOT_STATE";
    State[State["DICT_STATE"] = 1] = "DICT_STATE";
    State[State["ARR_STATE"] = 2] = "ARR_STATE";
})(State || (State = {}));
/**
 * A very fast plist parser
 */
export function parse(content) {
    return _parse(content, null, null);
}
function _parse(content, filename, locationKeyName) {
    const len = content.length;
    let pos = 0;
    let line = 1;
    let char = 0;
    // Skip UTF8 BOM
    if (len > 0 && content.charCodeAt(0) === 65279 /* ChCode.BOM */) {
        pos = 1;
    }
    function advancePosBy(by) {
        if (locationKeyName === null) {
            pos = pos + by;
        }
        else {
            while (by > 0) {
                const chCode = content.charCodeAt(pos);
                if (chCode === 10 /* ChCode.LINE_FEED */) {
                    pos++;
                    line++;
                    char = 0;
                }
                else {
                    pos++;
                    char++;
                }
                by--;
            }
        }
    }
    function advancePosTo(to) {
        if (locationKeyName === null) {
            pos = to;
        }
        else {
            advancePosBy(to - pos);
        }
    }
    function skipWhitespace() {
        while (pos < len) {
            const chCode = content.charCodeAt(pos);
            if (chCode !== 32 /* ChCode.SPACE */ && chCode !== 9 /* ChCode.TAB */ && chCode !== 13 /* ChCode.CARRIAGE_RETURN */ && chCode !== 10 /* ChCode.LINE_FEED */) {
                break;
            }
            advancePosBy(1);
        }
    }
    function advanceIfStartsWith(str) {
        if (content.substr(pos, str.length) === str) {
            advancePosBy(str.length);
            return true;
        }
        return false;
    }
    function advanceUntil(str) {
        const nextOccurence = content.indexOf(str, pos);
        if (nextOccurence !== -1) {
            advancePosTo(nextOccurence + str.length);
        }
        else {
            // EOF
            advancePosTo(len);
        }
    }
    function captureUntil(str) {
        const nextOccurence = content.indexOf(str, pos);
        if (nextOccurence !== -1) {
            const r = content.substring(pos, nextOccurence);
            advancePosTo(nextOccurence + str.length);
            return r;
        }
        else {
            // EOF
            const r = content.substr(pos);
            advancePosTo(len);
            return r;
        }
    }
    let state = 0 /* State.ROOT_STATE */;
    let cur = null;
    const stateStack = [];
    const objStack = [];
    let curKey = null;
    function pushState(newState, newCur) {
        stateStack.push(state);
        objStack.push(cur);
        state = newState;
        cur = newCur;
    }
    function popState() {
        if (stateStack.length === 0) {
            return fail('illegal state stack');
        }
        state = stateStack.pop();
        cur = objStack.pop();
    }
    function fail(msg) {
        throw new Error('Near offset ' + pos + ': ' + msg + ' ~~~' + content.substr(pos, 50) + '~~~');
    }
    const dictState = {
        enterDict: function () {
            if (curKey === null) {
                return fail('missing <key>');
            }
            const newDict = {};
            if (locationKeyName !== null) {
                newDict[locationKeyName] = {
                    filename: filename,
                    line: line,
                    char: char
                };
            }
            cur[curKey] = newDict;
            curKey = null;
            pushState(1 /* State.DICT_STATE */, newDict);
        },
        enterArray: function () {
            if (curKey === null) {
                return fail('missing <key>');
            }
            const newArr = [];
            cur[curKey] = newArr;
            curKey = null;
            pushState(2 /* State.ARR_STATE */, newArr);
        }
    };
    const arrState = {
        enterDict: function () {
            const newDict = {};
            if (locationKeyName !== null) {
                newDict[locationKeyName] = {
                    filename: filename,
                    line: line,
                    char: char
                };
            }
            cur.push(newDict);
            pushState(1 /* State.DICT_STATE */, newDict);
        },
        enterArray: function () {
            const newArr = [];
            cur.push(newArr);
            pushState(2 /* State.ARR_STATE */, newArr);
        }
    };
    function enterDict() {
        if (state === 1 /* State.DICT_STATE */) {
            dictState.enterDict();
        }
        else if (state === 2 /* State.ARR_STATE */) {
            arrState.enterDict();
        }
        else { // ROOT_STATE
            cur = {};
            if (locationKeyName !== null) {
                cur[locationKeyName] = {
                    filename: filename,
                    line: line,
                    char: char
                };
            }
            pushState(1 /* State.DICT_STATE */, cur);
        }
    }
    function leaveDict() {
        if (state === 1 /* State.DICT_STATE */) {
            popState();
        }
        else if (state === 2 /* State.ARR_STATE */) {
            return fail('unexpected </dict>');
        }
        else { // ROOT_STATE
            return fail('unexpected </dict>');
        }
    }
    function enterArray() {
        if (state === 1 /* State.DICT_STATE */) {
            dictState.enterArray();
        }
        else if (state === 2 /* State.ARR_STATE */) {
            arrState.enterArray();
        }
        else { // ROOT_STATE
            cur = [];
            pushState(2 /* State.ARR_STATE */, cur);
        }
    }
    function leaveArray() {
        if (state === 1 /* State.DICT_STATE */) {
            return fail('unexpected </array>');
        }
        else if (state === 2 /* State.ARR_STATE */) {
            popState();
        }
        else { // ROOT_STATE
            return fail('unexpected </array>');
        }
    }
    function acceptKey(val) {
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey !== null) {
                return fail('too many <key>');
            }
            curKey = val;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            return fail('unexpected <key>');
        }
        else { // ROOT_STATE
            return fail('unexpected <key>');
        }
    }
    function acceptString(val) {
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey === null) {
                return fail('missing <key>');
            }
            cur[curKey] = val;
            curKey = null;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            cur.push(val);
        }
        else { // ROOT_STATE
            cur = val;
        }
    }
    function acceptReal(val) {
        if (isNaN(val)) {
            return fail('cannot parse float');
        }
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey === null) {
                return fail('missing <key>');
            }
            cur[curKey] = val;
            curKey = null;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            cur.push(val);
        }
        else { // ROOT_STATE
            cur = val;
        }
    }
    function acceptInteger(val) {
        if (isNaN(val)) {
            return fail('cannot parse integer');
        }
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey === null) {
                return fail('missing <key>');
            }
            cur[curKey] = val;
            curKey = null;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            cur.push(val);
        }
        else { // ROOT_STATE
            cur = val;
        }
    }
    function acceptDate(val) {
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey === null) {
                return fail('missing <key>');
            }
            cur[curKey] = val;
            curKey = null;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            cur.push(val);
        }
        else { // ROOT_STATE
            cur = val;
        }
    }
    function acceptData(val) {
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey === null) {
                return fail('missing <key>');
            }
            cur[curKey] = val;
            curKey = null;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            cur.push(val);
        }
        else { // ROOT_STATE
            cur = val;
        }
    }
    function acceptBool(val) {
        if (state === 1 /* State.DICT_STATE */) {
            if (curKey === null) {
                return fail('missing <key>');
            }
            cur[curKey] = val;
            curKey = null;
        }
        else if (state === 2 /* State.ARR_STATE */) {
            cur.push(val);
        }
        else { // ROOT_STATE
            cur = val;
        }
    }
    function escapeVal(str) {
        return str.replace(/&#([0-9]+);/g, function (_, m0) {
            return String.fromCodePoint(parseInt(m0, 10));
        }).replace(/&#x([0-9a-f]+);/g, function (_, m0) {
            return String.fromCodePoint(parseInt(m0, 16));
        }).replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, function (_) {
            switch (_) {
                case '&amp;': return '&';
                case '&lt;': return '<';
                case '&gt;': return '>';
                case '&quot;': return '"';
                case '&apos;': return '\'';
            }
            return _;
        });
    }
    function parseOpenTag() {
        let r = captureUntil('>');
        let isClosed = false;
        if (r.charCodeAt(r.length - 1) === 47 /* ChCode.SLASH */) {
            isClosed = true;
            r = r.substring(0, r.length - 1);
        }
        return {
            name: r.trim(),
            isClosed: isClosed
        };
    }
    function parseTagValue(tag) {
        if (tag.isClosed) {
            return '';
        }
        const val = captureUntil('</');
        advanceUntil('>');
        return escapeVal(val);
    }
    while (pos < len) {
        skipWhitespace();
        if (pos >= len) {
            break;
        }
        const chCode = content.charCodeAt(pos);
        advancePosBy(1);
        if (chCode !== 60 /* ChCode.LESS_THAN */) {
            return fail('expected <');
        }
        if (pos >= len) {
            return fail('unexpected end of input');
        }
        const peekChCode = content.charCodeAt(pos);
        if (peekChCode === 63 /* ChCode.QUESTION_MARK */) {
            advancePosBy(1);
            advanceUntil('?>');
            continue;
        }
        if (peekChCode === 33 /* ChCode.EXCLAMATION_MARK */) {
            advancePosBy(1);
            if (advanceIfStartsWith('--')) {
                advanceUntil('-->');
                continue;
            }
            advanceUntil('>');
            continue;
        }
        if (peekChCode === 47 /* ChCode.SLASH */) {
            advancePosBy(1);
            skipWhitespace();
            if (advanceIfStartsWith('plist')) {
                advanceUntil('>');
                continue;
            }
            if (advanceIfStartsWith('dict')) {
                advanceUntil('>');
                leaveDict();
                continue;
            }
            if (advanceIfStartsWith('array')) {
                advanceUntil('>');
                leaveArray();
                continue;
            }
            return fail('unexpected closed tag');
        }
        const tag = parseOpenTag();
        switch (tag.name) {
            case 'dict':
                enterDict();
                if (tag.isClosed) {
                    leaveDict();
                }
                continue;
            case 'array':
                enterArray();
                if (tag.isClosed) {
                    leaveArray();
                }
                continue;
            case 'key':
                acceptKey(parseTagValue(tag));
                continue;
            case 'string':
                acceptString(parseTagValue(tag));
                continue;
            case 'real':
                acceptReal(parseFloat(parseTagValue(tag)));
                continue;
            case 'integer':
                acceptInteger(parseInt(parseTagValue(tag), 10));
                continue;
            case 'date':
                acceptDate(new Date(parseTagValue(tag)));
                continue;
            case 'data':
                acceptData(parseTagValue(tag));
                continue;
            case 'true':
                parseTagValue(tag);
                acceptBool(true);
                continue;
            case 'false':
                parseTagValue(tag);
                acceptBool(false);
                continue;
        }
        if (/^plist/.test(tag.name)) {
            continue;
        }
        return fail('unexpected opened tag ' + tag.name);
    }
    return cur;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGxpc3RQYXJzZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL2NvbW1vbi9wbGlzdFBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxJQUFXLE1BYVY7QUFiRCxXQUFXLE1BQU07SUFDaEIscUNBQVcsQ0FBQTtJQUVYLHNDQUFVLENBQUE7SUFDVixpQ0FBTyxDQUFBO0lBQ1AsMERBQW9CLENBQUE7SUFDcEIsOENBQWMsQ0FBQTtJQUVkLHNDQUFVLENBQUE7SUFFViw4Q0FBYyxDQUFBO0lBQ2Qsc0RBQWtCLENBQUE7SUFDbEIsNERBQXFCLENBQUE7QUFDdEIsQ0FBQyxFQWJVLE1BQU0sS0FBTixNQUFNLFFBYWhCO0FBRUQsSUFBVyxLQUlWO0FBSkQsV0FBVyxLQUFLO0lBQ2YsNkNBQWMsQ0FBQTtJQUNkLDZDQUFjLENBQUE7SUFDZCwyQ0FBYSxDQUFBO0FBQ2QsQ0FBQyxFQUpVLEtBQUssS0FBTCxLQUFLLFFBSWY7QUFDRDs7R0FFRztBQUNILE1BQU0sVUFBVSxLQUFLLENBQUMsT0FBZTtJQUNwQyxPQUFPLE1BQU0sQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQ3BDLENBQUM7QUFFRCxTQUFTLE1BQU0sQ0FBQyxPQUFlLEVBQUUsUUFBdUIsRUFBRSxlQUE4QjtJQUN2RixNQUFNLEdBQUcsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDO0lBRTNCLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQztJQUNaLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQztJQUNiLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQztJQUViLGdCQUFnQjtJQUNoQixJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsMkJBQWUsRUFBRSxDQUFD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