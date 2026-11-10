/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// empty placeholder declaration for the `chatResources` contribution point

// The `chatResources` contribution point adds a resource to every chat whose per-chat resource exists. Each entry has an
// `id`, a `label`, an optional `icon`, a `resource` URI template in which `${chatSessionId}` is replaced with the last path
// segment of the chat's session resource, and an optional `mode`: `pinned` (default) gives the resource a pill that opens
// it in an editor; `embedded` gives it a pill that shows it above the chat input, rendered readonly by its default editor (for
// example a custom editor) and sized to the height of its content. Users can also show a resource at the top of the chat.