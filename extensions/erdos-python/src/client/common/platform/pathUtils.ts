// TODO: Drop this file.
// See https://github.com/microsoft/vscode-python/issues/8542.

import { inject, injectable } from 'inversify';
import * as path from 'path';
import { IPathUtils, IsWindows } from '../types';
import { OSType } from '../utils/platform';
import { Executables, FileSystemPaths, FileSystemPathUtils } from './fs-paths';
import { untildify } from '../helpers';

@injectable()
export class PathUtils implements IPathUtils {
    private readonly utils: FileSystemPathUtils;
    constructor(
        // "true" if targeting a Windows host.
        @inject(IsWindows) isWindows: boolean,
    ) {
        const osType = isWindows ? OSType.Windows : OSType.Unknown;
        // We cannot just use FileSystemPathUtils.withDefaults() because
        // of the isWindows arg.
        this.utils = new FileSystemPathUtils(
            untildify('~'),
            FileSystemPaths.withDefaults(),
            new Executables(path.delimiter, osType),
            path,
        );
    }

    public get home(): string {
        return this.utils.home;
    }

    public get delimiter(): string {
        return this.utils.executables.delimiter;
    }

    public get separator(): string {
        return this.utils.paths.sep;
    }

    // TODO: Deprecate in favor of IPlatformService?
    public getPathVariableName(): 'Path' | 'PATH' {
        return this.utils.executables.envVar as any;
    }

    public getDisplayName(pathValue: string, cwd?: string): string {
        return this.utils.getDisplayName(pathValue, cwd);
    }

    public basename(pathValue: string, ext?: string): string {
        return this.utils.paths.basename(pathValue, ext);
    }
}
