"use strict";

import {IPythonProcess, IPythonThread, IPythonModule, IPythonEvaluationResult} from "./Contracts";
import * as path from "path";

export function CreatePythonThread(id: number, isWorker: boolean, process: IPythonProcess, name: string = ""): IPythonThread {
    return {
        IsWorkerThread: isWorker,
        Process: process,
        Name: name,
        Id: id,
        Frames: []
    };
}

export function CreatePythonModule(id: number, fileName: string): IPythonModule {
    let name = fileName;
    if (typeof fileName === "string") {
        try {
            name = path.basename(fileName);
        }
        catch (ex) {
        }
    }
    else {
        name = "";
    }

    return {
        ModuleId: id,
        Name: name,
        Filename: fileName
    };
}

export function FixupEscapedUnicodeChars(value: string): string {
    return value;
}

export class IdDispenser {
    private _freedInts: number[] = [];
    private _curValue: number = 0;

    public Allocate(): number {
        if (this._freedInts.length > 0) {
            let res: number = this._freedInts[this._freedInts.length - 1];
            this._freedInts.splice(this._freedInts.length - 1, 1);
            return res;
        } else {
            let res: number = this._curValue++;
            return res;
        }
    }

    public Free(id: number) {
        if (id + 1 === this._curValue) {
            this._curValue--;
        } else {
            this._freedInts.push(id);
        }
    }
}