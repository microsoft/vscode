// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// "python" contains functions corresponding to the various ways that
// the extension invokes a Python executable internally.  Each function
// takes arguments relevant to the specific use case.  However, each
// always *returns* a list of strings for the commandline arguments that
// should be used when invoking the Python executable for the specific
// use case, whether through spawn/exec or a terminal.
//
// Where relevant (nearly always), the function also returns a "parse"
// function that may be used to deserialize the stdout of the command
// into the corresponding object or objects.  "parse()" takes a single
// string as the stdout text and returns the relevant data.

export function execCode(code: string): string[] {
    let args = ['-c', code];
    // "code" isn't specific enough to know how to parse it,
    // so we only return the args.
    return args;
}

export function execModule(name: string, moduleArgs: string[]): string[] {
    const args = ['-m', name, ...moduleArgs];
    // "code" isn't specific enough to know how to parse it,
    // so we only return the args.
    return args;
}

export function getExecutable(): [string[], (out: string) => string] {
    const args = ['-c', 'import sys;print(sys.executable)'];

    function parse(out: string): string {
        return out.trim();
    }

    return [args, parse];
}

export function getSitePackages(): [string[], (out: string) => string] {
    // On windows we also need the libs path (second item will
    // return c:\xxx\lib\site-packages).  This is returned by
    // the following: get_python_lib
    const args = ['-c', 'from distutils.sysconfig import get_python_lib; print(get_python_lib())'];

    function parse(out: string): string {
        return out.trim();
    }

    return [args, parse];
}

export function getUserSitePackages(): [string[], (out: string) => string] {
    const args = ['site', '--user-site'];

    function parse(out: string): string {
        return out.trim();
    }

    return [args, parse];
}

export function isValid(): [string[], (out: string) => boolean] {
    const args = ['-c', 'print(1234)'];

    function parse(out: string): boolean {
        return out.startsWith('1234');
    }

    return [args, parse];
}

export function isModuleInstalled(name: string): [string[], (out: string) => boolean] {
    const args = ['-c', `import ${name}`];

    function parse(_out: string): boolean {
        // If the command did not fail then the module is installed.
        return true;
    }

    return [args, parse];
}

export function getModuleVersion(name: string): [string[], (out: string) => string] {
    const args = ['-c', `import ${name}; print(${name}.__version__)`];

    function parse(out: string): string {
        return out.trim();
    }

    return [args, parse];
}
