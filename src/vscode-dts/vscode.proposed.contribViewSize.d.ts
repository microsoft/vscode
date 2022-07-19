/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// empty placeholder for view size

// https://github.com/microsoft/vscode/issues/122283 @alexr00

/**
 * View contributions can include a `size`, which can be `fit` or a number. Using a number works similar to the css flex property.
 *
 * For example, if you have 3 views, with sizes 1, 1, and 2, the views of size 1 will together take up the same amount of space as the view of size 2.
 *
 * A view with `size` `fit` will try to fit the contents of the view. Currently only supported for tree views.
 *
 * A number value will only be used as an initial size.
 * A 'fit' value will always be respected.
*/

