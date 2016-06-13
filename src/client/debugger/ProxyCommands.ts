"use strict";

export class Commands {
    public static ExitCommandBytes: Buffer = new Buffer("exit");
    public static StepIntoCommandBytes: Buffer = new Buffer("stpi");
    public static StepOutCommandBytes: Buffer = new Buffer("stpo");
    public static StepOverCommandBytes: Buffer = new Buffer("stpv");
    public static BreakAllCommandBytes: Buffer = new Buffer("brka");
    public static SetBreakPointCommandBytes: Buffer = new Buffer("brkp");
    public static SetBreakPointConditionCommandBytes: Buffer = new Buffer("brkc");
    public static SetBreakPointPassCountCommandBytes: Buffer = new Buffer("bkpc");
    public static GetBreakPointHitCountCommandBytes: Buffer = new Buffer("bkgh");
    public static SetBreakPointHitCountCommandBytes: Buffer = new Buffer("bksh");
    public static RemoveBreakPointCommandBytes: Buffer = new Buffer("brkr");
    public static ResumeAllCommandBytes: Buffer = new Buffer("resa");
    public static GetThreadFramesCommandBytes: Buffer = new Buffer("thrf");
    public static ExecuteTextCommandBytes: Buffer = new Buffer("exec");
    public static ResumeThreadCommandBytes: Buffer = new Buffer("rest");
    public static AutoResumeThreadCommandBytes: Buffer = new Buffer("ares");
    public static ClearSteppingCommandBytes: Buffer = new Buffer("clst");
    public static SetLineNumberCommand: Buffer = new Buffer("setl");
    public static GetChildrenCommandBytes: Buffer = new Buffer("chld");
    public static DetachCommandBytes: Buffer = new Buffer("detc");
    public static SetExceptionInfoCommandBytes: Buffer = new Buffer("sexi");
    public static SetExceptionHandlerInfoCommandBytes: Buffer = new Buffer("sehi");
    public static RemoveDjangoBreakPointCommandBytes: Buffer = new Buffer("bkdr");
    public static AddDjangoBreakPointCommandBytes: Buffer = new Buffer("bkda");
    public static ConnectReplCommandBytes: Buffer = new Buffer("crep");
    public static DisconnectReplCommandBytes: Buffer = new Buffer("drep");
    public static LastAckCommandBytes: Buffer = new Buffer("lack");
}
