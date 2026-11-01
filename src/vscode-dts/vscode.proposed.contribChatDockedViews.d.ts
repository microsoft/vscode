/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// empty placeholder declaration for the `chatDockedViews` contribution point

// The `chatDockedViews` contribution point docks a view above the input of every chat whose per-chat resource
// exists, toggled by a pill. Each entry has an `id`, a `label`, an optional `icon`, and a `resource` URI template
// in which `${chatSessionId}` is replaced with the last path segment of the chat's session resource. The view is
// the resource's custom editor (see `customEditors`), shown readonly and sized to the height of its content.
