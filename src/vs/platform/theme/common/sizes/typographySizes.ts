/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Remember to include this file in vscode/src/vs/platform/theme/common/sizeRegistry.ts

import * as nls from '../../../../nls.js';
import { registerSize } from '../sizeUtils.js';

export const baseLineHeightL = registerSize('base.line.height.l', { default: '22px' }, nls.localize('baseLineHeightL', "Line Height L"));
export const baseLineHeightM = registerSize('base.line.height.m', { default: '18px' }, nls.localize('baseLineHeightM', "Line Height M"));
export const baseLineHeightS = registerSize('base.line.height.s', { default: '13px' }, nls.localize('baseLineHeightS', "Line Height S"));
export const baseLineHeightXs = registerSize('base.line.height.xs', { default: '11px' }, nls.localize('baseLineHeightXs', "Line Height XS"));
export const fontBody1Size = registerSize('font.body1.size', { default: '13px' }, nls.localize('fontBody1Size', "Body1Size"));
export const fontBody2Size = registerSize('font.body2.size', { default: '12px' }, nls.localize('fontBody2Size', "Body2Size"));
export const fontBody3Size = registerSize('font.body3.size', { default: '11px' }, nls.localize('fontBody3Size', "Body3Size"));
export const fontCodiconSizeM = registerSize('font.codicon.size.m', { default: '16px' }, nls.localize('fontCodiconSizeM', "Codicon Size M"));
export const fontCodiconSizeL = registerSize('font.codicon.size.l', { default: '24px' }, nls.localize('fontCodiconSizeL', "Codicon Size L"));
export const fontHeading1Size = registerSize('font.heading1.size', { default: '26px' }, nls.localize('fontHeading1Size', "Heading1Size"));
export const fontHeading2Size = registerSize('font.heading2.size', { default: '14px' }, nls.localize('fontHeading2Size', "Heading2Size"));
export const fontHeading3Size = registerSize('font.heading3.size', { default: '13px' }, nls.localize('fontHeading3Size', "Heading3Size"));
export const fontHeading4Size = registerSize('font.heading4.size', { default: '11px' }, nls.localize('fontHeading4Size', "Heading4Size"));
export const fontHeading5Size = registerSize('font.heading5.size', { default: '11px' }, nls.localize('fontHeading5Size', "Heading5Size"));
export const fontHeading6Size = registerSize('font.heading6.size', { default: '11px' }, nls.localize('fontHeading6Size', "Heading6Size"));
export const fontLabel1Size = registerSize('font.label1.size', { default: '14px' }, nls.localize('fontLabel1Size', "Label1Size"));
export const fontLabel2Size = registerSize('font.label2.size', { default: '12px' }, nls.localize('fontLabel2Size', "Label2Size"));
export const fontLabel3Size = registerSize('font.label3.size', { default: '11px' }, nls.localize('fontLabel3Size', "Label3Size"));
export const fontLabel4Size = registerSize('font.label4.size', { default: '9px' }, nls.localize('fontLabel4Size', "Label4Size"));
export const fontMarkdownH1Size = registerSize('font.markdown.h1.size', { default: '26px' }, nls.localize('fontMarkdownH1Size', "Markdown H1Size"));
export const fontMarkdownH2Size = registerSize('font.markdown.h2.size', { default: '20px' }, nls.localize('fontMarkdownH2Size', "Markdown H2Size"));
export const fontMarkdownH3Size = registerSize('font.markdown.h3.size', { default: '15px' }, nls.localize('fontMarkdownH3Size', "Markdown H3Size"));
export const fontMarkdownH4Size = registerSize('font.markdown.h4.size', { default: '13px' }, nls.localize('fontMarkdownH4Size', "Markdown H4Size"));
export const fontMarkdownH5Size = registerSize('font.markdown.h5.size', { default: '11px' }, nls.localize('fontMarkdownH5Size', "Markdown H5Size"));
export const fontMarkdownH6Size = registerSize('font.markdown.h6.size', { default: '9px' }, nls.localize('fontMarkdownH6Size', "Markdown H6Size"));
export const fontMarkdownParagraphSize = registerSize('font.markdown.paragraph.size', { default: '13px' }, nls.localize('fontMarkdownParagraphSize', "Markdown Paragraph Size"));
