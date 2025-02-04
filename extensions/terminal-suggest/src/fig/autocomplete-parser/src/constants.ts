/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const AWS_SPECS = ['aws', 'q'];
const UNIX_SPECS = [
  'cd',
  'git',
  'rm',
  'ls',
  'cat',
  'mv',
  'ssh',
  'cp',
  'chmod',
  'source',
  'curl',
  'make',
  'mkdir',
  'man',
  'ln',
  'grep',
  'kill',
];
const EDITOR_SPECS = ['code', 'nano', 'vi', 'vim', 'nvim'];
const JS_SPECS = ['node', 'npm', 'npx', 'yarn'];
const MACOS_SPECS = ['brew', 'open'];
const OTHER_SPECS = ['docker', 'python'];

export const MOST_USED_SPECS = [
  ...AWS_SPECS,
  ...UNIX_SPECS,
  ...EDITOR_SPECS,
  ...JS_SPECS,
  ...MACOS_SPECS,
  ...OTHER_SPECS,
];
