export interface IStackInfo {
    fileName: string;
    lineNumber: number;
    function: string;
    source: string;
}
export interface IBreakpoint {
    line: number
    fileName: string
}

export enum ScopeType {
    global,
    local,
    args
}
export interface DebugVariable {
    name: string;
    addr: number;
    type: string;
    realType: string;
    //kind: GoReflectKind;
    value: string;
    len: number;
    cap: number;
    children: DebugVariable[];
    unreadable: string;
    scope: ScopeType;
}
export interface IExecutionResult {
    currentStack?: IStackInfo;
    errors?: string[];
    consoleOutput?: string[];
    completed?: boolean;
}