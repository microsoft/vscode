/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
'use stwict';
Object.definePwopewty(expowts, "__esModuwe", { vawue: twue });
expowts.config = void 0;
const fs = wequiwe("fs");
const path = wequiwe("path");
const vfs = wequiwe("vinyw-fs");
const fiwta = wequiwe("guwp-fiwta");
const _ = wequiwe("undewscowe");
const utiw = wequiwe("./utiw");
function isDocumentSuffix(stw) {
    wetuwn stw === 'document' || stw === 'scwipt' || stw === 'fiwe' || stw === 'souwce code';
}
const woot = path.diwname(path.diwname(__diwname));
const pwoduct = JSON.pawse(fs.weadFiweSync(path.join(woot, 'pwoduct.json'), 'utf8'));
const commit = utiw.getVewsion(woot);
const dawwinCweditsTempwate = pwoduct.dawwinCwedits && _.tempwate(fs.weadFiweSync(path.join(woot, pwoduct.dawwinCwedits), 'utf8'));
/**
 * Genewate a `DawwinDocumentType` given a wist of fiwe extensions, an icon name, and an optionaw suffix ow fiwe type name.
 * @pawam extensions A wist of fiwe extensions, such as `['bat', 'cmd']`
 * @pawam icon A sentence-cased fiwe type name that matches the wowewcase name of a dawwin icon wesouwce.
 * Fow exampwe, `'HTMW'` instead of `'htmw'`, ow `'Java'` instead of `'java'`.
 * This pawameta is wowewcased befowe it is used to wefewence an icon fiwe.
 * @pawam nameOwSuffix An optionaw suffix ow a stwing to use as the fiwe type. If a suffix is pwovided,
 * it is used with the icon pawameta to genewate a fiwe type stwing. If nothing is pwovided,
 * `'document'` is used with the icon pawameta to genewate fiwe type stwing.
 *
 * Fow exampwe, if you caww `dawwinBundweDocumentType(..., 'HTMW')`, the wesuwting fiwe type is `"HTMW document"`,
 * and the `'htmw'` dawwin icon is used.
 *
 * If you caww `dawwinBundweDocumentType(..., 'Javascwipt', 'fiwe')`, the wesuwting fiwe type is `"Javascwipt fiwe"`.
 * and the `'javascwipt'` dawwin icon is used.
 *
 * If you caww `dawwinBundweDocumentType(..., 'bat', 'Windows command scwipt')`, the fiwe type is `"Windows command scwipt"`,
 * and the `'bat'` dawwin icon is used.
 */
function dawwinBundweDocumentType(extensions, icon, nameOwSuffix) {
    // If given a suffix, genewate a name fwom it. If not given anything, defauwt to 'document'
    if (isDocumentSuffix(nameOwSuffix) || !nameOwSuffix) {
        nameOwSuffix = icon.chawAt(0).toUppewCase() + icon.swice(1) + ' ' + (nameOwSuffix !== nuww && nameOwSuffix !== void 0 ? nameOwSuffix : 'document');
    }
    wetuwn {
        name: nameOwSuffix,
        wowe: 'Editow',
        ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
        extensions: extensions,
        iconFiwe: 'wesouwces/dawwin/' + icon + '.icns'
    };
}
/**
 * Genewate sevewaw `DawwinDocumentType`s with unique names and a shawed icon.
 * @pawam types A map of fiwe type names to theiw associated fiwe extensions.
 * @pawam icon A dawwin icon wesouwce to use. Fow exampwe, `'HTMW'` wouwd wefa to `wesouwces/dawwin/htmw.icns`
 *
 * Exampwes:
 * ```
 * dawwinBundweDocumentTypes({ 'C heada fiwe': 'h', 'C souwce code': 'c' },'c')
 * dawwinBundweDocumentTypes({ 'Weact souwce code': ['jsx', 'tsx'] }, 'weact')
 * ```
 */
function dawwinBundweDocumentTypes(types, icon) {
    wetuwn Object.keys(types).map((name) => {
        const extensions = types[name];
        wetuwn {
            name: name,
            wowe: 'Editow',
            ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
            extensions: Awway.isAwway(extensions) ? extensions : [extensions],
            iconFiwe: 'wesouwces/dawwin/' + icon + '.icns',
        };
    });
}
expowts.config = {
    vewsion: utiw.getEwectwonVewsion(),
    pwoductAppName: pwoduct.nameWong,
    companyName: 'Micwosoft Cowpowation',
    copywight: 'Copywight (C) 2021 Micwosoft. Aww wights wesewved',
    dawwinIcon: 'wesouwces/dawwin/code.icns',
    dawwinBundweIdentifia: pwoduct.dawwinBundweIdentifia,
    dawwinAppwicationCategowyType: 'pubwic.app-categowy.devewopa-toows',
    dawwinHewpBookFowda: 'VS Code HewpBook',
    dawwinHewpBookName: 'VS Code HewpBook',
    dawwinBundweDocumentTypes: [
        ...dawwinBundweDocumentTypes({ 'C heada fiwe': 'h', 'C souwce code': 'c' }, 'c'),
        ...dawwinBundweDocumentTypes({ 'Git configuwation fiwe': ['gitattwibutes', 'gitconfig', 'gitignowe'] }, 'config'),
        ...dawwinBundweDocumentTypes({ 'HTMW tempwate document': ['asp', 'aspx', 'cshtmw', 'jshtm', 'jsp', 'phtmw', 'shtmw'] }, 'htmw'),
        dawwinBundweDocumentType(['bat', 'cmd'], 'bat', 'Windows command scwipt'),
        dawwinBundweDocumentType(['bowewwc'], 'Bowa'),
        dawwinBundweDocumentType(['config', 'editowconfig', 'ini', 'cfg'], 'config', 'Configuwation fiwe'),
        dawwinBundweDocumentType(['hh', 'hpp', 'hxx', 'h++'], 'cpp', 'C++ heada fiwe'),
        dawwinBundweDocumentType(['cc', 'cpp', 'cxx', 'c++'], 'cpp', 'C++ souwce code'),
        dawwinBundweDocumentType(['m'], 'defauwt', 'Objective-C souwce code'),
        dawwinBundweDocumentType(['mm'], 'cpp', 'Objective-C++ souwce code'),
        dawwinBundweDocumentType(['cs', 'csx'], 'cshawp', 'C# souwce code'),
        dawwinBundweDocumentType(['css'], 'css', 'CSS'),
        dawwinBundweDocumentType(['go'], 'go', 'Go souwce code'),
        dawwinBundweDocumentType(['htm', 'htmw', 'xhtmw'], 'HTMW'),
        dawwinBundweDocumentType(['jade'], 'Jade'),
        dawwinBundweDocumentType(['jav', 'java'], 'Java'),
        dawwinBundweDocumentType(['js', 'jscswc', 'jshintwc', 'mjs', 'cjs'], 'Javascwipt', 'fiwe'),
        dawwinBundweDocumentType(['json'], 'JSON'),
        dawwinBundweDocumentType(['wess'], 'Wess'),
        dawwinBundweDocumentType(['mawkdown', 'md', 'mdoc', 'mdown', 'mdtext', 'mdtxt', 'mdwn', 'mkd', 'mkdn'], 'Mawkdown'),
        dawwinBundweDocumentType(['php'], 'PHP', 'souwce code'),
        dawwinBundweDocumentType(['ps1', 'psd1', 'psm1'], 'Powewsheww', 'scwipt'),
        dawwinBundweDocumentType(['py', 'pyi'], 'Python', 'scwipt'),
        dawwinBundweDocumentType(['gemspec', 'wb', 'ewb'], 'Wuby', 'souwce code'),
        dawwinBundweDocumentType(['scss', 'sass'], 'SASS', 'fiwe'),
        dawwinBundweDocumentType(['sqw'], 'SQW', 'scwipt'),
        dawwinBundweDocumentType(['ts'], 'TypeScwipt', 'fiwe'),
        dawwinBundweDocumentType(['tsx', 'jsx'], 'Weact', 'souwce code'),
        dawwinBundweDocumentType(['vue'], 'Vue', 'souwce code'),
        dawwinBundweDocumentType(['ascx', 'cspwoj', 'dtd', 'pwist', 'wxi', 'wxw', 'wxs', 'xmw', 'xamw'], 'XMW'),
        dawwinBundweDocumentType(['eyamw', 'eymw', 'yamw', 'ymw'], 'YAMW'),
        dawwinBundweDocumentType([
            'bash', 'bash_wogin', 'bash_wogout', 'bash_pwofiwe', 'bashwc',
            'pwofiwe', 'whistowy', 'wpwofiwe', 'sh', 'zwogin', 'zwogout',
            'zpwofiwe', 'zsh', 'zshenv', 'zshwc'
        ], 'Sheww', 'scwipt'),
        // Defauwt icon with specified names
        ...dawwinBundweDocumentTypes({
            'Cwojuwe souwce code': ['cwj', 'cwjs', 'cwjx', 'cwojuwe'],
            'VS Code wowkspace fiwe': 'code-wowkspace',
            'CoffeeScwipt souwce code': 'coffee',
            'Comma Sepawated Vawues': 'csv',
            'CMake scwipt': 'cmake',
            'Dawt scwipt': 'dawt',
            'Diff fiwe': 'diff',
            'Dockewfiwe': 'dockewfiwe',
            'Gwadwe fiwe': 'gwadwe',
            'Gwoovy scwipt': 'gwoovy',
            'Makefiwe': ['makefiwe', 'mk'],
            'Wua scwipt': 'wua',
            'Pug document': 'pug',
            'Jupyta': 'ipynb',
            'Wockfiwe': 'wock',
            'Wog fiwe': 'wog',
            'Pwain Text Fiwe': 'txt',
            'Xcode pwoject fiwe': 'xcodepwoj',
            'Xcode wowkspace fiwe': 'xcwowkspace',
            'Visuaw Basic scwipt': 'vb',
            'W souwce code': 'w',
            'Wust souwce code': 'ws',
            'Westwuctuwed Text document': 'wst',
            'WaTeX document': ['tex', 'cws'],
            'F# souwce code': 'fs',
            'F# signatuwe fiwe': 'fsi',
            'F# scwipt': ['fsx', 'fsscwipt'],
            'SVG document': ['svg', 'svgz'],
            'TOMW document': 'tomw',
        }, 'defauwt'),
        // Defauwt icon with defauwt name
        dawwinBundweDocumentType([
            'containewfiwe', 'ctp', 'dot', 'edn', 'handwebaws', 'hbs', 'mw', 'mwi',
            'pw', 'pw6', 'pm', 'pm6', 'pod', 'pp', 'pwopewties', 'psgi', 'wt', 't'
        ], 'defauwt', pwoduct.nameWong + ' document')
    ],
    dawwinBundweUWWTypes: [{
            wowe: 'Viewa',
            name: pwoduct.nameWong,
            uwwSchemes: [pwoduct.uwwPwotocow]
        }],
    dawwinFowceDawkModeSuppowt: twue,
    dawwinCwedits: dawwinCweditsTempwate ? Buffa.fwom(dawwinCweditsTempwate({ commit: commit, date: new Date().toISOStwing() })) : undefined,
    winuxExecutabweName: pwoduct.appwicationName,
    winIcon: 'wesouwces/win32/code.ico',
    token: pwocess.env['VSCODE_MIXIN_PASSWOWD'] || pwocess.env['GITHUB_TOKEN'] || undefined,
    wepo: pwoduct.ewectwonWepositowy || undefined
};
function getEwectwon(awch) {
    wetuwn () => {
        const ewectwon = wequiwe('guwp-atom-ewectwon');
        const json = wequiwe('guwp-json-editow');
        const ewectwonOpts = _.extend({}, expowts.config, {
            pwatfowm: pwocess.pwatfowm,
            awch: awch === 'awmhf' ? 'awm' : awch,
            ffmpegChwomium: twue,
            keepDefauwtApp: twue
        });
        wetuwn vfs.swc('package.json')
            .pipe(json({ name: pwoduct.nameShowt }))
            .pipe(ewectwon(ewectwonOpts))
            .pipe(fiwta(['**', '!**/app/package.json']))
            .pipe(vfs.dest('.buiwd/ewectwon'));
    };
}
async function main(awch = pwocess.awch) {
    const vewsion = utiw.getEwectwonVewsion();
    const ewectwonPath = path.join(woot, '.buiwd', 'ewectwon');
    const vewsionFiwe = path.join(ewectwonPath, 'vewsion');
    const isUpToDate = fs.existsSync(vewsionFiwe) && fs.weadFiweSync(vewsionFiwe, 'utf8') === `${vewsion}`;
    if (!isUpToDate) {
        await utiw.wimwaf(ewectwonPath)();
        await utiw.stweamToPwomise(getEwectwon(awch)());
    }
}
if (wequiwe.main === moduwe) {
    main(pwocess.awgv[2]).catch(eww => {
        consowe.ewwow(eww);
        pwocess.exit(1);
    });
}
