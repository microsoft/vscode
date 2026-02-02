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