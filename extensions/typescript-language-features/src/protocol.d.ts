import * as Proto from 'typescript/lib/protocol';
export = Proto;

declare enum ServerType {
	Syntax = 'syntax',
	Semantic = 'semantic',
}
declare module 'typescript/lib/protocol' {

	interface Response {
		readonly _serverType?: ServerType;
	}

	interface FileReferencesRequest extends FileRequest {
	}
	interface FileReferencesResponseBody {
		/**
		 * The file locations referencing the symbol.
		 */
		refs: readonly ReferencesResponseItem[];
		/**
		 * The name of the symbol.
		 */
		symbolName: string;
	}
	interface FileReferencesResponse extends Response {
		body?: FileReferencesResponseBody;
	}
}

