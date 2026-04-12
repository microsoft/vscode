"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Delete `VSCODE_CWD` very early. We have seen
// reports where `code .` would use the wrong
// current working directory due to our variable
// somehow escaping to the parent shell
// (https://github.com/microsoft/vscode/issues/126399)
delete process.env['VSCODE_CWD'];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYm9vdHN0cmFwLWNsaS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbImJvb3RzdHJhcC1jbGkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Z0dBR2dHO0FBRWhHLCtDQUErQztBQUMvQyw2Q0FBNkM7QUFDN0MsZ0RBQWdEO0FBQ2hELHVDQUF1QztBQUN2QyxzREFBc0Q7QUFDdEQsT0FBTyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDIn0=