/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//#endregion
/**
 * Schema updated from the Model Context Protocol repository at
 * https://github.com/modelcontextprotocol/specification/tree/main/schema
 *
 * ⚠️ Do not edit within `namespace` manually except to update schema versions ⚠️
 */
export var MCP;
(function (MCP) {
    /* JSON-RPC types */
    /** @internal */
    MCP.LATEST_PROTOCOL_VERSION = "2025-11-25";
    /** @internal */
    MCP.JSONRPC_VERSION = "2.0";
    // Standard JSON-RPC error codes
    MCP.PARSE_ERROR = -32700;
    MCP.INVALID_REQUEST = -32600;
    MCP.METHOD_NOT_FOUND = -32601;
    MCP.INVALID_PARAMS = -32602;
    MCP.INTERNAL_ERROR = -32603;
    // Implementation-specific JSON-RPC error codes [-32000, -32099]
    /** @internal */
    MCP.URL_ELICITATION_REQUIRED = -32042;
})(MCP || (MCP = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9kZWxDb250ZXh0UHJvdG9jb2wuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3AvY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBaUJoRyxZQUFZO0FBRVo7Ozs7O0dBS0c7QUFDSCxNQUFNLEtBQVcsR0FBRyxDQWdyR25CO0FBaHJHRCxXQUFpQixHQUFHO0lBQ25CLG9CQUFvQjtJQVlwQixnQkFBZ0I7SUFDSCwyQkFBdUIsR0FBRyxZQUFZLENBQUM7SUFDcEQsZ0JBQWdCO0lBQ0gsbUJBQWUsR0FBRyxLQUFLLENBQUM7SUF5THJDLGdDQUFnQztJQUNuQixlQUFXLEdBQUcsQ0FBQyxLQUFLLENBQUM7SUFDckIsbUJBQWUsR0FBRyxDQUFDLEtBQUssQ0FBQztJQUN6QixvQkFBZ0IsR0FBRyxDQUFDLEtBQUssQ0FBQztJQUMxQixrQkFBYyxHQUFHLENBQUMsS0FBSyxDQUFDO0lBQ3hCLGtCQUFjLEdBQUcsQ0FBQyxLQUFLLENBQUM7SUE2RnJDLGdFQUFnRTtJQUNoRSxnQkFBZ0I7SUFDSCw0QkFBd0IsR0FBRyxDQUFDLEtBQUssQ0FBQztBQW00RmhELENBQUMsRUFockdnQixHQUFHLEtBQUgsR0FBRyxRQWdyR25CIn0=