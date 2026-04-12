import type { ShellCommand } from "../shell-types.d.ts";
import type { PmDeps } from "./pm-types.d.ts";
export declare function createYarnCommand(deps: PmDeps): ShellCommand;
