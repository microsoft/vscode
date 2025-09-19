/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

var i=class{constructor(){this.vscode=this.acquireVsCodeApi(),this.events={},this.init=!1,this.tryInit()}acquireVsCodeApi(){return typeof acquireVsCodeApi<"u"?acquireVsCodeApi():null}tryInit(){this.init||!this.vscode||(this.init=!0,window.addEventListener("message",e=>{let{data:t}=e;t&&this.events[t.type]&&this.events[t.type](t.content)}))}on(e,t){return this.events[e]=t,this}emit(e,t){this.vscode&&this.vscode.postMessage({type:e,content:t})}destroy(){this.events={},this.init=!1}};window.vscodeMessaging=new i;
