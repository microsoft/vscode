/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

var c=class{constructor(e,t={}){this.container=e,this.options={sortable:!0,filterable:!0,editable:!1,contextMenu:!0,pageSize:100,...t},this.data=[],this.columns=[],this.sortColumn=null,this.sortDirection="asc",this.filters={},this.selectedRows=new Set,this.init()}init(){this.container.className="data-grid",this.createHeader(),this.createBody(),this.createFooter(),this.options.contextMenu&&this.initContextMenu()}setData(e,t){this.data=e,this.columns=t,this.render()}render(){this.renderHeader(),this.renderBody(),this.renderFooter()}renderHeader(){this.header.innerHTML="";let e=document.createElement("div");e.className="grid-header-cell checkbox-cell",e.innerHTML='<input type="checkbox" class="select-all">',this.header.appendChild(e),this.columns.forEach(t=>{let i=document.createElement("div");i.className="grid-header-cell",i.innerHTML=`
                <span class="column-title">${t.title}</span>
                ${this.options.sortable?'<span class="sort-indicator"></span>':""}
                ${this.options.filterable?'<input type="text" class="column-filter" placeholder="Filter...">':""}
            `,this.options.sortable&&i.addEventListener("click",()=>this.sort(t.field)),this.header.appendChild(i)})}renderBody(){this.body.innerHTML="";let e=this.getFilteredData();this.getSortedData(e).forEach((i,s)=>{let o=document.createElement("div");o.className="grid-row",o.dataset.index=s;let n=document.createElement("div");n.className="grid-cell checkbox-cell",n.innerHTML='<input type="checkbox" class="row-select">',o.appendChild(n),this.columns.forEach(a=>{let r=document.createElement("div");r.className="grid-cell",r.dataset.field=a.field;let d=i[a.field];this.options.editable&&a.editable!==!1&&(r.contentEditable=!0,r.addEventListener("blur",()=>this.onCellEdit(i,a.field,r.textContent))),r.textContent=this.formatCellValue(d,a),o.appendChild(r)}),this.body.appendChild(o)})}renderFooter(){let e=this.data.length,t=this.getFilteredData().length,i=this.selectedRows.size;this.footer.innerHTML=`
            <div class="grid-stats">
                <span>Total: ${e}</span>
                <span>Filtered: ${t}</span>
                <span>Selected: ${i}</span>
            </div>
        `}sort(e){this.sortColumn===e?this.sortDirection=this.sortDirection==="asc"?"desc":"asc":(this.sortColumn=e,this.sortDirection="asc"),this.render()}getSortedData(e){return this.sortColumn?[...e].sort((t,i)=>{let s=t[this.sortColumn],o=i[this.sortColumn],n=0;return s>o&&(n=1),s<o&&(n=-1),this.sortDirection==="asc"?n:-n}):e}getFilteredData(){return this.data.filter(e=>Object.keys(this.filters).every(t=>{let i=this.filters[t];return String(e[t]).toLowerCase().includes(i.toLowerCase())}))}formatCellValue(e,t){return e==null?"(NULL)":t.render?t.render(e):t.type==="datetime"&&e instanceof Date?e.toISOString():String(e)}onCellEdit(e,t,i){e[t]=i,this.emit("cellEdit",{row:e,field:t,newValue:i})}initContextMenu(){this.body.addEventListener("contextmenu",e=>{e.preventDefault();let t=e.target.closest(".grid-row");t&&this.showContextMenu(e.clientX,e.clientY,t)})}showContextMenu(e,t,i){let s=document.createElement("div");s.className="context-menu",s.style.left=e+"px",s.style.top=t+"px",s.innerHTML=`
            <div class="menu-item" data-action="copy">
                <i class="codicon codicon-copy"></i> Copy
            </div>
            <div class="menu-item" data-action="edit">
                <i class="codicon codicon-edit"></i> Edit
            </div>
            <div class="menu-item" data-action="delete">
                <i class="codicon codicon-trash"></i> Delete
            </div>
        `,document.body.appendChild(s),s.addEventListener("click",o=>{let n=o.target.closest(".menu-item")?.dataset.action;n&&this.emit("contextAction",{action:n,row:i.dataset.index}),s.remove()}),setTimeout(()=>{document.addEventListener("click",()=>{s.remove()},{once:!0})},0)}createHeader(){this.header=document.createElement("div"),this.header.className="grid-header",this.container.appendChild(this.header)}createBody(){this.body=document.createElement("div"),this.body.className="grid-body",this.container.appendChild(this.body)}createFooter(){this.footer=document.createElement("div"),this.footer.className="grid-footer",this.container.appendChild(this.footer)}emit(e,t){this.options[`on${e.charAt(0).toUpperCase()+e.slice(1)}`]&&this.options[`on${e.charAt(0).toUpperCase()+e.slice(1)}`](t)}};window.DataGrid=c;
