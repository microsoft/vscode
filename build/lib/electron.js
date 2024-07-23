"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const fs = require("fs");
const path = require("path");
const vfs = require("vinyl-fs");
const filter = require("gulp-filter");
const util = require("./util");
const getVersion_1 = require("./getVersion");
function isDocumentSuffix(str) {
    return str === 'document' || str === 'script' || str === 'file' || str === 'source code';
}
const root = path.dirname(path.dirname(__dirname));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const commit = (0, getVersion_1.getVersion)(root);
function createTemplate(input) {
    return (params) => {
        return input.replace(/<%=\s*([^\s]+)\s*%>/g, (match, key) => {
            return params[key] || match;
        });
    };
}
const darwinCreditsTemplate = product.darwinCredits && createTemplate(fs.readFileSync(path.join(root, product.darwinCredits), 'utf8'));
/**
 * Generate a `DarwinDocumentType` given a list of file extensions, an icon name, and an optional suffix or file type name.
 * @param extensions A list of file extensions, such as `['bat', 'cmd']`
 * @param icon A sentence-cased file type name that matches the lowercase name of a darwin icon resource.
 * For example, `'HTML'` instead of `'html'`, or `'Java'` instead of `'java'`.
 * This parameter is lowercased before it is used to reference an icon file.
 * @param nameOrSuffix An optional suffix or a string to use as the file type. If a suffix is provided,
 * it is used with the icon parameter to generate a file type string. If nothing is provided,
 * `'document'` is used with the icon parameter to generate file type string.
 *
 * For example, if you call `darwinBundleDocumentType(..., 'HTML')`, the resulting file type is `"HTML document"`,
 * and the `'html'` darwin icon is used.
 *
 * If you call `darwinBundleDocumentType(..., 'Javascript', 'file')`, the resulting file type is `"Javascript file"`.
 * and the `'javascript'` darwin icon is used.
 *
 * If you call `darwinBundleDocumentType(..., 'bat', 'Windows command script')`, the file type is `"Windows command script"`,
 * and the `'bat'` darwin icon is used.
 */
function darwinBundleDocumentType(extensions, icon, nameOrSuffix, utis) {
    // If given a suffix, generate a name from it. If not given anything, default to 'document'
    if (isDocumentSuffix(nameOrSuffix) || !nameOrSuffix) {
        nameOrSuffix = icon.charAt(0).toUpperCase() + icon.slice(1) + ' ' + (nameOrSuffix ?? 'document');
    }
    return {
        name: nameOrSuffix,
        role: 'Editor',
        ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
        extensions,
        iconFile: 'resources/darwin/' + icon.toLowerCase() + '.icns',
        utis
    };
}
const { electronVersion, msBuildId } = util.getElectronVersion();
exports.config = {
    version: electronVersion,
    tag: product.electronRepository ? `v${electronVersion}-${msBuildId}` : undefined,
    productAppName: product.nameLong,
    companyName: 'Microsoft Corporation',
    copyright: 'Copyright (C) 2024 Microsoft. All rights reserved',
    darwinIcon: 'resources/darwin/code.icns',
    darwinBundleIdentifier: product.darwinBundleIdentifier,
    darwinApplicationCategoryType: 'public.app-category.developer-tools',
    darwinHelpBookFolder: 'VS Code HelpBook',
    darwinHelpBookName: 'VS Code HelpBook',
    darwinBundleDocumentTypes: [
        darwinBundleDocumentType(['h'], 'c', undefined, ['public.c-header']),
        darwinBundleDocumentType(['c'], 'c', undefined, ['public.c-source']),
        darwinBundleDocumentType(['gitattributes'], 'config', undefined, ['dyn.ah62d4rv4ge80s4pyqf4hk6xmqm41k3px']),
        darwinBundleDocumentType(['gitconfig'], 'config', undefined, ['dyn.ah62d4rv4ge80s4pyqr1063xmq6']),
        darwinBundleDocumentType(['gitignore'], 'config', undefined, ['dyn.ah62d4rv4ge80s4pyrfx0655wqy']),
        darwinBundleDocumentType(['asp'], 'html', undefined, ['dyn.ah62d4rv4ge80c65u']),
        darwinBundleDocumentType(['aspx'], 'html', undefined, ['dyn.ah62d4rv4ge80c65uta']),
        darwinBundleDocumentType(['cshtml'], 'html', undefined, ['dyn.ah62d4rv4ge80g65ksv002']),
        darwinBundleDocumentType(['jshtm'], 'html', undefined, ['dyn.ah62d4rv4ge80y65ksv0u']),
        darwinBundleDocumentType(['jsp'], 'html', undefined, ['dyn.ah62d4rv4ge80y65u']),
        darwinBundleDocumentType(['phtml'], 'html', undefined, ['public.php-script']),
        darwinBundleDocumentType(['shtml'], 'html', undefined, ['public.html']),
        darwinBundleDocumentType(['bat'], 'bat', 'Windows command script', ['dyn.ah62d4rv4ge80e2py']),
        darwinBundleDocumentType(['cmd'], 'bat', 'Windows command script', ['dyn.ah62d4rv4ge80g5pe']),
        darwinBundleDocumentType(['bowerrc'], 'Bower', undefined, ['dyn.ah62d4rv4ge80g5pe']),
        darwinBundleDocumentType(['config'], 'config', 'Configuration file', ['dyn.ah62d4rv4ge80g55sq3y0s']),
        darwinBundleDocumentType(['editorconfig'], 'config', 'Configuration file', ['dyn.ah62d4rv4ge80n3dmsv11e25tr3xgw32']),
        darwinBundleDocumentType(['ini'], 'config', 'Configuration file', ['dyn.ah62d4rv4ge80w5xm']),
        darwinBundleDocumentType(['cfg'], 'config', 'Configuration file', ['dyn.ah62d4rv4ge80g3xh']),
        darwinBundleDocumentType(['hh', 'hpp', 'hxx', 'h++'], 'cpp', 'C++ header file', ['public.c-plus-plus-header']),
        darwinBundleDocumentType(['cc', 'cpp', 'cxx', 'c++'], 'cpp', 'C++ source code', ['public.c-plus-plus-source']),
        darwinBundleDocumentType(['m'], 'default', 'Objective-C source code', ['public.objective-c-source']),
        darwinBundleDocumentType(['mm'], 'cpp', 'Objective-C++ source code', ['public.objective-c-plus-plus-source']),
        darwinBundleDocumentType(['cs'], 'csharp', 'C# source code', ['dyn.ah62d4rv4ge80g62']),
        darwinBundleDocumentType(['csx'], 'csharp', 'C# source code', ['dyn.ah62d4rv4ge80g652']),
        darwinBundleDocumentType(['css'], 'css', 'CSS', ['public.css']),
        darwinBundleDocumentType(['go'], 'go', 'Go source code', ['dyn.ah62d4rv4ge80s52']),
        darwinBundleDocumentType(['htm', 'html'], 'HTML', undefined, ['public.html']),
        darwinBundleDocumentType(['xhtml'], 'HTML', undefined, ['public.xhtml']),
        darwinBundleDocumentType(['jade'], 'Jade', undefined, ['dyn.ah62d4rv4ge80y2peqy']),
        darwinBundleDocumentType(['jav', 'java'], 'Java', undefined, ['com.sun.java-source']),
        darwinBundleDocumentType(['js', 'mjs'], 'Javascript', 'file', ['com.netscape.javascript-source']),
        darwinBundleDocumentType(['jscsrc'], 'Javascript', 'file', ['dyn.ah62d4rv4ge80y65dsr3gg']),
        darwinBundleDocumentType(['jshintrc',], 'Javascript', 'file', ['dyn.ah62d4rv4ge80y65krf1hk6xd']),
        darwinBundleDocumentType(['cjs',], 'Javascript', 'file', ['dyn.ah62d4rv4ge80g4xx']),
        darwinBundleDocumentType(['json'], 'JSON', undefined, ['public.json']),
        darwinBundleDocumentType(['less'], 'Less', undefined, ['dyn.ah62d4rv4ge8023pxsq']),
        darwinBundleDocumentType(['markdown', 'md', 'mdown'], 'Markdown', undefined, ['net.daringfireball.markdown']),
        darwinBundleDocumentType(['mdoc'], 'Markdown', undefined, ['dyn.ah62d4rv4ge8043dtqq']),
        darwinBundleDocumentType(['mdtext'], 'Markdown', undefined, ['dyn.ah62d4rv4ge8043dyqz6hk']),
        darwinBundleDocumentType(['mdtxt'], 'Markdown', undefined, ['dyn.ah62d4rv4ge8043dytb4a']),
        darwinBundleDocumentType(['mdwn'], 'Markdown', undefined, ['dyn.ah62d4rv4ge8043d1r2']),
        darwinBundleDocumentType(['mkd'], 'Markdown', undefined, ['dyn.ah62d4rv4ge80445e']),
        darwinBundleDocumentType(['mkdn'], 'Markdown', undefined, ['dyn.ah62d4rv4ge80445er2']),
        darwinBundleDocumentType(['php'], 'PHP', 'source code', ['public.php-script']),
        darwinBundleDocumentType(['ps1',], 'Powershell', 'script', ['dyn.ah62d4rv4ge81a63v']),
        darwinBundleDocumentType(['psd1'], 'Powershell', 'script', ['dyn.ah62d4rv4ge81a65ege']),
        darwinBundleDocumentType(['psm1'], 'Powershell', 'script', ['dyn.ah62d4rv4ge81a65rge']),
        darwinBundleDocumentType(['py'], 'Python', 'script', ['public.python-script']),
        darwinBundleDocumentType(['pyi'], 'Python', 'script', ['dyn.ah62d4rv4ge81a8pm']),
        darwinBundleDocumentType(['gemspec', 'rb', 'erb'], 'Ruby', 'source code', ['dyn.ah62d4rv4ge80s3prsr2gn22']),
        darwinBundleDocumentType(['rb'], 'Ruby', 'source code', ['public.ruby-script']),
        darwinBundleDocumentType(['erb'], 'Ruby', 'source code', ['dyn.ah62d4rv4ge80n6xc']),
        darwinBundleDocumentType(['scss'], 'SASS', 'file', ['dyn.ah62d4rv4ge81g25xsq']),
        darwinBundleDocumentType(['sass'], 'SASS', 'file', ['dyn.ah62d4rv4ge81g2pxsq']),
        darwinBundleDocumentType(['sql'], 'SQL', 'script', ['com.sequel-ace.sequel-ace.sql']),
        darwinBundleDocumentType(['ts'], 'TypeScript', 'file', ['public.mpeg-2-transport-stream']),
        darwinBundleDocumentType(['tsx'], 'React', 'source code', ['com.microsoft.typescript']),
        darwinBundleDocumentType(['jsx'], 'React', 'source code', ['dyn.ah62d4rv4ge80y652']),
        darwinBundleDocumentType(['vue'], 'Vue', 'source code', ['dyn.ah62d4rv4ge81q7pf']),
        darwinBundleDocumentType(['ascx'], 'XML', undefined, ['dyn.ah62d4rv4ge80c65dta']),
        darwinBundleDocumentType(['csproj'], 'XML', undefined, ['dyn.ah62d4rv4ge80g65usm10y']),
        darwinBundleDocumentType(['dtd'], 'XML', undefined, ['dyn.ah62d4rv4ge80k7de']),
        darwinBundleDocumentType(['plist'], 'XML', undefined, ['com.apple.property-list']),
        darwinBundleDocumentType(['wxi'], 'XML', undefined, ['dyn.ah62d4rv4ge81s8dm']),
        darwinBundleDocumentType(['wxl'], 'XML', undefined, ['dyn.ah62d4rv4ge81s8dq']),
        darwinBundleDocumentType(['wxs'], 'XML', undefined, ['dyn.ah62d4rv4ge81s8dx']),
        darwinBundleDocumentType(['xml'], 'XML', undefined, ['public.xml']),
        darwinBundleDocumentType(['xaml'], 'XML', undefined, ['dyn.ah62d4rv4ge81u2prru']),
        darwinBundleDocumentType(['eyaml'], 'YAML', undefined, ['dyn.ah62d4rv4ge80n8pbrz0a']),
        darwinBundleDocumentType(['eyml'], 'YAML', undefined, ['dyn.ah62d4rv4ge80n8prru']),
        darwinBundleDocumentType(['yaml', 'yml'], 'YAML', undefined, ['public.yaml']),
        darwinBundleDocumentType(['bash'], 'Shell', 'script', ['public.bash-script']),
        darwinBundleDocumentType(['bash_login'], 'Shell', 'script', ['dyn.ah62d4rv4ge80e2pxrbt0255hrf1a']),
        darwinBundleDocumentType(['bash_logout'], 'Shell', 'script', ['dyn.ah62d4rv4ge80e2pxrbt0255hr741k']),
        darwinBundleDocumentType(['bash_profile'], 'Shell', 'script', ['dyn.ah62d4rv4ge80e2pxrbt1a6xtq3y023k']),
        darwinBundleDocumentType(['bashrc'], 'Shell', 'script', ['dyn.ah62d4rv4ge80e2pxrb3gg']),
        darwinBundleDocumentType(['profile'], 'Shell', 'script', ['dyn.ah62d4rv4ge81a6xtq3y023k']),
        darwinBundleDocumentType(['rhistory'], 'Shell', 'script', ['dyn.ah62d4rv4ge81e4dmsr4g86x3']),
        darwinBundleDocumentType(['rprofile'], 'Shell', 'script', ['dyn.ah62d4rv4ge81e6dwr7xgw5df']),
        darwinBundleDocumentType(['sh'], 'Shell', 'script', ['public.shell-script']),
        darwinBundleDocumentType(['zlogin'], 'Shell', 'script', ['dyn.ah62d4rv4ge81y5dtq7y06']),
        darwinBundleDocumentType(['zlogout'], 'Shell', 'script', ['dyn.ah62d4rv4ge81y5dtq711n7a']),
        darwinBundleDocumentType(['zprofile'], 'Shell', 'script', ['dyn.ah62d4rv4ge81y6dwr7xgw5df']),
        darwinBundleDocumentType(['zsh'], 'Shell', 'script', ['public.zsh-script']),
        darwinBundleDocumentType(['zshenv'], 'Shell', 'script', ['dyn.ah62d4rv4ge81y65kqz1hq']),
        darwinBundleDocumentType(['zshrc'], 'Shell', 'script', ['dyn.ah62d4rv4ge81y65ksmvu']),
        darwinBundleDocumentType(['clj'], 'default', 'Clojure source code', ['dyn.ah62d4rv4ge80g5dn']),
        darwinBundleDocumentType(['cljs'], 'default', 'Clojure source code', ['dyn.ah62d4rv4ge80g5dnsq']),
        darwinBundleDocumentType(['cljx'], 'default', 'Clojure source code', ['dyn.ah62d4rv4ge80g5dnta']),
        darwinBundleDocumentType(['clojure'], 'default', 'Clojure source code', ['dyn.ah62d4rv4ge80g5dtrm41e3k']),
        darwinBundleDocumentType(['code-workspace'], 'default', 'VS Code workspace file', ['dyn.ah62d4rv4ge80g55eqy01s55wrr31a2pdqy']),
        darwinBundleDocumentType(['coffee'], 'default', 'CoffeeScript source code', ['dyn.ah62d4rv4ge80g55gq3w0n']),
        darwinBundleDocumentType(['csv'], 'default', 'Comma Separated Values', ['public.comma-separated-values-text']),
        darwinBundleDocumentType(['cmake'], 'default', 'CMake script', ['dyn.ah62d4rv4ge80g5pbrrwu']),
        darwinBundleDocumentType(['dart'], 'default', 'Dart script', ['dyn.ah62d4rv4ge80k2pwsu']),
        darwinBundleDocumentType(['diff'], 'default', 'Diff file', ['public.patch-file']),
        darwinBundleDocumentType(['dockerfile'], 'default', 'Dockerfile', ['dyn.ah62d4rv4ge80k55drrw1e3xmrvwu']),
        darwinBundleDocumentType(['gradle'], 'default', 'Gradle file', ['dyn.ah62d4rv4ge80s6xbqv0gn']),
        darwinBundleDocumentType(['groovy'], 'default', 'Groovy script', ['dyn.ah62d4rv4ge80s6xtr75hw']),
        darwinBundleDocumentType(['makefile'], 'default', 'Makefile', ['dyn.ah62d4rv4ge8042ppqzxgw5df']),
        darwinBundleDocumentType(['mk'], 'default', 'Makefile', ['public.make-source']),
        darwinBundleDocumentType(['lua'], 'default', 'Lua script', ['dyn.ah62d4rv4ge8027pb']),
        darwinBundleDocumentType(['pug'], 'default', 'Pug document', ['dyn.ah62d4rv4ge81a7ph']),
        darwinBundleDocumentType(['ipynb'], 'default', 'Jupyter', ['dyn.ah62d4rv4ge80w6d3r3va']),
        darwinBundleDocumentType(['lock'], 'default', 'Lockfile', ['dyn.ah62d4rv4ge80255drq']),
        darwinBundleDocumentType(['log'], 'default', 'Log file', ['com.apple.log']),
        darwinBundleDocumentType(['txt'], 'default', 'Plain Text File', ['public.plain-text']),
        darwinBundleDocumentType(['xcodeproj'], 'default', 'Xcode project file', ['com.apple.xcode.project']),
        darwinBundleDocumentType(['xcworkspace'], 'default', 'Xcode workspace file', ['dyn.ah62d4rv4ge81u251r73g065uqfv0n']),
        darwinBundleDocumentType(['vb'], 'default', 'Visual Basic script', ['dyn.ah62d4rv4ge81q2u']),
        darwinBundleDocumentType(['r'], 'default', 'R source code', ['com.apple.rez-source']),
        darwinBundleDocumentType(['rs'], 'default', 'Rust source code', ['dyn.ah62d4rv4ge81e62']),
        darwinBundleDocumentType(['rst'], 'default', 'Restructured Text document', ['dyn.ah62d4rv4ge81e65y']),
        darwinBundleDocumentType(['tex'], 'default', 'LaTeX document', ['dyn.ah62d4rv4ge81k3p2']),
        darwinBundleDocumentType(['cls'], 'default', 'LaTeX document', ['dyn.ah62d4rv4ge80g5dx']),
        darwinBundleDocumentType(['fs'], 'default', 'F# source code', ['org.khronos.glsl.fragment-shader']),
        darwinBundleDocumentType(['fsi'], 'default', 'F# signature file', ['dyn.ah62d4rv4ge80q65m']),
        darwinBundleDocumentType(['fsx'], 'default', 'F# script', ['dyn.ah62d4rv4ge80q652']),
        darwinBundleDocumentType(['fsscript'], 'default', 'F# script', ['dyn.ah62d4rv4ge80q65xqr3gw6dy']),
        darwinBundleDocumentType(['svg', 'svgz'], 'default', 'SVG document', ['public.svg-image']),
        darwinBundleDocumentType(['toml'], 'default', 'TOML document', ['dyn.ah62d4rv4ge81k55rru']),
        darwinBundleDocumentType(['swift'], 'default', 'Swift source code', ['public.swift-source']),
        darwinBundleDocumentType(['containerfile'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge80g55ssvu0w5xfsmxgw5df']),
        darwinBundleDocumentType(['ctp'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge80g7du']),
        darwinBundleDocumentType(['dot'], 'default', product.nameLong + ' document', ['com.microsoft.word.dot']),
        darwinBundleDocumentType(['edn'], 'default', product.nameLong + ' document', ['com.adobe.edn']),
        darwinBundleDocumentType(['handlebars'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge80u2psqv0gn2xbsm3u']),
        darwinBundleDocumentType(['hbs'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge80u2xx']),
        darwinBundleDocumentType(['ml'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge8045a']),
        darwinBundleDocumentType(['mli'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge8045dm']),
        darwinBundleDocumentType(['pl'], 'default', product.nameLong + ' document', ['public.perl-script']),
        darwinBundleDocumentType(['pl6'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81a5b0']),
        darwinBundleDocumentType(['pm'], 'default', product.nameLong + ' document', ['public.perl-script']),
        darwinBundleDocumentType(['pm6'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81a5m0']),
        darwinBundleDocumentType(['pod'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81a55e']),
        darwinBundleDocumentType(['pp'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81a6a']),
        darwinBundleDocumentType(['properties'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81a6xtsbw1e7dmqz3u']),
        darwinBundleDocumentType(['psgi'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81a65hre']),
        darwinBundleDocumentType(['rt'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81e7a']),
        darwinBundleDocumentType(['t'], 'default', product.nameLong + ' document', ['dyn.ah62d4rv4ge81k']),
        // Folder support ()
        darwinBundleDocumentType([], 'default', 'Folder', ['public.folder'])
    ],
    darwinBundleURLTypes: [{
            role: 'Viewer',
            name: product.nameLong,
            urlSchemes: [product.urlProtocol]
        }],
    darwinForceDarkModeSupport: true,
    darwinCredits: darwinCreditsTemplate ? Buffer.from(darwinCreditsTemplate({ commit: commit, date: new Date().toISOString() })) : undefined,
    linuxExecutableName: product.applicationName,
    winIcon: 'resources/win32/code.ico',
    token: process.env['GITHUB_TOKEN'],
    repo: product.electronRepository || undefined,
    validateChecksum: true,
    checksumFile: path.join(root, 'build', 'checksums', 'electron.txt'),
};
function getElectron(arch) {
    return () => {
        const electron = require('@vscode/gulp-electron');
        const json = require('gulp-json-editor');
        const electronOpts = {
            ...exports.config,
            platform: process.platform,
            arch: arch === 'armhf' ? 'arm' : arch,
            ffmpegChromium: false,
            keepDefaultApp: true
        };
        return vfs.src('package.json')
            .pipe(json({ name: product.nameShort }))
            .pipe(electron(electronOpts))
            .pipe(filter(['**', '!**/app/package.json']))
            .pipe(vfs.dest('.build/electron'));
    };
}
async function main(arch = process.arch) {
    const version = electronVersion;
    const electronPath = path.join(root, '.build', 'electron');
    const versionFile = path.join(electronPath, 'version');
    const isUpToDate = fs.existsSync(versionFile) && fs.readFileSync(versionFile, 'utf8') === `${version}`;
    if (!isUpToDate) {
        await util.rimraf(electronPath)();
        await util.streamToPromise(getElectron(arch)());
    }
}
if (require.main === module) {
    main(process.argv[2]).catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=electron.js.map