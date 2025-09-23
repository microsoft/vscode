/*
 * basekeys-types.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */


import { CommandFn } from "./command";

export enum BaseKey {
  Home = 'Home',
  End = 'End',
  Enter = 'Enter',
  ModEnter = 'Mod-Enter',
  ShiftEnter = 'Shift-Enter',
  Backspace = 'Backspace',
  Delete = 'Delete|Mod-Delete', // Use pipes to register multiple commands
  Tab = 'Tab',
  ShiftTab = 'Shift-Tab',
  ArrowUp = 'Up|ArrowUp',
  ArrowDown = 'Down|ArrowDown',
  ArrowLeft = 'Left|ArrowLeft',
  ArrowRight = 'Right|ArrowRight',
  ModArrowUp = 'Mod-Up|Mod-ArrowUp',
  ModArrowDown = 'Mod-Down|Mod-ArrowDown',
  CtrlHome = 'Ctrl-Home',
  CtrlEnd = 'Ctrl-End',
  ShiftArrowLeft = 'Shift-Left|Shift-ArrowLeft',
  ShiftArrowRight = 'Shift-Right|Shift-ArrowRight',
  AltArrowLeft = 'Alt-Left|Alt-ArrowLeft',
  AltArrowRight = 'Alt-Right|Alt-ArrowRight',
  CtrlArrowLeft = 'Ctrl-Left|Ctrl-ArrowLeft',
  CtrlArrowRight = 'Ctrl-Right|Ctrl-ArrowRight',
  CtrlShiftArrowLeft = 'Ctrl-Shift-Left|Ctrl-Shift-ArrowLeft',
  CtrlShiftArrowRight = 'Ctrl-Shift-Right|Ctrl-Shift-ArrowRight',
}

export interface BaseKeyBinding {
  key: BaseKey;
  command: CommandFn;
}
