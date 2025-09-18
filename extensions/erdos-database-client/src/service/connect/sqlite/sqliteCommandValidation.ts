import { Global } from "../../../common/global";
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { arch, platform } from 'os';
import { sync as commandExistsSync } from 'command-exists';

/**
 * Validate the sqlite3 command/path passed as argument, if not valid fallback to the binary in the bin directory.
 */
export function validateSqliteCommand(sqliteCommand: string): string {
    let isValid = sqliteCommand && isSqliteCommandValid(sqliteCommand);
    if (isValid) {
        return sqliteCommand;
    } else {
        return getSqliteBinariesPath();
    }
}

// verifies that the command/path passed as argument is an sqlite command
export function isSqliteCommandValid(sqliteCommand: string) {
    let proc = spawnSync(sqliteCommand, [`-version`]);
    if (proc.error) {
        console.debug(`'${sqliteCommand}' is not a valid SQLite command: ${proc.error}`);
        return false;
    }
    let error = proc.stderr.toString();
    let output = proc.stdout.toString();

    // if there is any error the command is note valid
    // Note: the string match is a workaround for CentOS (and maybe other OS's) where the command throws an error at the start but everything works fine
    if (error && !error.match(/\: \/lib64\/libtinfo\.so\.[0-9]+: no version information available \(required by /)) {
        console.debug(`'${sqliteCommand}' is not a valid SQLite command: ${error}`);
        return false;
    }

    // out must be: {version at least 3} {date} {time}}
    // this is a naive way to check that the command is for sqlite3 after version 3.9
    let match = output.match(/3\.(?:9|[0-9][0-9])\.[0-9]{1,2} [0-9]{4}\-[0-9]{2}\-[0-9]{2} [0-9]{2}\:[0-9]{2}\:[0-9]{2}/);

    if (!match) {
        console.debug(`'${sqliteCommand}' is not a valid SQLite command: version must be >= 3.9`);
    }

    return match ? true : false;
}


/**
 * Get the path of the sqlite3 binaries based on the platform.
 * If there are no binaries for the platform returns an empty string.
 */
export function getSqliteBinariesPath(): string {

    if (commandExistsSync('sqlite3')) {
        return 'sqlite3';
    }

    let plat = platform();
    let os_arch = arch();
    let sqliteBin: string;

    switch (plat) {
        case 'win32':
            sqliteBin = 'sqlite-v3.26.0-win32-x86.exe';
            break;
        case 'linux':
            if (os_arch === 'x64') {
                sqliteBin = 'sqlite-v3.26.0-linux-x64';
            } else {
                sqliteBin = 'sqlite-v3.26.0-linux-x86';
            }
            break;
        case 'darwin':
            sqliteBin = 'sqlite-v3.26.0-osx-x86';
            break;
        default:
            console.info(`Fallback binary not found: system OS not recognized.`);
            sqliteBin = '';
            break;
    }
    if (sqliteBin) {
        let path = `${Global.context.extensionPath}/sqlite/${sqliteBin}`;
        if (existsSync(path)) {
            console.debug(`Fallback SQLite binary found: '${path}'.`);
            return path;
        } else {
            console.debug(`Fallback SQLite binary not found: '${path}' does not exist.`);
            return '';
        }
    } else {
        return '';
    }
}