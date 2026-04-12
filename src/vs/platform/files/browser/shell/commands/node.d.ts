import type { ShellCommand } from "../shell-types.d.ts";
import type { PmDeps } from "./pm-types.d.ts";
export declare function createNodeCommand(deps: PmDeps): ShellCommand;
export declare function createNpxCommand(deps: PmDeps): ShellCommand;
