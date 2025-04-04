import * as vscode from 'vscode';
import * as FS from 'fs';

export interface ITracer extends vscode.Disposable {
  disposables: Array<vscode.Disposable>;

  // register the disposables to the context
  register(): void;

  // initialize the disposables array
  initializeDisposables(): void;
}

export interface IRecorder {
  context: vscode.ExtensionContext;

  // record a trace
  record(trace: ITrace): Promise<void>;

  // export the recorded traces
  export(): Promise<vscode.Uri>;

  // dispose the recorder
  dispose(): void;
}

export interface ITrace {
  // Note: the action_id should be prefixed with the tracer name to avoid conflicts
  action_id: string;

  // Note: the timestamp field is only optional in the interface for tracer's convenience
  // the recorder should always include a timestamp in the trace if not already present.
  timestamp?: number;

  event?: object;
}

export interface IExporter {
  // export the recorded traces
  export(stream: FS.ReadStream): vscode.Uri;
}
