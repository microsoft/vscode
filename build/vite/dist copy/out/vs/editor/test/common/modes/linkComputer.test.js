/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { computeLinks } from '../../../common/languages/linkComputer.js';
class SimpleLinkComputerTarget {
    constructor(_lines) {
        this._lines = _lines;
        // Intentional Empty
    }
    getLineCount() {
        return this._lines.length;
    }
    getLineContent(lineNumber) {
        return this._lines[lineNumber - 1];
    }
}
function myComputeLinks(lines) {
    const target = new SimpleLinkComputerTarget(lines);
    return computeLinks(target);
}
function assertLink(text, extractedLink) {
    let startColumn = 0, endColumn = 0, chr, i = 0;
    for (i = 0; i < extractedLink.length; i++) {
        chr = extractedLink.charAt(i);
        if (chr !== ' ' && chr !== '\t') {
            startColumn = i + 1;
            break;
        }
    }
    for (i = extractedLink.length - 1; i >= 0; i--) {
        chr = extractedLink.charAt(i);
        if (chr !== ' ' && chr !== '\t') {
            endColumn = i + 2;
            break;
        }
    }
    const r = myComputeLinks([text]);
    assert.deepStrictEqual(r, [{
            range: {
                startLineNumber: 1,
                startColumn: startColumn,
                endLineNumber: 1,
                endColumn: endColumn
            },
            url: extractedLink.substring(startColumn - 1, endColumn - 1)
        }]);
}
suite('Editor Modes - Link Computer', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Null model', () => {
        const r = computeLinks(null);
        assert.deepStrictEqual(r, []);
    });
    test('Parsing', () => {
        assertLink('x = "http://foo.bar";', '     http://foo.bar  ');
        assertLink('x = (http://foo.bar);', '     http://foo.bar  ');
        assertLink('x = [http://foo.bar];', '     http://foo.bar  ');
        assertLink('x = \'http://foo.bar\';', '     http://foo.bar  ');
        assertLink('x =  http://foo.bar ;', '     http://foo.bar  ');
        assertLink('x = <http://foo.bar>;', '     http://foo.bar  ');
        assertLink('x = {http://foo.bar};', '     http://foo.bar  ');
        assertLink('(see http://foo.bar)', '     http://foo.bar  ');
        assertLink('[see http://foo.bar]', '     http://foo.bar  ');
        assertLink('{see http://foo.bar}', '     http://foo.bar  ');
        assertLink('<see http://foo.bar>', '     http://foo.bar  ');
        assertLink('<url>http://mylink.com</url>', '     http://mylink.com      ');
        assertLink('// Click here to learn more. https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409', '                             https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409');
        assertLink('// Click here to learn more. https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx', '                             https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx');
        assertLink('// https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js', '   https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js');
        assertLink('<!-- !!! Do not remove !!!   WebContentRef(link:https://go.microsoft.com/fwlink/?LinkId=166007, area:Admin, updated:2015, nextUpdate:2016, tags:SqlServer)   !!! Do not remove !!! -->', '                                                https://go.microsoft.com/fwlink/?LinkId=166007                                                                                        ');
        assertLink('For instructions, see https://go.microsoft.com/fwlink/?LinkId=166007.</value>', '                      https://go.microsoft.com/fwlink/?LinkId=166007         ');
        assertLink('For instructions, see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx.</value>', '                      https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx         ');
        assertLink('x = "https://en.wikipedia.org/wiki/Zürich";', '     https://en.wikipedia.org/wiki/Zürich  ');
        assertLink('請參閱 http://go.microsoft.com/fwlink/?LinkId=761051。', '    http://go.microsoft.com/fwlink/?LinkId=761051 ');
        assertLink('（請參閱 http://go.microsoft.com/fwlink/?LinkId=761051）', '     http://go.microsoft.com/fwlink/?LinkId=761051 ');
        assertLink('x = "file:///foo.bar";', '     file:///foo.bar  ');
        assertLink('x = "file://c:/foo.bar";', '     file://c:/foo.bar  ');
        assertLink('x = "file://shares/foo.bar";', '     file://shares/foo.bar  ');
        assertLink('x = "file://shäres/foo.bar";', '     file://shäres/foo.bar  ');
        assertLink('Some text, then http://www.bing.com.', '                http://www.bing.com ');
        assertLink('let url = `http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items`;', '           http://***/_api/web/lists/GetByTitle(\'Teambuildingaanvragen\')/items  ');
    });
    test('issue #7855', () => {
        assertLink('7. At this point, ServiceMain has been called.  There is no functionality presently in ServiceMain, but you can consult the [MSDN documentation](https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx) to add functionality as desired!', '                                                                                                                                                 https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx                                  ');
    });
    test('issue #62278: "Ctrl + click to follow link" for IPv6 URLs', () => {
        assertLink('let x = "http://[::1]:5000/connect/token"', '         http://[::1]:5000/connect/token  ');
    });
    test('issue #70254: bold links dont open in markdown file using editor mode with ctrl + click', () => {
        assertLink('2. Navigate to **https://portal.azure.com**', '                 https://portal.azure.com  ');
    });
    test('issue #86358: URL wrong recognition pattern', () => {
        assertLink('POST|https://portal.azure.com|2019-12-05|', '     https://portal.azure.com            ');
    });
    test('issue #67022: Space as end of hyperlink isn\'t always good idea', () => {
        assertLink('aa  https://foo.bar/[this is foo site]  aa', '    https://foo.bar/[this is foo site]    ');
    });
    test('issue #100353: Link detection stops at ＆(double-byte)', () => {
        assertLink('aa  http://tree-mark.chips.jp/レーズン＆ベリーミックス  aa', '    http://tree-mark.chips.jp/レーズン＆ベリーミックス    ');
    });
    test('issue #121438: Link detection stops at【...】', () => {
        assertLink('aa  https://zh.wikipedia.org/wiki/【我推的孩子】 aa', '    https://zh.wikipedia.org/wiki/【我推的孩子】   ');
    });
    test('issue #121438: Link detection stops at《...》', () => {
        assertLink('aa  https://zh.wikipedia.org/wiki/《新青年》编辑部旧址 aa', '    https://zh.wikipedia.org/wiki/《新青年》编辑部旧址   ');
    });
    test('issue #121438: Link detection stops at “...”', () => {
        assertLink('aa  https://zh.wikipedia.org/wiki/“常凯申”误译事件 aa', '    https://zh.wikipedia.org/wiki/“常凯申”误译事件   ');
    });
    test('issue #150905: Colon after bare hyperlink is treated as its part', () => {
        assertLink('https://site.web/page.html: blah blah blah', 'https://site.web/page.html                ');
    });
    // Removed because of #156875
    // test('issue #151631: Link parsing stoped where comments include a single quote ', () => {
    // 	assertLink(
    // 		`aa https://regexper.com/#%2F''%2F aa`,
    // 		`   https://regexper.com/#%2F''%2F   `,
    // 	);
    // });
    test('issue #156875: Links include quotes ', () => {
        assertLink(`"This file has been converted from https://github.com/jeff-hykin/better-c-syntax/blob/master/autogenerated/c.tmLanguage.json",`, `                                   https://github.com/jeff-hykin/better-c-syntax/blob/master/autogenerated/c.tmLanguage.json  `);
    });
    test('issue #225513: Cmd-Click doesn\'t work on JSDoc {@link URL|LinkText} format ', () => {
        assertLink(` * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers|Promise.withResolvers}`, `          https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers                       `);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGlua0NvbXB1dGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvbGlua0NvbXB1dGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRWhHLE9BQU8sRUFBdUIsWUFBWSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFFOUYsTUFBTSx3QkFBd0I7SUFFN0IsWUFBb0IsTUFBZ0I7UUFBaEIsV0FBTSxHQUFOLE1BQU0sQ0FBVTtRQUNuQyxvQkFBb0I7SUFDckIsQ0FBQztJQUVNLFlBQVk7UUFDbEIsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQztJQUMzQixDQUFDO0lBRU0sY0FBYyxDQUFDLFVBQWtCO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDcEMsQ0FBQztDQUNEO0FBRUQsU0FBUyxjQUFjLENBQUMsS0FBZTtJQUN0QyxNQUFNLE1BQU0sR0FBRyxJQUFJLHdCQUF3QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25ELE9BQU8sWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxJQUFZLEVBQUUsYUFBcUI7SUFDdEQsSUFBSSxXQUFXLEdBQUcsQ0FBQyxFQUNsQixTQUFTLEdBQUcsQ0FBQyxFQUNiLEdBQVcsRUFDWCxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBRVAsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDM0MsR0FBRyxHQUFHLGFB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