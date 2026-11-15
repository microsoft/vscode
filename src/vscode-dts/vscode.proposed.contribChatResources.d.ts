/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// empty placeholder declaration for the `chatResources` contribution point

// The `chatResources` contribution point adds a resource to every chat whose resource exists. Each entry has an `id`, a
// `label`, an optional `icon`, and a `resource` URI template in which `${chatSessionId}` is replaced with the agent host's
// identifier of the chat and `${agentSessionId}` with the agent host's identifier of the session, the `<id>` of
// `ahp-session:/<id>`, which agents get from the `get_current_session` tool. While the resource exists, the chat lists it in its Artifacts pill, where it can be pinned and shown above
// the chat input, rendered by its default editor (for example a custom editor). Whatever makes the resource exist, such as
// the extension's file system provider or a tool that writes a file, makes it appear.
