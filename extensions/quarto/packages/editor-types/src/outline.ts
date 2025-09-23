/*
 * outline.ts
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


export interface EditorOutlineItem {
  navigation_id: string;
  type: EditorOutlineItemType;
  level: number;
  sequence: number;
  title: string;
  children: EditorOutlineItem[];
}

export const kHeadingOutlineItemType = 'heading';
export const kRmdchunkOutlineItemType = 'rmd_chunk';
export const kYamlMetadataOutlineItemType = 'yaml_metadata';

export type EditorOutlineItemType = 'heading' | 'rmd_chunk' | 'yaml_metadata';

export type EditorOutline = EditorOutlineItem[];

export interface EditingOutlineLocationItem {
  type: EditorOutlineItemType;
  level: number;
  title: string;
  active: boolean;
  position: number;
}

export interface EditingOutlineLocation {
  items: EditingOutlineLocationItem[];
}

