import * as Proto from 'typescript/lib/protocol';
export = Proto;

declare module "typescript/lib/protocol" {
	// TODO: Remove this hardcoded type once we update to TS 3.8+ that brings in the proper types
	interface Response {
		performanceData?: {
			updateGraphDurationMs?: number;
		}
	}

	const enum CommandTypes {
		PrepareCallHierarchy = "prepareCallHierarchy",
		ProvideCallHierarchyIncomingCalls = "provideCallHierarchyIncomingCalls",
		ProvideCallHierarchyOutgoingCalls = "provideCallHierarchyOutgoingCalls",
	}

	interface CallHierarchyItem {
		name: string;
		kind: ScriptElementKind;
		file: string;
		span: TextSpan;
		selectionSpan: TextSpan;
	}

	interface CallHierarchyIncomingCall {
		from: CallHierarchyItem;
		fromSpans: TextSpan[];
	}

	interface CallHierarchyOutgoingCall {
		to: CallHierarchyItem;
		fromSpans: TextSpan[];
	}

	interface PrepareCallHierarchyRequest extends FileLocationRequest {
		command: CommandTypes.PrepareCallHierarchy;
	}

	interface PrepareCallHierarchyResponse extends Response {
		readonly body: CallHierarchyItem | CallHierarchyItem[];
	}

	interface ProvideCallHierarchyIncomingCallsRequest extends FileLocationRequest {
		command: CommandTypes.ProvideCallHierarchyIncomingCalls;
		kind: ScriptElementKind;
	}

	interface ProvideCallHierarchyIncomingCallsResponse extends Response {
		readonly body: CallHierarchyIncomingCall[];
	}

	interface ProvideCallHierarchyOutgoingCallsRequest extends FileLocationRequest {
		command: CommandTypes.ProvideCallHierarchyOutgoingCalls;
		kind: ScriptElementKind;
	}

	interface ProvideCallHierarchyOutgoingCallsResponse extends Response {
		readonly body: CallHierarchyOutgoingCall[];
	}
}
