/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

export default class Messages {

	public static MARKERS_PANEL_VIEW_CATEGORY:string= nls.localize('viewCategory', "View");
	public static MARKERS_PANEL_TOGGLE_LABEL:string= nls.localize('markers.panel.toggle.label', "Toggle Problems");

	public static MARKERS_PANEL_TITLE_NO_PROBLEMS:string= nls.localize('markers.panel.title.no.problems', "No problems");

	public static MARKERS_PANEL_NO_PROBLEMS_BUILT:string= nls.localize('markers.panel.no.problems.build', "No errors have been detected in the workspace so far.");
	public static MARKERS_PANEL_NO_PROBLEMS_FILTERS:string= nls.localize('markers.panel.no.problems.filters', "No results found with provided filter criteria");

	public static MARKERS_PANEL_ACTION_TOOLTIP_FILTER:string= nls.localize('markers.panel.action.filter', "Filter Problems");
	public static MARKERS_PANEL_FILTER_PLACEHOLDER:string= nls.localize('markers.panel.filter.placeholder', "Filter by type or text");
	public static MARKERS_PANEL_FILTER_ERRORS:string= nls.localize('markers.panel.filter.errors', "errors");
	public static MARKERS_PANEL_FILTER_WARNINGS:string= nls.localize('markers.panel.filter.warnings', "warnings");
	public static MARKERS_PANEL_FILTER_INFOS:string= nls.localize('markers.panel.filter.infos', "infos");

	public static MARKERS_PANEL_SINGLE_ERROR_LABEL:string= nls.localize('markers.panel.single.error.label', "1 Error");
	public static MARKERS_PANEL_MULTIPLE_ERRORS_LABEL=(noOfErrors: number):string=>{return nls.localize('markers.panel.multiple.errors.label', "{0} Errors", ''+noOfErrors);};
	public static MARKERS_PANEL_SINGLE_WARNING_LABEL:string= nls.localize('markers.panel.single.warning.label', "1 Warning");
	public static MARKERS_PANEL_MULTIPLE_WARNINGS_LABEL=(noOfWarnings: number):string=>{return nls.localize('markers.panel.multiple.warnings.label', "{0} Warnings", ''+noOfWarnings);};
	public static MARKERS_PANEL_SINGLE_INFO_LABEL:string= nls.localize('markers.panel.single.info.label', "1 Info");
	public static MARKERS_PANEL_MULTIPLE_INFOS_LABEL=(noOfInfos: number):string=>{return nls.localize('markers.panel.multiple.infos.label', "{0} Infos", ''+noOfInfos);};
	public static MARKERS_PANEL_SINGLE_UNKNOWN_LABEL:string= nls.localize('markers.panel.single.unknown.label', "1 Unknown");
	public static MARKERS_PANEL_MULTIPLE_UNKNOWNS_LABEL=(noOfUnknowns: number):string=>{return nls.localize('markers.panel.multiple.unknowns.label', "{0} Unknowns", ''+noOfUnknowns);};

	public static MARKERS_PANEL_AT_LINE_COL_NUMBER= (ln: number, col: number):string=>{return nls.localize('markers.panel.at.ln.col.number', "Ln {0}, Col {1}", '' + ln, '' + col);}
	public static MARKERS_PANEL_TITLE_AT_LINE_COL_NUMBER= (ln: number, col: number):string=>{return nls.localize('markers.panel.title.at.ln.col.number', "At line {0}, column {1}", '' + ln, '' + col);}
	public static MARKERS_PANEL_TITLE_SOURCE= (source: string):string=>{return nls.localize('markers.panel.title.source', "Built by {0}", source);}
}