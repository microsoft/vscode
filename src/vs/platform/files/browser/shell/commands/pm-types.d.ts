import type { ShellResult, ShellContext } from "../shell-types.d.ts";
export type PkgManager = "npm" | "pnpm" | "yarn" | "bun";
export interface PmDeps {
    installPackages: (args: string[], ctx: ShellContext, pm?: PkgManager) => Promise<ShellResult>;
    uninstallPackages: (args: string[], ctx: ShellContext, pm?: PkgManager) => Promise<ShellResult>;
    listPackages: (ctx: ShellContext, pm?: PkgManager) => Promise<ShellResult>;
    runScript: (args: string[], ctx: ShellContext) => Promise<ShellResult>;
    npmInitOrCreate: (args: string[], sub: string, ctx: ShellContext) => Promise<ShellResult>;
    npmInfo: (args: string[], ctx: ShellContext) => Promise<ShellResult>;
    npmPack: (ctx: ShellContext) => ShellResult;
    npmConfig: (args: string[], ctx: ShellContext) => ShellResult;
    npxExecute: (params: string[], ctx: ShellContext) => Promise<ShellResult>;
    executeNodeBinary: (filePath: string, args: string[], ctx: ShellContext, opts?: {
        isFork?: boolean;
    }) => Promise<ShellResult>;
    evalCode: (code: string, ctx: ShellContext) => ShellResult;
    printCode: (code: string, ctx: ShellContext) => ShellResult;
    removeNodeModules: (cwd: string) => void;
    formatErr: (msg: string, pm: PkgManager) => string;
    formatWarn: (msg: string, pm: PkgManager) => string;
    hasFile: (path: string) => boolean;
    readFile: (path: string) => string;
    writeFile: (path: string, data: string) => void;
    npmPkg?: (args: string[], ctx: ShellContext) => ShellResult;
}
