import type { ShellCommand } from "../shell-types.d.ts";
import type { PmDeps } from "./pm-types.d.ts";
export declare function createBunCommand(deps: PmDeps): ShellCommand;
export declare function createBunxCommand(deps: PmDeps): ShellCommand;
