/*
 * diff.ts
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

import { diff_match_patch, DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT } from 'diff-match-patch';

export enum EditorChangeType {
  Insert = 1,
  Equal = 0,
  Delete = -1,
}

export interface EditorChange {
  type: EditorChangeType;
  value: string;
}

export function diffChars(from: string, to: string, timeout: number): EditorChange[] {
  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = timeout;
  const diff = dmp.diff_main(from, to);
  dmp.diff_cleanupSemantic(diff);
  return diff.map(d => {
    let type: EditorChangeType;
    switch (d[0]) {
      case DIFF_INSERT:
        type = EditorChangeType.Insert;
        break;
      case DIFF_EQUAL:
        type = EditorChangeType.Equal;
        break;
      case DIFF_DELETE:
        type = EditorChangeType.Delete;
        break;
      default:
        throw new Error('Unexpected diff type: ' + d[0]);
    }
    return {
      type,
      value: d[1],
    };
  });
}
