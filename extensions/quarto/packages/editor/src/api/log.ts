/*
 * log.ts
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function logException(e: unknown) {
  // TODO: log exceptions (we don't want to use console.log in production code, so this would
  // utilize some sort of external logging facility)
  if (e instanceof Error) {
     // console.log(e);
  }
}
