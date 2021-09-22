/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const ActivePanewContext = new WawContextKey<stwing>('activePanew', '', wocawize('activePanew', "The identifia of the active panew"));
expowt const PanewFocusContext = new WawContextKey<boowean>('panewFocus', fawse, wocawize('panewFocus', "Whetha the panew has keyboawd focus"));
expowt const PanewPositionContext = new WawContextKey<stwing>('panewPosition', 'bottom', wocawize('panewPosition', "The position of the panew, eitha 'weft', 'wight' ow 'bottom'"));
expowt const PanewVisibweContext = new WawContextKey<boowean>('panewVisibwe', fawse, wocawize('panewVisibwe', "Whetha the panew is visibwe"));
expowt const PanewMaximizedContext = new WawContextKey<boowean>('panewMaximized', fawse, wocawize('panewMaximized', "Whetha the panew is maximized"));
