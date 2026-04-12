/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import assert from 'assert';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ConfigurationService } from '../../../../../../platform/configuration/common/configurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { NullPolicyService } from '../../../../../../platform/policy/common/policy.js';
import { ChatModeKind } from '../../../common/constants.js';
import { getPromptFileType } from '../../../common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../common/promptSyntax/promptTypes.js';
import { MockFilesystem } from './testUtils/mockFilesystem.js';
import { PromptFileParser } from '../../../common/promptSyntax/promptFileParser.js';
/**
 * Represents a file reference with an expected
 * error condition value for testing purposes.
 */
class ExpectedReference {
    constructor(dirname, ref) {
        this.ref = ref;
        this.uri = (ref.content.startsWith('/'))
            ? URI.file(ref.content)
            : URI.joinPath(dirname, ref.content);
    }
    /**
     * Range of the underlying file reference token.
     */
    get range() {
        return this.ref.range;
    }
    /**
     * String representation of the expected reference.
     */
    toString() {
        return `file-prompt:${this.uri.path}`;
    }
}
function toUri(filePath) {
    return URI.parse('testFs://' + filePath);
}
/**
 * A reusable test utility to test the `PromptFileReference` class.
 */
let TestPromptFileReference = class TestPromptFileReference extends Disposable {
    constructor(fileStructure, rootFileUri, expectedReferences, fileService, instantiationService) {
        super();
        this.fileStructure = fileStructure;
        this.rootFileUri = rootFileUri;
        this.expectedReferences = expectedReferences;
        this.fileService = fileService;
        this.instantiationService = instantiationService;
        // create in-memory file system
        const fileSystemProvider = this._register(new InMemoryFileSystemProvider());
        this._register(this.fileService.registerProvider('testFs', fileSystemProvider));
    }
    /**
     * Run the test.
     */
    async run() {
        // create the files structure on the disk
        const mockFs = this.instantiationService.createInstance(MockFilesystem, this.fileStructure);
        await mockFs.mock(toUri('/'));
        const content = await this.fileService.readFile(this.rootFileUri);
        const ast = new PromptFileParser().parse(this.rootFileUri, content.value.toString());
        assert(ast.body, 'Prompt file must have a body');
        // resolve the root file reference including all nested references
        const resolvedReferences = ast.body.fileReferences ?? [];
        for (let i = 0; i < this.expectedReferences.length; i++) {
            const expectedReference = this.expectedReferences[i];
            const resolvedReference = resolvedReferences[i];
            const resolvedUri = ast.body.resolveFilePath(resolvedReference.content);
            assert.equal(resolvedUri?.fsPath, expectedReference.uri.fsPath);
            assert.deepStrictEqual(resolvedReference.range, expectedReference.range);
        }
        assert.strictEqual(resolvedReferences.length, this.expectedReferences.length, [
            `\nExpected(${this.expectedReferences.length}): [\n ${this.expectedReferences.join('\n ')}\n]`,
            `Received(${resolvedReferences.length}): [\n ${resolvedReferences.join('\n ')}\n]`,
        ].join('\n'));
        const result = {};
        result.promptType = getPromptFileType(this.rootFileUri);
        if (ast.header) {
            for (const key of ['tools', 'model', 'agent', 'applyTo', 'description']) {
                if (ast.header[key]) {
                    result[key] = ast.header[key];
                }
            }
        }
        await mockFs.delete();
        return result;
    }
};
TestPromptFileReference = __decorate([
    __param(3, IFileService),
    __param(4, IInstantiationService)
], TestPromptFileReference);
/**
 * Create expected file reference for testing purposes.
 *
 * Note! This utility also use for `markdown links` at the moment.
 *
 * @param filePath The expected path of the file reference (without the `#file:` prefix).
 * @param lineNumber The expected line number of the file reference.
 * @param startColumnNumber The expected start column number of the file reference.
 */
function createFileReference(filePath, lineNumber, startColumnNumber) {
    const range = new Range(lineNumber, startColumnNumber + '#file:'.length, lineNumber, startColumnNumber + '#file:'.length + filePath.length);
    return {
        range,
        content: filePath,
        isMarkdownLink: false,
    };
}
function createMarkdownReference(lineNumber, startColumnNumber, firstSeg, secondSeg) {
    const range = new Range(lineNumber, startColumnNumber + firstSeg.length + 1, lineNumber, startColumnNumber + firstSeg.length + secondSeg.length - 1);
    return {
        range,
        content: secondSeg.substring(1, secondSeg.length - 1),
        isMarkdownLink: true,
    };
}
suite('PromptFileReference', function () {
    const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
    let instantiationService;
    setup(async () => {
        const nullPolicyService = new NullPolicyService();
        const nullLogService = testDisposables.add(new NullLogService());
        const nullFileService = testDisposables.add(new FileService(nullLogService));
        const nullConfigService = testDisposables.add(new ConfigurationService(URI.file('/config.json'), nullFileService, nullPolicyService, nullLogService));
        instantiationService = testDisposables.add(new TestInstantiationService());
        instantiationService.stub(IFileService, nullFileService);
        instantiationService.stub(ILogService, nullLogService);
        instantiationService.stub(IConfigurationService, nullConfigService);
        instantiationService.stub(IModelService, { getModel() { return null; } });
        instantiationService.stub(ILanguageService, {
            guessLanguageIdByFilepathOrFirstLine(uri) {
                return getPromptFileType(uri) ?? null;
            }
        });
    });
    test('resolves nested file references', async function () {
        const rootFolderName = 'resolves-nested-file-references';
        const rootFolder = `/${rootFolderName}`;
        const rootUri = toUri(rootFolder);
        const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
        /**
         * The file structure to be created on the disk for the test.
         */
        [{
                name: rootFolderName,
                children: [
                    {
                        name: 'file1.prompt.md',
                        contents: '## Some Header\nsome contents\n ',
                    },
                    {
                        name: 'file2.prompt.md',
                        contents: '## Files\n\t- this file #file:folder1/file3.prompt.md \n\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!\n ',
                    },
                    {
                        name: 'folder1',
                        children: [
                            {
                                name: 'file3.prompt.md',
                                contents: `\n[](./some-other-folder/non-existing-folder)\n\t- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md contents\n some more\t content`,
                            },
                            {
                                name: 'some-other-folder',
                                children: [
                                    {
                                        name: 'file4.prompt.md',
                                        contents: 'this file has a non-existing #file:./some-non-existing/file.prompt.md\t\treference\n\n\nand some\n non-prompt #file:./some-non-prompt-file.md\t\t \t[](../../folder1/)\t',
                                    },
                                    {
                                        name: 'file.txt',
                                        contents: 'contents of a non-prompt-snippet file',
                                    },
                                    {
                                        name: 'yetAnotherFolder🤭',
                                        children: [
                                            {
                                                name: 'another-file.prompt.md',
                                                contents: `[caption](${rootFolder}/folder1/some-other-folder)\nanother-file.prompt.md contents\t [#file:file.txt](../file.txt)`,
                                            },
                                            {
                                                name: 'one_more_file_just_in_case.prompt.md',
                                                contents: 'one_more_file_just_in_case.prompt.md contents',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }], 
        /**
         * The root file path to start the resolve process from.
         */
        toUri(`/${rootFolderName}/file2.prompt.md`), 
        /**
         * The expected references to be resolved.
         */
        [
            new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 2, 14)),
            new ExpectedReference(rootUri, createMarkdownReference(3, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
        ]));
        await test.run();
    });
    suite('metadata', () => {
        test('tools', async function () {
            const rootFolderName = 'resolves-nested-file-references';
            const rootFolder = `/${rootFolderName}`;
            const rootUri = toUri(rootFolder);
            const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
            /**
             * The file structure to be created on the disk for the test.
             */
            [{
                    name: rootFolderName,
                    children: [
                        {
                            name: 'file1.prompt.md',
                            contents: [
                                '## Some Header',
                                'some contents',
                                ' ',
                            ],
                        },
                        {
                            name: 'file2.prompt.md',
                            contents: [
                                '---',
                                'description: \'Root prompt description.\'',
                                'tools: [\'my-tool1\']',
                                'agent: "agent" ',
                                '---',
                                '## Files',
                                '\t- this file #file:folder1/file3.prompt.md ',
                                '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                ' ',
                            ],
                        },
                        {
                            name: 'folder1',
                            children: [
                                {
                                    name: 'file3.prompt.md',
                                    contents: [
                                        '---',
                                        'tools: [ \'my-tool1\' , ]',
                                        '---',
                                        '',
                                        '[](./some-other-folder/non-existing-folder)',
                                        `\t- some seemingly random #file:${rootFolder}/folder1/some-other-folder/yetAnotherFolder🤭/another-file.prompt.md contents`,
                                        ' some more\t content',
                                    ],
                                },
                                {
                                    name: 'some-other-folder',
                                    children: [
                                        {
                                            name: 'file4.prompt.md',
                                            contents: [
                                                '---',
                                                'tools: [\'my-tool1\', "my-tool2", true, , ]',
                                                'something: true',
                                                'agent: \'ask\'\t',
                                                '---',
                                                'this file has a non-existing #file:./some-non-existing/file.prompt.md\t\treference',
                                                '',
                                                '',
                                                'and some',
                                                ' non-prompt #file:./some-non-prompt-file.md\t\t \t[](../../folder1/)\t',
                                            ],
                                        },
                                        {
                                            name: 'file.txt',
                                            contents: 'contents of a non-prompt-snippet file',
                                        },
                                        {
                                            name: 'yetAnotherFolder🤭',
                                            children: [
                                                {
                                                    name: 'another-file.prompt.md',
                                                    contents: [
                                                        '---',
                                                        'tools: [\'my-tool3\', "my-tool2" ]',
                                                        '---',
                                                        `[](${rootFolder}/folder1/some-other-folder)`,
                                                        'another-file.prompt.md contents\t [#file:file.txt](../file.txt)',
                                                    ],
                                                },
                                                {
                                                    name: 'one_more_file_just_in_case.prompt.md',
                                                    contents: 'one_more_file_just_in_case.prompt.md contents',
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                }], 
            /**
             * The root file path to start the resolve process from.
             */
            toUri(`/${rootFolderName}/file2.prompt.md`), 
            /**
             * The expected references to be resolved.
             */
            [
                new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 7, 14)),
                new ExpectedReference(rootUri, createMarkdownReference(8, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
            ]));
            const metadata = await test.run();
            assert.deepStrictEqual(metadata, {
                promptType: PromptsType.prompt,
                agent: 'agent',
                description: 'Root prompt description.',
                tools: ['my-tool1'],
            }, 'Must have correct metadata.');
        });
        suite('applyTo', () => {
            test('prompt language', async function () {
                const rootFolderName = 'resolves-nested-file-references';
                const rootFolder = `/${rootFolderName}`;
                const rootUri = toUri(rootFolder);
                const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
                /**
                 * The file structure to be created on the disk for the test.
                 */
                [{
                        name: rootFolderName,
                        children: [
                            {
                                name: 'file1.prompt.md',
                                contents: [
                                    '## Some Header',
                                    'some contents',
                                    ' ',
                                ],
                            },
                            {
                                name: 'file2.prompt.md',
                                contents: [
                                    '---',
                                    'applyTo: \'**/*\'',
                                    'tools: [ \'my-tool12\' , ]',
                                    'description: \'Description of my prompt.\'',
                                    '---',
                                    '## Files',
                                    '\t- this file #file:folder1/file3.prompt.md ',
                                    '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                    ' ',
                                ],
                            },
                            {
                                name: 'folder1',
                                children: [
                                    {
                                        name: 'file3.prompt.md',
                                        contents: [
                                            '---',
                                            'tools: [ \'my-tool1\' , ]',
                                            '---',
                                            ' some more\t content',
                                        ],
                                    },
                                    {
                                        name: 'some-other-folder',
                                        children: [
                                            {
                                                name: 'file4.prompt.md',
                                                contents: [
                                                    '---',
                                                    'tools: [\'my-tool1\', "my-tool2", true, , \'my-tool3\' , ]',
                                                    'something: true',
                                                    'agent: \'agent\'\t',
                                                    '---',
                                                    '',
                                                    '',
                                                    'and some more content',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }], 
                /**
                 * The root file path to start the resolve process from.
                 */
                toUri(`/${rootFolderName}/file2.prompt.md`), 
                /**
                 * The expected references to be resolved.
                 */
                [
                    new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 7, 14)),
                    new ExpectedReference(rootUri, createMarkdownReference(8, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
                ]));
                const metadata = await test.run();
                assert.deepStrictEqual(metadata, {
                    promptType: PromptsType.prompt,
                    description: 'Description of my prompt.',
                    tools: ['my-tool12'],
                    applyTo: '**/*',
                }, 'Must have correct metadata.');
            });
            test('instructions language', async function () {
                const rootFolderName = 'resolves-nested-file-references';
                const rootFolder = `/${rootFolderName}`;
                const rootUri = toUri(rootFolder);
                const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
                /**
                 * The file structure to be created on the disk for the test.
                 */
                [{
                        name: rootFolderName,
                        children: [
                            {
                                name: 'file1.prompt.md',
                                contents: [
                                    '## Some Header',
                                    'some contents',
                                    ' ',
                                ],
                            },
                            {
                                name: 'file2.instructions.md',
                                contents: [
                                    '---',
                                    'applyTo: \'**/*\'',
                                    'tools: [ \'my-tool12\' , ]',
                                    'description: \'Description of my instructions file.\'',
                                    '---',
                                    '## Files',
                                    '\t- this file #file:folder1/file3.prompt.md ',
                                    '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                    ' ',
                                ],
                            },
                            {
                                name: 'folder1',
                                children: [
                                    {
                                        name: 'file3.prompt.md',
                                        contents: [
                                            '---',
                                            'tools: [ \'my-tool1\' , ]',
                                            '---',
                                            ' some more\t content',
                                        ],
                                    },
                                    {
                                        name: 'some-other-folder',
                                        children: [
                                            {
                                                name: 'file4.prompt.md',
                                                contents: [
                                                    '---',
                                                    'tools: [\'my-tool1\', "my-tool2", true, , \'my-tool3\' , ]',
                                                    'something: true',
                                                    'agent: \'agent\'\t',
                                                    '---',
                                                    '',
                                                    '',
                                                    'and some more content',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }], 
                /**
                 * The root file path to start the resolve process from.
                 */
                toUri(`/${rootFolderName}/file2.instructions.md`), 
                /**
                 * The expected references to be resolved.
                 */
                [
                    new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 7, 14)),
                    new ExpectedReference(rootUri, createMarkdownReference(8, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
                ]));
                const metadata = await test.run();
                assert.deepStrictEqual(metadata, {
                    promptType: PromptsType.instructions,
                    applyTo: '**/*',
                    description: 'Description of my instructions file.',
                    tools: ['my-tool12'],
                }, 'Must have correct metadata.');
            });
        });
        suite('tools and agent compatibility', () => {
            test('ask agent', async function () {
                const rootFolderName = 'resolves-nested-file-references';
                const rootFolder = `/${rootFolderName}`;
                const rootUri = toUri(rootFolder);
                const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
                /**
                 * The file structure to be created on the disk for the test.
                 */
                [{
                        name: rootFolderName,
                        children: [
                            {
                                name: 'file1.prompt.md',
                                contents: [
                                    '## Some Header',
                                    'some contents',
                                    ' ',
                                ],
                            },
                            {
                                name: 'file2.prompt.md',
                                contents: [
                                    '---',
                                    'description: \'Description of my prompt.\'',
                                    'agent: "ask" ',
                                    '---',
                                    '## Files',
                                    '\t- this file #file:folder1/file3.prompt.md ',
                                    '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                    ' ',
                                ],
                            },
                            {
                                name: 'folder1',
                                children: [
                                    {
                                        name: 'file3.prompt.md',
                                        contents: [
                                            '---',
                                            'tools: [ \'my-tool1\' , ]',
                                            'agent: \'agent\'\t',
                                            '---',
                                            ' some more\t content',
                                        ],
                                    },
                                    {
                                        name: 'some-other-folder',
                                        children: [
                                            {
                                                name: 'file4.prompt.md',
                                                contents: [
                                                    '---',
                                                    'tools: [\'my-tool1\', "my-tool2", true, , ]',
                                                    'something: true',
                                                    'agent: \'ask\'\t',
                                                    '---',
                                                    '',
                                                    '',
                                                    'and some more content',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }], 
                /**
                 * The root file path to start the resolve process from.
                 */
                toUri(`/${rootFolderName}/file2.prompt.md`), 
                /**
                 * The expected references to be resolved.
                 */
                [
                    new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 6, 14)),
                    new ExpectedReference(rootUri, createMarkdownReference(7, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
                ]));
                const metadata = await test.run();
                assert.deepStrictEqual(metadata, {
                    promptType: PromptsType.prompt,
                    agent: ChatModeKind.Ask,
                    description: 'Description of my prompt.',
                }, 'Must have correct metadata.');
            });
            test('edit agent', async function () {
                const rootFolderName = 'resolves-nested-file-references';
                const rootFolder = `/${rootFolderName}`;
                const rootUri = toUri(rootFolder);
                const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
                /**
                 * The file structure to be created on the disk for the test.
                 */
                [{
                        name: rootFolderName,
                        children: [
                            {
                                name: 'file1.prompt.md',
                                contents: [
                                    '## Some Header',
                                    'some contents',
                                    ' ',
                                ],
                            },
                            {
                                name: 'file2.prompt.md',
                                contents: [
                                    '---',
                                    'description: \'Description of my prompt.\'',
                                    'agent:\t\t"edit"\t\t',
                                    '---',
                                    '## Files',
                                    '\t- this file #file:folder1/file3.prompt.md ',
                                    '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                    ' ',
                                ],
                            },
                            {
                                name: 'folder1',
                                children: [
                                    {
                                        name: 'file3.prompt.md',
                                        contents: [
                                            '---',
                                            'tools: [ \'my-tool1\' , ]',
                                            '---',
                                            ' some more\t content',
                                        ],
                                    },
                                    {
                                        name: 'some-other-folder',
                                        children: [
                                            {
                                                name: 'file4.prompt.md',
                                                contents: [
                                                    '---',
                                                    'tools: [\'my-tool1\', "my-tool2", true, , ]',
                                                    'something: true',
                                                    'agent: \'agent\'\t',
                                                    '---',
                                                    '',
                                                    '',
                                                    'and some more content',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }], 
                /**
                 * The root file path to start the resolve process from.
                 */
                toUri(`/${rootFolderName}/file2.prompt.md`), 
                /**
                 * The expected references to be resolved.
                 */
                [
                    new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 6, 14)),
                    new ExpectedReference(rootUri, createMarkdownReference(7, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
                ]));
                const metadata = await test.run();
                assert.deepStrictEqual(metadata, {
                    promptType: PromptsType.prompt,
                    agent: ChatModeKind.Edit,
                    description: 'Description of my prompt.',
                }, 'Must have correct metadata.');
            });
            test('agent', async function () {
                const rootFolderName = 'resolves-nested-file-references';
                const rootFolder = `/${rootFolderName}`;
                const rootUri = toUri(rootFolder);
                const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
                /**
                 * The file structure to be created on the disk for the test.
                 */
                [{
                        name: rootFolderName,
                        children: [
                            {
                                name: 'file1.prompt.md',
                                contents: [
                                    '## Some Header',
                                    'some contents',
                                    ' ',
                                ],
                            },
                            {
                                name: 'file2.prompt.md',
                                contents: [
                                    '---',
                                    'description: \'Description of my prompt.\'',
                                    'agent: \t\t "agent" \t\t ',
                                    '---',
                                    '## Files',
                                    '\t- this file #file:folder1/file3.prompt.md ',
                                    '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                    ' ',
                                ],
                            },
                            {
                                name: 'folder1',
                                children: [
                                    {
                                        name: 'file3.prompt.md',
                                        contents: [
                                            '---',
                                            'tools: [ \'my-tool1\' , ]',
                                            '---',
                                            ' some more\t content',
                                        ],
                                    },
                                    {
                                        name: 'some-other-folder',
                                        children: [
                                            {
                                                name: 'file4.prompt.md',
                                                contents: [
                                                    '---',
                                                    'tools: [\'my-tool1\', "my-tool2", true, , \'my-tool3\' , ]',
                                                    'something: true',
                                                    'agent: \'agent\'\t',
                                                    '---',
                                                    '',
                                                    '',
                                                    'and some more content',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }], 
                /**
                 * The root file path to start the resolve process from.
                 */
                toUri(`/${rootFolderName}/file2.prompt.md`), 
                /**
                 * The expected references to be resolved.
                 */
                [
                    new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 6, 14)),
                    new ExpectedReference(rootUri, createMarkdownReference(7, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
                ]));
                const metadata = await test.run();
                assert.deepStrictEqual(metadata, {
                    promptType: PromptsType.prompt,
                    agent: ChatModeKind.Agent,
                    description: 'Description of my prompt.',
                }, 'Must have correct metadata.');
            });
            test('no agent', async function () {
                const rootFolderName = 'resolves-nested-file-references';
                const rootFolder = `/${rootFolderName}`;
                const rootUri = toUri(rootFolder);
                const test = testDisposables.add(instantiationService.createInstance(TestPromptFileReference, 
                /**
                 * The file structure to be created on the disk for the test.
                 */
                [{
                        name: rootFolderName,
                        children: [
                            {
                                name: 'file1.prompt.md',
                                contents: [
                                    '## Some Header',
                                    'some contents',
                                    ' ',
                                ],
                            },
                            {
                                name: 'file2.prompt.md',
                                contents: [
                                    '---',
                                    'tools: [ \'my-tool12\' , ]',
                                    'description: \'Description of the prompt file.\'',
                                    '---',
                                    '## Files',
                                    '\t- this file #file:folder1/file3.prompt.md ',
                                    '\t- also this [file4.prompt.md](./folder1/some-other-folder/file4.prompt.md) please!',
                                    ' ',
                                ],
                            },
                            {
                                name: 'folder1',
                                children: [
                                    {
                                        name: 'file3.prompt.md',
                                        contents: [
                                            '---',
                                            'tools: [ \'my-tool1\' , ]',
                                            '---',
                                            ' some more\t content',
                                        ],
                                    },
                                    {
                                        name: 'some-other-folder',
                                        children: [
                                            {
                                                name: 'file4.prompt.md',
                                                contents: [
                                                    '---',
                                                    'tools: [\'my-tool1\', "my-tool2", true, , \'my-tool3\' , ]',
                                                    'something: true',
                                                    'agent: \'agent\'\t',
                                                    '---',
                                                    '',
                                                    '',
                                                    'and some more content',
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    }], 
                /**
                 * The root file path to start the resolve process from.
                 */
                toUri(`/${rootFolderName}/file2.prompt.md`), 
                /**
                 * The expected references to be resolved.
                 */
                [
                    new ExpectedReference(rootUri, createFileReference('folder1/file3.prompt.md', 6, 14)),
                    new ExpectedReference(rootUri, createMarkdownReference(7, 14, '[file4.prompt.md]', '(./folder1/some-other-folder/file4.prompt.md)')),
                ]));
                const metadata = await test.run();
                assert.deepStrictEqual(metadata, {
                    promptType: PromptsType.prompt,
                    tools: ['my-tool12'],
                    description: 'Description of the prompt file.',
                }, 'Must have correct metadata.');
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0RmlsZVJlZmVyZW5jZS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVJlZmVyZW5jZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDeEUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzNELE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDbEYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDekcsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDL0csT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUNyRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx1RUFBdUUsQ0FBQztBQUNuSCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN6RyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxrRkFBa0YsQ0FBQztBQUM1SCxPQUFPLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxNQUFNLDhDQUE4QyxDQUFD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