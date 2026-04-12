/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const ISSHRemoteAgentHostService = createDecorator('sshRemoteAgentHostService');
/**
 * IPC channel name for the main-process SSH service.
 */
export const SSH_REMOTE_AGENT_HOST_CHANNEL = 'sshRemoteAgentHost';
export var SSHAuthMethod;
(function (SSHAuthMethod) {
    /** Use the local SSH agent for key-based auth. */
    SSHAuthMethod["Agent"] = "agent";
    /** Authenticate with an explicit private key file. */
    SSHAuthMethod["KeyFile"] = "keyFile";
    /** Authenticate with a password. */
    SSHAuthMethod["Password"] = "password";
})(SSHAuthMethod || (SSHAuthMethod = {}));
/**
 * Main-process service that performs the actual SSH work.
 * The renderer calls this over IPC and handles registration
 * with {@link IRemoteAgentHostService} locally.
 */
export const ISSHRemoteAgentHostMainService = createDecorator('sshRemoteAgentHostMainService');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NoUmVtb3RlQWdlbnRIb3N0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBRTlFLE1BQU0sQ0FBQyxNQUFNLDBCQUEwQixHQUFHLGVBQWUsQ0FBNkIsMkJBQTJCLENBQUMsQ0FBQztBQUVuSDs7R0FFRztBQUNILE1BQU0sQ0FBQyxNQUFNLDZCQUE2QixHQUFHLG9CQUFvQixDQUFDO0FBRWxFLE1BQU0sQ0FBTixJQUFrQixhQU9qQjtBQVBELFdBQWtCLGFBQWE7SUFDOUIsa0RBQWtEO0lBQ2xELGdDQUFlLENBQUE7SUFDZixzREFBc0Q7SUFDdEQsb0NBQW1CLENBQUE7SUFDbkIsb0NBQW9DO0lBQ3BDLHNDQUFxQixDQUFBO0FBQ3RCLENBQUMsRUFQaUIsYUFBYSxLQUFiLGFBQWEsUUFPOUI7QUF1SUQ7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHLGVBQWUsQ0FBaUMsK0JBQStCLENBQUMsQ0FBQyJ9