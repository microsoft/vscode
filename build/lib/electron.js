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
        iconFile: 'resources/darwin/' + icon + '.icns',
        utis
    };
}
/**
 * Generate several `DarwinDocumentType`s with unique names and a shared icon.
 * @param types A map of file type names to their associated file extensions.
 * @param icon A darwin icon resource to use. For example, `'HTML'` would refer to `resources/darwin/html.icns`
 *
 * Examples:
 * ```
 * darwinBundleDocumentTypes({ 'C header file': 'h', 'C source code': 'c' },'c')
 * darwinBundleDocumentTypes({ 'React source code': ['jsx', 'tsx'] }, 'react')
 * ```
 */
function darwinBundleDocumentTypes(types, icon) {
    return Object.keys(types).map((name) => {
        const extensions = types[name];
        return {
            name,
            role: 'Editor',
            ostypes: ['TEXT', 'utxt', 'TUTX', '****'],
            extensions: Array.isArray(extensions) ? extensions : [extensions],
            iconFile: 'resources/darwin/' + icon + '.icns'
        };
    });
}
const { electronVersion, msBuildId } = util.getElectronVersion();
exports.config = {
    version: electronVersion,
    tag: product.electronRepository ? `v${electronVersion}-${msBuildId}` : undefined,
    productAppName: product.nameLong,
    companyName: 'Microsoft Corporation',
    copyright: 'Copyright (C) 2023 Microsoft. All rights reserved',
    darwinIcon: 'resources/darwin/code.icns',
    darwinBundleIdentifier: product.darwinBundleIdentifier,
    darwinApplicationCategoryType: 'public.app-category.developer-tools',
    darwinHelpBookFolder: 'VS Code HelpBook',
    darwinHelpBookName: 'VS Code HelpBook',
    darwinBundleDocumentTypes: [
        ...darwinBundleDocumentTypes({ 'C header file': 'h', 'C source code': 'c' }, 'c'),
        ...darwinBundleDocumentTypes({ 'Git configuration file': ['gitattributes', 'gitconfig', 'gitignore'] }, 'config'),
        ...darwinBundleDocumentTypes({ 'HTML template document': ['asp', 'aspx', 'cshtml', 'jshtm', 'jsp', 'phtml', 'shtml'] }, 'html'),
        darwinBundleDocumentType(['bat', 'cmd'], 'bat', 'Windows command script'),
        darwinBundleDocumentType(['bowerrc'], 'Bower'),
        darwinBundleDocumentType(['config', 'editorconfig', 'ini', 'cfg'], 'config', 'Configuration file'),
        darwinBundleDocumentType(['hh', 'hpp', 'hxx', 'h++'], 'cpp', 'C++ header file'),
        darwinBundleDocumentType(['cc', 'cpp', 'cxx', 'c++'], 'cpp', 'C++ source code'),
        darwinBundleDocumentType(['m'], 'default', 'Objective-C source code'),
        darwinBundleDocumentType(['mm'], 'cpp', 'Objective-C++ source code'),
        darwinBundleDocumentType(['cs', 'csx'], 'csharp', 'C# source code'),
        darwinBundleDocumentType(['css'], 'css', 'CSS'),
        darwinBundleDocumentType(['go'], 'go', 'Go source code'),
        darwinBundleDocumentType(['htm', 'html', 'xhtml'], 'HTML'),
        darwinBundleDocumentType(['jade'], 'Jade'),
        darwinBundleDocumentType(['jav', 'java'], 'Java'),
        darwinBundleDocumentType(['js', 'jscsrc', 'jshintrc', 'mjs', 'cjs'], 'Javascript', 'file'),
        darwinBundleDocumentType(['json'], 'JSON'),
        darwinBundleDocumentType(['less'], 'Less'),
        darwinBundleDocumentType(['markdown', 'md', 'mdoc', 'mdown', 'mdtext', 'mdtxt', 'mdwn', 'mkd', 'mkdn'], 'Markdown'),
        darwinBundleDocumentType(['php'], 'PHP', 'source code'),
        darwinBundleDocumentType(['ps1', 'psd1', 'psm1'], 'Powershell', 'script'),
        darwinBundleDocumentType(['py', 'pyi'], 'Python', 'script'),
        darwinBundleDocumentType(['gemspec', 'rb', 'erb'], 'Ruby', 'source code'),
        darwinBundleDocumentType(['scss', 'sass'], 'SASS', 'file'),
        darwinBundleDocumentType(['sql'], 'SQL', 'script'),
        darwinBundleDocumentType(['ts'], 'TypeScript', 'file'),
        darwinBundleDocumentType(['tsx', 'jsx'], 'React', 'source code'),
        darwinBundleDocumentType(['vue'], 'Vue', 'source code'),
        darwinBundleDocumentType(['ascx', 'csproj', 'dtd', 'plist', 'wxi', 'wxl', 'wxs', 'xml', 'xaml'], 'XML'),
        darwinBundleDocumentType(['eyaml', 'eyml', 'yaml', 'yml'], 'YAML'),
        darwinBundleDocumentType([
            'bash', 'bash_login', 'bash_logout', 'bash_profile', 'bashrc',
            'profile', 'rhistory', 'rprofile', 'sh', 'zlogin', 'zlogout',
            'zprofile', 'zsh', 'zshenv', 'zshrc'
        ], 'Shell', 'script'),
        // Default icon with specified names
        ...darwinBundleDocumentTypes({
            'Clojure source code': ['clj', 'cljs', 'cljx', 'clojure'],
            'VS Code workspace file': 'code-workspace',
            'CoffeeScript source code': 'coffee',
            'Comma Separated Values': 'csv',
            'CMake script': 'cmake',
            'Dart script': 'dart',
            'Diff file': 'diff',
            'Dockerfile': 'dockerfile',
            'Gradle file': 'gradle',
            'Groovy script': 'groovy',
            'Makefile': ['makefile', 'mk'],
            'Lua script': 'lua',
            'Pug document': 'pug',
            'Jupyter': 'ipynb',
            'Lockfile': 'lock',
            'Log file': 'log',
            'Plain Text File': 'txt',
            'Xcode project file': 'xcodeproj',
            'Xcode workspace file': 'xcworkspace',
            'Visual Basic script': 'vb',
            'R source code': 'r',
            'Rust source code': 'rs',
            'Restructured Text document': 'rst',
            'LaTeX document': ['tex', 'cls'],
            'F# source code': 'fs',
            'F# signature file': 'fsi',
            'F# script': ['fsx', 'fsscript'],
            'SVG document': ['svg', 'svgz'],
            'TOML document': 'toml',
            'Swift source code': 'swift',
        }, 'default'),
        // Default icon with default name
        darwinBundleDocumentType([
            'containerfile', 'ctp', 'dot', 'edn', 'handlebars', 'hbs', 'ml', 'mli',
            'pl', 'pl6', 'pm', 'pm6', 'pod', 'pp', 'properties', 'psgi', 'rt', 't'
        ], 'default', product.nameLong + ' document'),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbGVjdHJvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLGdDQUFnQztBQUNoQyxzQ0FBc0M7QUFDdEMsK0JBQStCO0FBQy9CLDZDQUEwQztBQVkxQyxTQUFTLGdCQUFnQixDQUFDLEdBQVk7SUFDckMsT0FBTyxHQUFHLEtBQUssVUFBVSxJQUFJLEdBQUcsS0FBSyxRQUFRLElBQUksR0FBRyxLQUFLLE1BQU0sSUFBSSxHQUFHLEtBQUssYUFBYSxDQUFDO0FBQzFGLENBQUM7QUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUNuRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztBQUNyRixNQUFNLE1BQU0sR0FBRyxJQUFBLHVCQUFVLEVBQUMsSUFBSSxDQUFDLENBQUM7QUFFaEMsU0FBUyxjQUFjLENBQUMsS0FBYTtJQUNwQyxPQUFPLENBQUMsTUFBOEIsRUFBRSxFQUFFO1FBQ3pDLE9BQU8sS0FBSyxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxDQUFDLEtBQUssRUFBRSxHQUFHLEVBQUUsRUFBRTtZQUMzRCxPQUFPLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLLENBQUM7UUFDN0IsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxxQkFBcUIsR0FBRyxPQUFPLENBQUMsYUFBYSxJQUFJLGNBQWMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFB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