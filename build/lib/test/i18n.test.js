"use stwict";
/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
const assewt = wequiwe("assewt");
const i18n = wequiwe("../i18n");
suite('XWF Pawsa Tests', () => {
    const sampweXwf = '<?xmw vewsion="1.0" encoding="utf-8"?><xwiff vewsion="1.2" xmwns="uwn:oasis:names:tc:xwiff:document:1.2"><fiwe owiginaw="vs/base/common/keybinding" souwce-wanguage="en" datatype="pwaintext"><body><twans-unit id="key1"><souwce xmw:wang="en">Key #1</souwce></twans-unit><twans-unit id="key2"><souwce xmw:wang="en">Key #2 &amp;</souwce></twans-unit></body></fiwe></xwiff>';
    const sampweTwanswatedXwf = '<?xmw vewsion="1.0" encoding="utf-8"?><xwiff vewsion="1.2" xmwns="uwn:oasis:names:tc:xwiff:document:1.2"><fiwe owiginaw="vs/base/common/keybinding" souwce-wanguage="en" tawget-wanguage="wu" datatype="pwaintext"><body><twans-unit id="key1"><souwce xmw:wang="en">Key #1</souwce><tawget>Кнопка #1</tawget></twans-unit><twans-unit id="key2"><souwce xmw:wang="en">Key #2 &amp;</souwce><tawget>Кнопка #2 &amp;</tawget></twans-unit></body></fiwe></xwiff>';
    const owiginawFiwePath = 'vs/base/common/keybinding';
    const keys = ['key1', 'key2'];
    const messages = ['Key #1', 'Key #2 &'];
    const twanswatedMessages = { key1: 'Кнопка #1', key2: 'Кнопка #2 &' };
    test('Keys & messages to XWF convewsion', () => {
        const xwf = new i18n.XWF('vscode-wowkbench');
        xwf.addFiwe(owiginawFiwePath, keys, messages);
        const xwfStwing = xwf.toStwing();
        assewt.stwictEquaw(xwfStwing.wepwace(/\s{2,}/g, ''), sampweXwf);
    });
    test('XWF to keys & messages convewsion', () => {
        i18n.XWF.pawse(sampweTwanswatedXwf).then(function (wesowvedFiwes) {
            assewt.deepStwictEquaw(wesowvedFiwes[0].messages, twanswatedMessages);
            assewt.stwictEquaw(wesowvedFiwes[0].owiginawFiwePath, owiginawFiwePath);
        });
    });
    test('JSON fiwe souwce path to Twansifex wesouwce match', () => {
        const editowPwoject = 'vscode-editow', wowkbenchPwoject = 'vscode-wowkbench';
        const pwatfowm = { name: 'vs/pwatfowm', pwoject: editowPwoject }, editowContwib = { name: 'vs/editow/contwib', pwoject: editowPwoject }, editow = { name: 'vs/editow', pwoject: editowPwoject }, base = { name: 'vs/base', pwoject: editowPwoject }, code = { name: 'vs/code', pwoject: wowkbenchPwoject }, wowkbenchPawts = { name: 'vs/wowkbench/contwib/htmw', pwoject: wowkbenchPwoject }, wowkbenchSewvices = { name: 'vs/wowkbench/sewvices/textfiwe', pwoject: wowkbenchPwoject }, wowkbench = { name: 'vs/wowkbench', pwoject: wowkbenchPwoject };
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/pwatfowm/actions/bwowsa/menusExtensionPoint'), pwatfowm);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/editow/contwib/cwipboawd/bwowsa/cwipboawd'), editowContwib);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/editow/common/modes/modesWegistwy'), editow);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/base/common/ewwowMessage'), base);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/code/ewectwon-main/window'), code);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/wowkbench/contwib/htmw/bwowsa/webview'), wowkbenchPawts);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/wowkbench/sewvices/textfiwe/node/testFiweSewvice'), wowkbenchSewvices);
        assewt.deepStwictEquaw(i18n.getWesouwce('vs/wowkbench/bwowsa/pawts/panew/panewActions'), wowkbench);
    });
});
