/*
 * datacite.ts
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

import { CiteField, CSL } from "./csl";
import { ImageDimensions } from "./image";
import { LinkCapabilities, LinkTargets, LinkType } from "./link";
import { ListCapabilities, ListType } from "./list";
import { PandocAttr } from "./pandoc";
import { TableCapabilities } from "./table";

export interface EditorDialogs {
  alert: AlertFn;
  yesNoMessage: YesNoMessageFn;
  editLink: LinkEditorFn;
  editImage: ImageEditorFn;
  editCodeBlock: CodeBlockEditorFn;
  editList: ListEditorFn;
  editAttr: AttrEditorFn;
  editSpan: AttrEditorFn;
  editDiv: DivAttrEditorFn;
  editCallout: CalloutEditorFn;
  editRawInline: RawFormatEditorFn;
  editRawBlock: RawFormatEditorFn;
  editMath: MathEditorFn;
  insertTable: InsertTableFn;
  insertTabset: InsertTabsetFn;
  insertCite: InsertCiteFn;
  htmlDialog: EditorHTMLDialogFn;
}

export type EditorHTMLDialogFn = (
  title: string,
  okText: string | null,
  create: EditorHTMLDialogCreateFn,
  focus: () => void,
  validate: EditorHTMLDialogValidateFn,
) => Promise<boolean>;

export type EditorHTMLDialogCreateFn = (
  containerWidth: number,
  containerHeight: number,
  confirm: () => void,
  cancel: () => void,
  showProgress: (message: string) => void,
  hideProgress: () => void,
  themed?: boolean
) => HTMLElement;

export type EditorHTMLDialogValidateFn = () => string | null;

export const kAlertTypeInfo = 1;
export const kAlertTypeWarning = 2;
export const kAlertTypeError = 3;

export type AlertFn = (title: string, message: string, type: number) => Promise<boolean>;

export type YesNoMessageFn = (
  title: string,
  message: string,
  type: number,
  yesLabel: string,
  noLabel: string,
) => Promise<boolean>;

export type AttrEditorFn = (attr: AttrProps, idHint?: string) => Promise<AttrEditResult | null>;

export type DivAttrEditorFn = (attr: AttrProps, removeEnabled: boolean) => Promise<AttrEditResult | null>;

export type CalloutEditorFn = (props: CalloutEditProps, removeEnabled: boolean) => Promise<CalloutEditResult | null>;

export type LinkEditorFn = (
  link: LinkProps,
  targets: LinkTargets,
  capabilities: LinkCapabilities,
) => Promise<LinkEditResult | null>;

export type ImageEditorFn = (
  image: ImageProps,
  dims: ImageDimensions | null,
  figure: boolean,
  editAttributes: boolean,
) => Promise<ImageEditResult | null>;

export type CodeBlockEditorFn = (
  codeBlock: CodeBlockProps,
  attributes: boolean,
  languages: string[],
) => Promise<CodeBlockEditResult | null>;

export type ListEditorFn = (list: ListProps, capabilities: ListCapabilities) => Promise<ListEditResult | null>;

export type MathEditorFn = (id: string) => Promise<string | null>;

export type RawFormatEditorFn = (raw: RawFormatProps, outputFormats: string[]) => Promise<RawFormatResult | null>;

export type InsertTableFn = (capabilities: TableCapabilities) => Promise<InsertTableResult | null>;

export type InsertCiteFn = (props: InsertCiteProps) => Promise<InsertCiteResult | null>;

export type InsertTabsetFn = () => Promise<InsertTabsetResult | null>;

export interface AttrProps {
  readonly id?: string;
  readonly classes?: string[];
  readonly keyvalue?: Array<[string, string]>;
}

export interface AttrEditResult {
  readonly action: 'edit' | 'remove';
  readonly attr: AttrProps;
}

export interface UIToolsAttr {
  propsToInput(attr: AttrProps): AttrEditInput;
  inputToProps(input: AttrEditInput): AttrProps;
  pandocAutoIdentifier(text: string): string;
  asPandocId(id: string): string;
  asHtmlId(id: string | undefined) : string | undefined; 
}

export interface UIToolsImage {
  validUnits(): string[];
  percentUnit(): string;
  unitToPixels(value: number, unit: string, containerWidth: number): number;
  pixelsToUnit(pixels: number, unit: string, containerWidth: number): number;
  roundUnit(value: number, unit: string): string;
}


export interface CalloutEditProps {
  attr: PandocAttr;
  callout: CalloutProps;
}

export interface CalloutEditResult extends CalloutEditProps {
  readonly action: "edit" | "remove";
}

export interface CalloutProps {
  type: string;
  appearance: string;
  icon: boolean;
  caption: string;
}

export interface LinkProps extends AttrProps {
  readonly type: LinkType;
  readonly text: string;
  readonly href: string;
  readonly heading?: string;
  readonly title?: string;
}

export interface LinkEditResult {
  readonly action: 'edit' | 'remove';
  readonly link: LinkProps;
}

export interface ImageProps extends AttrProps {
  src: string | null;
  title?: string;
  caption?: string;
  alt?: string;
  align?: string;
  env?: string;
  linkTo?: string;
  width?: number;
  height?: number;
  units?: string;
  lockRatio?: boolean;
}

export type ImageEditResult = ImageProps;

export interface CodeBlockProps extends AttrProps {
  lang: string;
}

export type CodeBlockEditResult = CodeBlockProps;

export interface ListProps {
  type: ListType;
  tight: boolean;
  order: number;
  number_style: string;
  number_delim: string;
  incremental: "default" | "incremental" | "nonincremental";
}

export type ListEditResult = ListProps;

export interface InsertTableResult {
  rows: number;
  cols: number;
  header: boolean;
  caption?: string;
}

export interface InsertTabsetResult {
  tabs: string[];
  attr: PandocAttr;
}

export interface InsertCiteProps {
  doi: string;
  existingIds: string[];
  bibliographyFiles: string[];
  provider?: string;
  csl?: CSL;
  citeUI?: InsertCiteUI;
}

export interface InsertCiteUI {
  suggestedId: string;
  previewFields: CiteField[];
}

export interface InsertCiteResult {
  id: string;
  bibliographyFile: string;
  csl: CSL;
}

export interface RawFormatProps {
  content: string;
  format: string;
}

export interface RawFormatResult {
  readonly action: 'edit' | 'remove';
  readonly raw: RawFormatProps;
}

export interface AttrEditInput {
  id?: string;
  classes?: string;
  style?: string;
  keyvalue?: string;
}