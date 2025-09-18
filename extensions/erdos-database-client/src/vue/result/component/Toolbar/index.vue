<template>
  <div class="toolbar">
    <el-button v-if="showFullBtn" @click="()=>$emit('sendToVscode','full')" type="primary" title="Full Result View" size="mini" circle>
      <i class="codicon codicon-list-flat"></i>
    </el-button>
    <el-input v-model="searchInput" size="mini" placeholder="Input To Search Data" style="width:200px" :clearable="true" />
    <el-button @click="$emit('insert')" title="Insert new row">
      <i class="codicon codicon-add"></i>
    </el-button>
    <el-button @click="$emit('deleteConfirm');" title="delete">
      <i class="codicon codicon-trash"></i>
    </el-button>
    <el-button @click="$emit('export');" title="Export">
      <i class="codicon codicon-export"></i>
    </el-button>
    <el-button title="Execute Sql" style="margin-left:0;" @click="$emit('run');">
      <i class="codicon codicon-play"></i>
    </el-button>
    <div style="display:inline-block;font-size:14px;padding-left: 8px;" class="el-pagination__total">
      Cost: {{costTime}}ms
    </div>
    <div style="display:inline-block">
      <el-pagination @size-change="changePageSize" @current-change="page=>$emit('changePage',page,true)" @next-click="()=>$emit('changePage',1)" @prev-click="()=>$emit('changePage',-1)" :current-page.sync="page.pageNum" :small="true" :page-size="page.pageSize"  :layout="page.total!=null?'prev,pager, next, total':'prev, next'" :total="page.total">
      </el-pagination>
    </div>
  </div>
</template>

<script>
export default {
  props: ["costTime", "search", "showFullBtn", "page"],
  data() {
    return {
      searchInput: null,
    };
  },
  methods: {
    changePageSize(size) {
      this.page.pageSize = size;
      vscodeEvent.emit("changePageSize", size);
      this.changePage(0);
    },
  },
  watch: {
    searchInput: function () {
      this.$emit("update:search", this.searchInput); // Pass the input value from child component to parent component, parent needs to use .sync
    },
  },
};
</script>

<style scoped>
.toolbar {
  margin-top: 3px;
  margin-bottom: 3px;
}

.el-button--mini.is-circle {
  padding: 6px;
}

.el-button--default {
  padding: 0;
  border: none;
  font-size: 19px;
  margin-left: 7px;
}

.el-button:focus{
  color: inherit !important;
  background-color: var(--vscode-editor-background);
}

.el-button:hover {
  color: #409eff !important;
  border-color: #c6e2ff;
  background-color: var(--vscode-editor-background);
}

.el-pagination {
  padding: 0;
}
>>> .el-input{
  bottom: 2px;
}
>>> .el-input--mini .el-input__inner{
  height: 24px;
}

</style>

<style>
.el-pagination span,.el-pagination li,
.btn-prev i,.btn-next i{
  line-height: 27px !important;
}
</style>