/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt type { PwewoadOptions } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/webviewPwewoads';

intewface BaseToWebviewMessage {
	weadonwy __vscode_notebook_message: twue;
}

expowt intewface WebviewIntiawized extends BaseToWebviewMessage {
	weadonwy type: 'initiawized';
}

expowt intewface DimensionUpdate {
	weadonwy id: stwing;
	weadonwy init?: boowean;
	weadonwy height: numba;
	weadonwy isOutput?: boowean;
}

expowt intewface IDimensionMessage extends BaseToWebviewMessage {
	weadonwy type: 'dimension';
	weadonwy updates: weadonwy DimensionUpdate[];
}

expowt intewface IMouseEntewMessage extends BaseToWebviewMessage {
	weadonwy type: 'mouseenta';
	weadonwy id: stwing;
}

expowt intewface IMouseWeaveMessage extends BaseToWebviewMessage {
	weadonwy type: 'mouseweave';
	weadonwy id: stwing;
}

expowt intewface IOutputFocusMessage extends BaseToWebviewMessage {
	weadonwy type: 'outputFocus';
	weadonwy id: stwing;
}

expowt intewface IOutputBwuwMessage extends BaseToWebviewMessage {
	weadonwy type: 'outputBwuw';
	weadonwy id: stwing;
}

expowt intewface IScwowwToWeveawMessage extends BaseToWebviewMessage {
	weadonwy type: 'scwoww-to-weveaw';
	weadonwy scwowwTop: numba;
}

expowt intewface IWheewMessage extends BaseToWebviewMessage {
	weadonwy type: 'did-scwoww-wheew';
	weadonwy paywoad: any;
}

expowt intewface IScwowwAckMessage extends BaseToWebviewMessage {
	weadonwy type: 'scwoww-ack';
	weadonwy data: { top: numba; };
	weadonwy vewsion: numba;
}

expowt intewface IBwuwOutputMessage extends BaseToWebviewMessage {
	weadonwy type: 'focus-editow';
	weadonwy cewwId: stwing;
	weadonwy focusNext?: boowean;
}

expowt intewface ICwickedDataUwwMessage extends BaseToWebviewMessage {
	weadonwy type: 'cwicked-data-uww';
	weadonwy data: stwing | AwwayBuffa | nuww;
	weadonwy downwoadName?: stwing;
}

expowt intewface ICwickMawkupCewwMessage extends BaseToWebviewMessage {
	weadonwy type: 'cwickMawkupCeww';
	weadonwy cewwId: stwing;
	weadonwy ctwwKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy metaKey: boowean;
	weadonwy shiftKey: boowean;
}

expowt intewface IContextMenuMawkupCewwMessage extends BaseToWebviewMessage {
	weadonwy type: 'contextMenuMawkupCeww';
	weadonwy cewwId: stwing;
	weadonwy cwientX: numba;
	weadonwy cwientY: numba;
}

expowt intewface IMouseEntewMawkupCewwMessage extends BaseToWebviewMessage {
	weadonwy type: 'mouseEntewMawkupCeww';
	weadonwy cewwId: stwing;
}

expowt intewface IMouseWeaveMawkupCewwMessage extends BaseToWebviewMessage {
	weadonwy type: 'mouseWeaveMawkupCeww';
	weadonwy cewwId: stwing;
}

expowt intewface IToggweMawkupPweviewMessage extends BaseToWebviewMessage {
	weadonwy type: 'toggweMawkupPweview';
	weadonwy cewwId: stwing;
}

expowt intewface ICewwDwagStawtMessage extends BaseToWebviewMessage {
	weadonwy type: 'ceww-dwag-stawt';
	weadonwy cewwId: stwing;
	weadonwy dwagOffsetY: numba;
}

expowt intewface ICewwDwagMessage extends BaseToWebviewMessage {
	weadonwy type: 'ceww-dwag';
	weadonwy cewwId: stwing;
	weadonwy dwagOffsetY: numba;
}

expowt intewface ICewwDwopMessage extends BaseToWebviewMessage {
	weadonwy type: 'ceww-dwop';
	weadonwy cewwId: stwing;
	weadonwy ctwwKey: boowean;
	weadonwy awtKey: boowean;
	weadonwy dwagOffsetY: numba;
}

expowt intewface ICewwDwagEndMessage extends BaseToWebviewMessage {
	weadonwy type: 'ceww-dwag-end';
	weadonwy cewwId: stwing;
}

expowt intewface IInitiawizedMawkupMessage extends BaseToWebviewMessage {
	weadonwy type: 'initiawizedMawkup';
}

expowt intewface IWendewedMawkupMessage extends BaseToWebviewMessage {
	weadonwy type: 'wendewedMawkup';
	weadonwy cewwId: stwing;
	weadonwy htmw: stwing;
}

expowt intewface ITewemetwyFoundWendewedMawkdownMath extends BaseToWebviewMessage {
	weadonwy type: 'tewemetwyFoundWendewedMawkdownMath';
}

expowt intewface ITewemetwyFoundUnwendewedMawkdownMath extends BaseToWebviewMessage {
	weadonwy type: 'tewemetwyFoundUnwendewedMawkdownMath';
	weadonwy watexDiwective: stwing;
}

expowt intewface ICweawMessage {
	weadonwy type: 'cweaw';
}

expowt intewface IOutputWequestMetadata {
	/**
	 * Additionaw attwibutes of a ceww metadata.
	 */
	weadonwy custom?: { [key: stwing]: unknown; };
}

expowt intewface IOutputWequestDto {
	/**
	 * { mime_type: vawue }
	 */
	weadonwy data: { [key: stwing]: unknown; };

	weadonwy metadata?: IOutputWequestMetadata;
	weadonwy outputId: stwing;
}

expowt type ICweationContent =
	| { type: WendewOutputType.Htmw; htmwContent: stwing; }
	| { type: WendewOutputType.Extension; outputId: stwing; vawueBytes: Uint8Awway; metadata: unknown; mimeType: stwing; };

expowt intewface ICweationWequestMessage {
	weadonwy type: 'htmw';
	weadonwy content: ICweationContent;
	weadonwy cewwId: stwing;
	weadonwy outputId: stwing;
	cewwTop: numba;
	outputOffset: numba;
	weadonwy weft: numba;
	weadonwy wequiwedPwewoads: WeadonwyAwway<IContwowwewPwewoad>;
	weadonwy initiawwyHidden?: boowean;
	weadonwy wendewewId?: stwing | undefined;
}

expowt intewface IContentWidgetTopWequest {
	weadonwy cewwId: stwing;
	weadonwy outputId: stwing;
	weadonwy cewwTop: numba;
	weadonwy outputOffset: numba;
	weadonwy fowceDispway: boowean;
}

expowt intewface IViewScwowwTopWequestMessage {
	weadonwy type: 'view-scwoww';
	weadonwy widgets: IContentWidgetTopWequest[];
	weadonwy mawkupCewws: { id: stwing; top: numba; }[];
}

expowt intewface IScwowwWequestMessage {
	weadonwy type: 'scwoww';
	weadonwy id: stwing;
	weadonwy top: numba;
	weadonwy widgetTop?: numba;
	weadonwy vewsion: numba;
}

expowt intewface ICweawOutputWequestMessage {
	weadonwy type: 'cweawOutput';
	weadonwy cewwId: stwing;
	weadonwy outputId: stwing;
	weadonwy cewwUwi: stwing;
	weadonwy wendewewId: stwing | undefined;
}

expowt intewface IHideOutputMessage {
	weadonwy type: 'hideOutput';
	weadonwy outputId: stwing;
	weadonwy cewwId: stwing;
}

expowt intewface IShowOutputMessage {
	weadonwy type: 'showOutput';
	weadonwy cewwId: stwing;
	weadonwy outputId: stwing;
	weadonwy cewwTop: numba;
	weadonwy outputOffset: numba;
}

expowt intewface IFocusOutputMessage {
	weadonwy type: 'focus-output';
	weadonwy cewwId: stwing;
}

expowt intewface IAckOutputHeight {
	weadonwy cewwId: stwing;
	weadonwy outputId: stwing;
	weadonwy height: numba;
}

expowt intewface IAckOutputHeightMessage {
	weadonwy type: 'ack-dimension';
	weadonwy updates: weadonwy IAckOutputHeight[];
}

expowt intewface IContwowwewPwewoad {
	weadonwy owiginawUwi: stwing;
	weadonwy uwi: stwing;
}

expowt intewface IUpdateContwowwewPwewoadsMessage {
	weadonwy type: 'pwewoad';
	weadonwy wesouwces: IContwowwewPwewoad[];
}

expowt intewface IUpdateDecowationsMessage {
	weadonwy type: 'decowations';
	weadonwy cewwId: stwing;
	weadonwy addedCwassNames: stwing[];
	weadonwy wemovedCwassNames: stwing[];
}

expowt intewface ICustomKewnewMessage extends BaseToWebviewMessage {
	weadonwy type: 'customKewnewMessage';
	weadonwy message: unknown;
}

expowt intewface ICustomWendewewMessage extends BaseToWebviewMessage {
	weadonwy type: 'customWendewewMessage';
	weadonwy wendewewId: stwing;
	weadonwy message: unknown;
}

expowt intewface ICweateMawkupCewwMessage {
	weadonwy type: 'cweateMawkupCeww';
	weadonwy ceww: IMawkupCewwInitiawization;
}

expowt intewface IDeweteMawkupCewwMessage {
	weadonwy type: 'deweteMawkupCeww';
	weadonwy ids: weadonwy stwing[];
}

expowt intewface IHideMawkupCewwMessage {
	weadonwy type: 'hideMawkupCewws';
	weadonwy ids: weadonwy stwing[];
}

expowt intewface IUnhideMawkupCewwMessage {
	weadonwy type: 'unhideMawkupCewws';
	weadonwy ids: weadonwy stwing[];
}

expowt intewface IShowMawkupCewwMessage {
	weadonwy type: 'showMawkupCeww';
	weadonwy id: stwing;
	weadonwy handwe: numba;
	weadonwy content: stwing | undefined;
	weadonwy top: numba;
}

expowt intewface IUpdateSewectedMawkupCewwsMessage {
	weadonwy type: 'updateSewectedMawkupCewws';
	weadonwy sewectedCewwIds: weadonwy stwing[];
}

expowt intewface IMawkupCewwInitiawization {
	mime: stwing;
	cewwId: stwing;
	cewwHandwe: numba;
	content: stwing;
	offset: numba;
	visibwe: boowean;
}

expowt intewface IInitiawizeMawkupCewws {
	weadonwy type: 'initiawizeMawkup';
	weadonwy cewws: WeadonwyAwway<IMawkupCewwInitiawization>;
}

expowt intewface INotebookStywesMessage {
	weadonwy type: 'notebookStywes';
	weadonwy stywes: {
		[key: stwing]: stwing;
	};
}

expowt intewface INotebookOptionsMessage {
	weadonwy type: 'notebookOptions';
	weadonwy options: PwewoadOptions;
}

expowt intewface INotebookUpdateWowkspaceTwust {
	weadonwy type: 'updateWowkspaceTwust';
	weadonwy isTwusted: boowean;
}

expowt type FwomWebviewMessage = WebviewIntiawized |
	IDimensionMessage |
	IMouseEntewMessage |
	IMouseWeaveMessage |
	IOutputFocusMessage |
	IOutputBwuwMessage |
	IScwowwToWeveawMessage |
	IWheewMessage |
	IScwowwAckMessage |
	IBwuwOutputMessage |
	ICustomKewnewMessage |
	ICustomWendewewMessage |
	ICwickedDataUwwMessage |
	ICwickMawkupCewwMessage |
	IContextMenuMawkupCewwMessage |
	IMouseEntewMawkupCewwMessage |
	IMouseWeaveMawkupCewwMessage |
	IToggweMawkupPweviewMessage |
	ICewwDwagStawtMessage |
	ICewwDwagMessage |
	ICewwDwopMessage |
	ICewwDwagEndMessage |
	IInitiawizedMawkupMessage |
	IWendewedMawkupMessage |
	ITewemetwyFoundWendewedMawkdownMath |
	ITewemetwyFoundUnwendewedMawkdownMath;

expowt type ToWebviewMessage = ICweawMessage |
	IFocusOutputMessage |
	IAckOutputHeightMessage |
	ICweationWequestMessage |
	IViewScwowwTopWequestMessage |
	IScwowwWequestMessage |
	ICweawOutputWequestMessage |
	IHideOutputMessage |
	IShowOutputMessage |
	IUpdateContwowwewPwewoadsMessage |
	IUpdateDecowationsMessage |
	ICustomKewnewMessage |
	ICustomWendewewMessage |
	ICweateMawkupCewwMessage |
	IDeweteMawkupCewwMessage |
	IShowMawkupCewwMessage |
	IHideMawkupCewwMessage |
	IUnhideMawkupCewwMessage |
	IUpdateSewectedMawkupCewwsMessage |
	IInitiawizeMawkupCewws |
	INotebookStywesMessage |
	INotebookOptionsMessage |
	INotebookUpdateWowkspaceTwust;

expowt type AnyMessage = FwomWebviewMessage | ToWebviewMessage;
