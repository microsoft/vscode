// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { FileSystem, FileSystemUtils, RawFileSystem } from '../client/common/platform/fileSystem';
import { FakeVSCodeFileSystemAPI } from './fakeVSCFileSystemAPI';

export class LegacyFileSystem extends FileSystem {
    constructor() {
        super();
        const vscfs = new FakeVSCodeFileSystemAPI();
        const raw = RawFileSystem.withDefaults(undefined, vscfs);
        this.utils = FileSystemUtils.withDefaults(raw);
    }
}
