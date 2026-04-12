/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * CDP error codes following JSON-RPC 2.0 conventions
 */
export const CDPErrorCode = {
    /** Method not found */
    MethodNotFound: -32601,
    /** Invalid params */
    InvalidParams: -32602,
    /** Internal error */
    InternalError: -32603,
    /** Server error (generic) */
    ServerError: -32000,
};
/**
 * Base CDP error class with error code
 */
export class CDPError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'CDPError';
    }
}
/**
 * Error thrown when a CDP method is not found
 */
export class CDPMethodNotFoundError extends CDPError {
    constructor(method) {
        super(`Method not found: ${method}`, CDPErrorCode.MethodNotFound);
        this.name = 'CDPMethodNotFoundError';
    }
}
/**
 * Error thrown when CDP params are invalid
 */
export class CDPInvalidParamsError extends CDPError {
    constructor(message) {
        super(message, CDPErrorCode.InvalidParams);
        this.name = 'CDPInvalidParamsError';
    }
}
/**
 * Error thrown for internal CDP errors
 */
export class CDPInternalError extends CDPError {
    constructor(message) {
        super(message, CDPErrorCode.InternalError);
        this.name = 'CDPInternalError';
    }
}
/**
 * Error thrown for generic CDP server errors
 */
export class CDPServerError extends CDPError {
    constructor(message) {
        super(message, CDPErrorCode.ServerError);
        this.name = 'CDPServerError';
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHlwZXMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vY2RwL3R5cGVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHO0lBQzNCLHVCQUF1QjtJQUN2QixjQUFjLEVBQUUsQ0FBQyxLQUFLO0lBQ3RCLHFCQUFxQjtJQUNyQixhQUFhLEVBQUUsQ0FBQyxLQUFLO0lBQ3JCLHFCQUFxQjtJQUNyQixhQUFhLEVBQUUsQ0FBQyxLQUFLO0lBQ3JCLDZCQUE2QjtJQUM3QixXQUFXLEVBQUUsQ0FBQyxLQUFLO0NBQ1YsQ0FBQztBQUVYOztHQUVHO0FBQ0gsTUFBTSxPQUFPLFFBQVMsU0FBUSxLQUFLO0lBQ2xDLFlBQ0MsT0FBZSxFQUNOLElBQVk7UUFFckIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRk4sU0FBSSxHQUFKLElBQUksQ0FBUTtRQUdyQixJQUFJLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQztJQUN4QixDQUFDO0NBQ0Q7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyxzQkFBdUIsU0FBUSxRQUFRO0lBQ25ELFlBQVksTUFBYztRQUN6QixLQUFLLENBQUMscUJBQXFCLE1BQU0sRUFBRSxFQUFFLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUNsRSxJQUFJLENBQUMsSUFBSSxHQUFHLHdCQUF3QixDQUFDO0lBQ3RDLENBQUM7Q0FDRDtBQUVEOztHQUVHO0FBQ0gsTUFBTSxPQUFPLHFCQUFzQixTQUFRLFFBQVE7SUFDbEQsWUFBWSxPQUFlO1FBQzFCLEtBQUssQ0FBQyxPQUFPLEVBQUUsWUFBWSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQzNDLElBQUksQ0FBQyxJQUFJLEdBQUcsdUJBQXVCLENBQUM7SUFDckMsQ0FBQztDQUNEO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLE9BQU8sZ0JBQWlCLFNBQVEsUUFBUTtJQUM3QyxZQUFZLE9BQWU7UUFDMUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLElBQUksR0FBRyxrQkFBa0IsQ0FBQztJQUNoQyxDQUFDO0NBQ0Q7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyxjQUFlLFNBQVEsUUFBUTtJQUMzQyxZQUFZLE9BQWU7UUFDMUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxZQUFZLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLElBQUksR0FBRyxnQkFBZ0IsQ0FBQztJQUM5QixDQUFDO0NBQ0QifQ==