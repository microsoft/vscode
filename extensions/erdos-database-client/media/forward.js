/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

(function(){let n=acquireVsCodeApi(),c=[],i={},a=!1,d=null,T=document.getElementById("addForwardBtn"),P=document.getElementById("refreshBtn"),B=document.getElementById("errorPanel"),D=document.getElementById("errorMessage"),r=document.getElementById("forwardsBody"),m=document.getElementById("forwardDialog"),C=document.getElementById("forwardDialogTitle"),u=document.getElementById("forwardName"),v=document.getElementById("localHost"),g=document.getElementById("localPort"),p=document.getElementById("remoteHost"),f=document.getElementById("remotePort"),M=document.getElementById("saveForwardBtn"),S=document.getElementById("cancelForwardBtn"),x=document.getElementById("commandDialog"),b=document.getElementById("sshCommand"),s=document.getElementById("copyCommandBtn"),N=document.getElementById("closeCommandBtn");T.addEventListener("click",V),P.addEventListener("click",w),M.addEventListener("click",R),S.addEventListener("click",I),s.addEventListener("click",j),N.addEventListener("click",y),window.addEventListener("message",e=>{let t=e.data;switch(t.type){case"forwardRules":A(t.rules);break;case"config":i=t.config;break;case"success":K(t.message),J(),w();break;case"error":G(t.message);break;case"tunnelStarted":H(t.id,!0);break;case"tunnelStopped":H(t.id,!1);break;case"sshCommand":z(t.command);break}});function w(){n.postMessage({type:"load"})}function A(e){c=e||[],k()}function k(){if(r.innerHTML="",c.length===0){let e=document.createElement("div");e.className="table-row",e.innerHTML=`
                <div class="table-cell" style="text-align: center; color: var(--vscode-descriptionForeground);" colspan="7">
                    No forwarding rules configured
                </div>
            `,r.appendChild(e);return}c.forEach(e=>{let t=document.createElement("div");t.className="table-row",t.innerHTML=`
                <div class="table-cell">${h(e.name||"")}</div>
                <div class="table-cell">${h(e.localHost||"")}</div>
                <div class="table-cell">${e.localPort||""}</div>
                <div class="table-cell">${h(e.remoteHost||"")}</div>
                <div class="table-cell">${e.remotePort||""}</div>
                <div class="table-cell">${e.state?"running":"stop"}</div>
                <div class="table-cell">
                    <div class="actions">
                        ${e.state?`<button class="btn btn-danger" onclick="stopTunnel('${e.id}')" title="Stop">
                                <i class="codicon codicon-stop-circle"></i>
                            </button>`:`<button class="btn btn-success" onclick="startTunnel('${e.id}')" title="Start">
                                <i class="codicon codicon-play"></i>
                            </button>`}
                        <button class="btn btn-primary" onclick="editForward('${e.id}')" title="Edit">
                            <i class="codicon codicon-edit"></i>
                        </button>
                        <button class="btn btn-secondary" onclick="showInfo('${e.id}')" title="Show command">
                            <i class="codicon codicon-info"></i>
                        </button>
                        <button class="btn btn-danger" onclick="deleteForward('${e.id}')" title="Delete">
                            <i class="codicon codicon-trash"></i>
                        </button>
                    </div>
                </div>
            `,r.appendChild(t)})}function V(){a=!1,d=null,C.textContent="Create Forward",u.value="",v.value="127.0.0.1",g.value="",p.value="127.0.0.1",f.value="",E(m)}function q(e){a=!0,d=e,C.textContent="Edit Forward",u.value=e.name||"",v.value=e.localHost||"",g.value=e.localPort||"",p.value=e.remoteHost||"",f.value=e.remotePort||"",E(m)}function R(){let e=u.value.trim(),t=v.value.trim(),o=parseInt(g.value),l=p.value.trim(),L=parseInt(f.value);if(!e||!t||!o||!l||!L){alert("All fields are required");return}let $={name:e,localHost:t,localPort:o,remoteHost:l,remotePort:L};a&&d&&($.id=d.id),n.postMessage({type:a?"update":"create",forward:$}),I()}function I(){F(m),a=!1,d=null}function z(e){b.textContent=e,E(x)}function j(){navigator.clipboard.writeText(b.textContent).then(()=>{let e=s.textContent;s.textContent="Copied!",s.style.background="var(--vscode-testing-iconPassed)",setTimeout(()=>{s.textContent=e,s.style.background="",y()},1e3)}).catch(()=>{let e=document.createElement("textarea");e.value=b.textContent,document.body.appendChild(e),e.select(),document.execCommand("copy"),document.body.removeChild(e),y()})}function y(){F(x)}function H(e,t){let o=c.find(l=>l.id===e);o&&(o.state=t,k())}function G(e){D.textContent=e,B.classList.remove("hidden")}function J(){B.classList.add("hidden")}function K(e){let t=document.createElement("div");t.className="success-notification",t.style.cssText=`
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--vscode-inputValidation-infoBackground);
            color: var(--vscode-inputValidation-infoForeground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            padding: 12px 16px;
            border-radius: 4px;
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 8px;
        `,t.innerHTML=`<i class="codicon codicon-check"></i> ${e}`,document.body.appendChild(t),setTimeout(()=>{t.remove()},3e3)}function E(e){e.classList.remove("hidden")}function F(e){e.classList.add("hidden")}function h(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}window.startTunnel=function(e){n.postMessage({type:"start",id:e})},window.stopTunnel=function(e){n.postMessage({type:"stop",id:e})},window.editForward=function(e){let t=c.find(o=>o.id===e);t&&q(t)},window.showInfo=function(e){let t=c.find(o=>o.id===e);if(t&&i){let o=`ssh -qTnN -L ${t.localHost}:${t.localPort}:${t.remoteHost}:${t.remotePort} ${i.username}@${i.host}`;n.postMessage({type:"cmd",command:o})}},window.deleteForward=function(e){confirm("Are you sure you want to delete this forward?")&&n.postMessage({type:"remove",id:e})},w()})();
