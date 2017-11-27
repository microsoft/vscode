// Type definitions for gulp-tslint 3.6.0
// Project: https://github.com/panuhorsmalahti/gulp-tslint
// Definitions by: Asana <https://asana.com>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference types="node"/>
/// <reference types="vinyl" />

import vinyl = require("vinyl");

declare namespace gulpTsLint {
    interface GulpTsLint {
        (options?: Options): NodeJS.ReadWriteStream;
        report(reporter?: Reporter, options?: ReportOptions): NodeJS.ReadWriteStream;
        report(options?: ReportOptions): NodeJS.ReadWriteStream;
    }

    interface Options {
        configuration?: {},
        rulesDirectory?: string,
        tslint?: GulpTsLint
    }

    interface ReportOptions {
        emitError?: boolean,
        reportLimit?: number,
        summarizeFailureOutput?: boolean
    }

    interface Position {
        position: number;
        line: number;
        character: number;
    }

    interface Output {
        name: string;
        failure: string;
        startPosition: Position;
        endPosition: Position;
        ruleName: string;
    }

    type Reporter = string | ((output: Output[], file: vinyl, options: ReportOptions) => any);
}

declare var gulpTsLint: gulpTsLint.GulpTsLint;
export = gulpTsLint;