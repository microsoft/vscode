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
const _ = require("underscore");
const util = require("./util");
const getVersion_1 = require("./getVersion");
function isDocumentSuffix(str) {
    return str === 'document' || str === 'script' || str === 'file' || str === 'source code';
}
const root = path.dirname(path.dirname(__dirname));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));
const commit = (0, getVersion_1.getVersion)(root);
const darwinCreditsTemplate = product.darwinCredits && _.template(fs.readFileSync(path.join(root, product.darwinCredits), 'utf8'));
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
        const electronOpts = _.extend({}, exports.config, {
            platform: process.platform,
            arch: arch === 'armhf' ? 'arm' : arch,
            ffmpegChromium: false,
            keepDefaultApp: true
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlY3Ryb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbGVjdHJvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLGdDQUFnQztBQUNoQyxzQ0FBc0M7QUFDdEMsZ0NBQWdDO0FBQ2hDLCtCQUErQjtBQUMvQiw2Q0FBMEM7QUFZMUMsU0FBUyxnQkFBZ0IsQ0FBQyxHQUFZO0lBQ3JDLE9BQU8sR0FBRyxLQUFLLFVBQVUsSUFBSSxHQUFHLEtBQUssUUFBUSxJQUFJLEdBQUcsS0FBSyxNQUFNLElBQUksR0FBRyxLQUFLLGFBQWEsQ0FBQztBQUMxRixDQUFDO0FBRUQsTUFBTSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDbkQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDckYsTUFBTSxNQUFNLEdBQUcsSUFBQSx1QkFBVSxFQUFDLElBQUksQ0FBQyxDQUFDO0FBRWhDLE1BQU0scUJBQXFCLEdBQUcsT0FBTyxDQUFDLGFBQWEsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLGFBQWEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFFbkk7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRztBQUNILFNBQVMsd0JBQXdCLENBQUMsVUFBb0IsRUFBRSxJQUFZLEVBQUUsWUFBNEMsRUFBRSxJQUFlO0lBQ2xJLDJGQUEyRjtJQUMzRixJQUFJLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsWUFB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