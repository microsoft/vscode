/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

export default class Messages {

	public static MARKERS_PANEL_TOGGLE_LABEL:string= nls.localize('markers.panel.toggle.label', "Toggle Problems");

	public static MARKERS_PANEL_TITLE_NO_PROBLEMS:string= nls.localize('markers.panel.title.no.problems', "No problems");
	public static MARKERS_PANEL_TITLE_SHOWING_ONLY_ERRORS:string= nls.localize('markers.panel.title.showing.errors', "(Showing only Errors)");
	public static MARKERS_PANEL_TITLE_SHOWING_FILTERED:string= nls.localize('markers.panel.title.showing.filtered', "(Showing Filtered)");

	public static MARKERS_PANEL_NO_PROBLEMS_BUILT:string= nls.localize('markers.panel.no.problems.build', "This workspace is clear or not yet built");
	public static MARKERS_PANEL_NO_PROBLEMS_FILTERS:string= nls.localize('markers.panel.no.problems.filters', "No results found with provided filter criteria");
	public static MARKERS_PANEL_NO_ERRORS:string= nls.localize('markers.panel.no.errors', "This workspace has no errors");

	public static MARKERS_PANEL_ACTION_TOOLTIP_ONLY_ERRORS:string= nls.localize('markers.panel.action.only.errors', "Show only errors");
	public static MARKERS_PANEL_ACTION_TOOLTIP_ONLY_ERRORS_OFF:string= nls.localize('markers.panel.action.only.errors.off', "Show all");
	public static MARKERS_PANEL_ACTION_TOOLTIP_FILTER:string= nls.localize('markers.panel.action.filter', "Filter...");
	public static MARKERS_PANEL_FILTER_PLACEHOLDER:string= nls.localize('markers.panel.filter.placeholder', "Type to Filter");

	public static MARKERS_PANEL_SINGLE_ERROR_LABEL:string= nls.localize('markers.panel.single.error.label', "1 Error");
	public static MARKERS_PANEL_MULTIPLE_ERRORS_LABEL=(noOfErrors: number):string=>{return nls.localize('markers.panel.multiple.errors.label', "{0} Errors", ''+noOfErrors);};
	public static MARKERS_PANEL_SINGLE_WARNING_LABEL:string= nls.localize('markers.panel.single.warning.label', "1 Warning");
	public static MARKERS_PANEL_MULTIPLE_WARNINGS_LABEL=(noOfWarnings: number):string=>{return nls.localize('markers.panel.multiple.warnings.label', "{0} Warnings", ''+noOfWarnings);};
	public static MARKERS_PANEL_SINGLE_INFO_LABEL:string= nls.localize('markers.panel.single.info.label', "1 Info");
	public static MARKERS_PANEL_MULTIPLE_INFOS_LABEL=(noOfInfos: number):string=>{return nls.localize('markers.panel.multiple.infos.label', "{0} Infos", ''+noOfInfos);};
	public static MARKERS_PANEL_SINGLE_UNKNOWN_LABEL:string= nls.localize('markers.panel.single.unknown.label', "1 Unknown");
	public static MARKERS_PANEL_MULTIPLE_UNKNOWNS_LABEL=(noOfUnknowns: number):string=>{return nls.localize('markers.panel.multiple.unknowns.label', "{0} Unknowns", ''+noOfUnknowns);};

	public static MARKERS_PANEL_AT_LINE_NUMBER= (lineNumber: number):string=>{return nls.localize('markers.panel.at.line.number', "Line {0}: ", '' + lineNumber);}
}