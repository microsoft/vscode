<template>
  <div id="app">
    <el-container direction="vertical" class="key-tab-container">
      <!-- key info -->
      <el-form :inline="true">
        <!-- key name -->
        <el-form-item>
          <el-input ref="keyNameInput" v-model="edit.name" @keyup.enter.native="rename" placeholder="set to rename key">
            <span slot="prepend" class="key-detail-type">{{ key.type }}</span>
            <i class="codicon codicon-check el-input__icon cursor-pointer" slot="suffix" :title="'Click to rename'" @click="rename">
            </i>
          </el-input>
        </el-form-item>

        <!-- key ttl -->
        <el-form-item>
          <el-input v-model="edit.ttl" @keyup.enter.native="ttlKey" type='number'>
            <span slot="prepend">TTL</span>
            <i class="codicon codicon-check el-input__icon cursor-pointer" slot="suffix" :title="'Click to change ttl'" @click="ttlKey">
            </i>
          </el-input>
        </el-form-item>

        <!-- del refresh key btn -->
        <el-form-item>
          <el-button type="danger" @click="deleteKey">
            <i class="codicon codicon-trash"></i>
          </el-button>
          <el-button type="success" @click="refresh">
            <i class="codicon codicon-refresh"></i>
          </el-button>
          <template v-if="key.type=='string'">
            <el-select v-model="selectedView" class='format-selector' :style='selectStyle' size='mini'>
              <span slot="prefix" class="fa fa-sitemap"></span>
              <el-option v-for="item in viewers" :key="item.value" :label="item.text" :value="item.value">
              </el-option>
            </el-select>
            <!-- save btn -->
            <el-form-item>
              <el-button type="primary" @click="update()">Save</el-button>
            </el-form-item>
          </template>
        </el-form-item>
      </el-form>

      <!-- key content -->
      <el-form class='key-content-string' v-if="key.type=='string'">
        <!-- key content textarea -->
        <el-form-item>

          <span v-if='binary' class='formater-binary'>Hex</span>
          <div class="value-panel" :style="'height:'+ dynamicHeight">
            <!-- String -->
            <div v-if="selectedView=='ViewerText'">
              <el-input type='textarea' :autosize="{ minRows:6}" v-model='edit.content'></el-input>
            </div>
            <!-- Json -->
            <div v-if="selectedView=='ViewerJson'">
              <pre v-html="editTemp" contenteditable="true" class="json-panel" @input="changeByJson"></pre>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <!-- array content -->
      <div v-if="key.type=='list' || key.type=='set' || key.type=='zset' || key.type=='hash' ">
        <div>
          <!-- add button -->
          <el-form :inline="true" size="small">
            <el-form-item>
              <el-button size="small" type="primary" @click='editDialogVisiable=true'>
                Add New
              </el-button>
            </el-form-item>
          </el-form>
          <!-- edit & add dialog -->
          <el-dialog :title="dialogTitle" :visible.sync="editDialogVisiable">
            <el-form>
              <el-form-item label="key" v-if="key.type=='hash'">
                <el-input v-model="addKey"></el-input>
              </el-form-item>
              <el-form-item label="Value">
                <el-input v-model="addData"></el-input>
              </el-form-item>
            </el-form>
            <div slot="footer" class="dialog-footer">
              <el-button @click="editDialogVisiable = false">Cancel</el-button>
              <el-button type="primary" @click="confirmAdd">Confirm</el-button>
            </div>
          </el-dialog>
        </div>
        <!-- content table -->
        <div>
          <el-table :data="key.content" stripe size="small" border>
            <el-table-column type="index" label="ID" sortable width="60" align="center">
            </el-table-column>
            <el-table-column v-if="key.type=='hash'" resizable sortable label="Key" align="center">
              <template slot-scope="scope">
                {{scope.row.key}}
              </template>
            </el-table-column>
            <el-table-column resizable sortable show-overflow-tooltip label="Value" align="center">
              <template slot-scope="scope">
                {{key.type=='hash'?scope.row.value:scope.row}}
              </template>
            </el-table-column>
            <el-table-column label="Operation" width="150" align="center">
              <template slot-scope="scope">
                <el-button type="text" @click="showEditDialog(scope.row)" circle  v-if="key.type=='hash'">
                  <i class="codicon codicon-edit"></i>
                </el-button>
                <el-button type="text" @click="deleteLine(scope.row)" circle>
                  <i class="codicon codicon-trash"></i>
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <!-- <el-pagination class="pagenation-table-page-container" v-if="dataAfterFilter.length > pageSize"
                        :total="dataAfterFilter.length" :page-size="pageSize" :current-page.sync="pageIndex"
                        layout="total, prev, pager, next" background>
                    </el-pagination> -->
        </div>
      </div>
      <!-- hset -->
    </el-container>
  </div>
</template>

<script>
import formatHighlight from "json-format-highlight";

import { getVscodeEvent } from "../util/vscode";
const prettyBytes = require("pretty-bytes");
let vscodeEvent;

export default {
  destroyed() {
    vscodeEvent.destroy();
  },
  mounted() {
    vscodeEvent = getVscodeEvent();
    vscodeEvent
      .on("detail", (data) => {
        this.key = data.res;
        this.edit = this.deepClone(data.res);
        this.editTemp = this.jsonContent();
        const temp = this.edit.content + "".trim();
        this.selectedView =
          temp.startsWith("[") || temp.startsWith("{")
            ? "ViewerJson"
            : "ViewerText";
      })
      .on("msg", (content) => {
        this.$message.success(content);
      })
      .on("refresh", () => {
        this.editDialogVisiable = false;
        this.editModel=false;
        this.addData = null;
        this.addKey = null;
        this.refresh();
      });
    vscodeEvent.emit("route-" + this.$route.name);
  },
  data() {
    return {
      addKey: "",
      addData: "",
      editModel: false,
      key: { name: "", ttl: -1, content: null },
      // copy from key
      edit: { name: "", ttl: -1, content: null },
      editTemp: null,
      editDialogVisiable: false,
      binary: false,
      selectStyle: { float: this.float },
      selectedView: "ViewerText",
      viewers: [
        { value: "ViewerText", text: "Text" },
        { value: "ViewerJson", text: "Json" },
      ],
      textrows: 6,
    };
  },
  computed: {
    dialogTitle() {
      const edit = this.editModel;
      switch (this.key.type) {
        case "hash":
          return edit ? "Edit Hash" : "Add to hash";
        case "set":
          return edit ? "Edit Set" : "Add to set";
        case "zset":
          return edit ? "Edit ZSet" : "Add to zset";
        case "list":
          return edit ? "Edit List" : "Add to list";
      }
      return "";
    },
    dynamicHeight() {
      return window.innerHeight - 100 + "px";
    },
  },
  methods: {
    changeByJson(event) {
      this.edit.content = event.target.innerText;
    },
    jsonContent() {
      try {
        return formatHighlight(JSON.parse(this.edit.content), {
          keyColor: "#C792EA",
          numberColor: "#CE9178",
          stringColor: "#92D69E",
          trueColor: "#569cD6",
          falseColor: "#569cD6",
          nullColor: "#569cD6",
        });
      } catch (error) {
        console.log(error);
        return this.edit.content;
      }
    },
    refresh() {
      vscodeEvent.emit("refresh", { key: this.key });
    },
    confirmAdd() {
      vscodeEvent.emit("add", {
        key: this.addKey,
        value: this.addData,
        editModel: this.editModel,
      });
    },
    showEditDialog(row) {
      this.addKey=row.key
      this.addData=row.value
      this.editModel=true;
      this.editDialogVisiable=true
    },
    deleteLine(row) {
      vscodeEvent.emit("deleteLine", row);
    },
    deleteKey() {
      this.$confirm("Are you sure you want to delete this key?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      }).then(() => {
        vscodeEvent.emit("del", { key: { name: this.key.name } });
        this.key = {};
        this.edit = {};
      });
    },
    rename() {
      console.log(this.key.name);
      vscodeEvent.emit("rename", {
        key: { name: this.key.name, newName: this.edit.name },
      });
    },
    ttlKey() {
      vscodeEvent.emit("ttl", {
        key: { name: this.key.name, ttl: this.edit.ttl },
      });
    },
    update() {
      vscodeEvent.emit("update", {
        key: {
          name: this.key.name,
          type: this.key.type,
          content: this.edit.content,
        },
      });
    },
    deepClone(obj) {
      let objClone = Array.isArray(obj) ? [] : {};
      if (obj && typeof obj === "object") {
        for (let key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (obj[key] && typeof obj[key] === "object") {
              objClone[key] = this.deepClone(obj[key]);
            } else {
              objClone[key] = obj[key];
            }
          }
        }
      }
      return objClone;
    },
  },
};
</script>
<style scoped>
.json-panel {
  line-height: 1.3;
  background: #292a2b;
  font-family: var(--vscode-editor-font-family);
}

body {
  background-color: #ffffff;
  font-family: var(--vscode-font-family);
}

.value-panel {
  overflow: scroll;
}

.key-tab-container {
  margin-top: 10px;
  padding-left: 5px;
}

.el-form-item{
margin: 3px;
}

.key-header-info {
  margin-top: 15px;
}

.key-content-container {
  margin-top: 15px;
}

.key-detail-filter-value {
  width: 60%;
  height: 24px;
  padding: 0 5px;
}

/*tooltip in table width limit*/
.el-tooltip__popper {
  max-width: 50%;
}

.content-binary {
  color: #7ab3ef;
  font-size: 80%;
  float: left;
}

/* header */
.key-detail-type {
  text-transform: capitalize;
  text-align: center;
  width: 28px;
  display: inline-block;
}

/* viewer */
.format-selector {
  margin-left: 20px;
  margin-right: 20px;
  width: 122px;
}

.format-selector .el-input__inner {
  height: 22px;
}

.dark-mode .text-formated-container {
  border-color: #7f8ea5;
}

/*key field span*/
.vjs__tree span {
  color: #616069;
}

.dark-mode .vjs__tree span:not([class^="vjs"]) {
  color: #ebebec;
}

/*brackets*/
.dark-mode .vjs__tree .vjs__tree__node {
  color: #9e9ea2;
}

.dark-mode .vjs__tree .vjs__tree__node:hover {
  color: #20a0ff;
}

.collapse-container {
  height: 27px;
}

.collapse-container .collapse-btn {
  float: right;
  padding: 9px 0;
}

.formater-binary {
  padding-left: 5px;
  color: #7ab3ef;
  font-size: 80%;
}
</style>
