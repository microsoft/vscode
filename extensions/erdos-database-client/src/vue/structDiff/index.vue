<template>
  <div>
    <div class="opt-panel">
      <el-form>
        <el-form-item label-width="80px" label="Target">
          <el-select v-model="option.from.connection" @change="clearFrom" :loading="loadingConnection">
            <el-option :label="node.label" :value="node.uid" :key="node.uid" v-for="node in initData.nodes"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label-width="80px" label="database">
          <el-select v-model="option.from.database"  @change="(db)=>changeActive(db,true)" :loading="loadingConnection">
            <el-option :label="db.label" :value="db.label" :key="db.label" v-for="db in initData.databaseList[option.from.connection]"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </div>
    <div class="opt-panel">
      <el-form>
        <el-form-item label-width="90px" label="Sync From">
          <el-select v-model="option.to.connection" @change="clearTo" :loading="loadingConnection">
            <el-option :label="node.label" :value="node.uid" :key="node.uid" v-for="node in initData.nodes" ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label-width="90px" label="database" >
          <el-select v-model="option.to.database" @change="(db)=>changeActive(db,false)" :loading="loadingConnection">
            <el-option :label="db.label" :value="db.label" :key="db.label" v-for="db in initData.databaseList[option.to.connection]" ></el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </div>
      <el-button stlye="margin-left:250px;" class="m-2" @click="startCompare" title="Start Compare" type="danger" size="mini" v-loading="loading.compare">Compare
      </el-button>
    <div >
      <template v-if="compareResult.sqlList">
        <el-card>
          <el-button @click="confrimSync" v-loading="loading.sync" title="Confrim Sync" type="success" size="mini">Sync
          </el-button>
          <ux-grid :data="compareResult.sqlList" :height="remainHeight" ref="dataTable" stripe style="width: 100%" @selection-change="selectionChange">
            <ux-table-column type="checkbox" width="40" fixed="left"> </ux-table-column>
            <ux-table-column align="center" width="60" field="type" title="type" show-overflow-tooltip="true"></ux-table-column>
            <ux-table-column align="center" field="sql" title="sql" show-overflow-tooltip="true"></ux-table-column>
          </ux-grid>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script>
import { inject } from "../mixin/vscodeInject";
export default {
  mixins: [inject],
  data() {
    return {
      loadingConnection:true,
      initData: { nodes: [], databaseList: {} },
      option: { from: { connection: null, database: null,db:null }, to: {db:null} },
      loading: { compare: false, sync: false },
      compareResult: { sqlList: null },
    };
  },
  mounted() {
    this.on("structDiffData", (data) => {
      this.initData = data;
      this.loadingConnection=false;
    })
      .on("compareResult", (compareResult) => {
        this.compareResult = compareResult;
        this.loading.compare = false;
      })
      .on("syncSuccess", () => {
        this.$message.success("syncSuccess");
        this.loading.sync = false;
      })
      .on("success", () => {
        this.refresh();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
        this.loading.sync = false;
      })
      .init();
  },
  methods: {
    clearFrom(){
      this.option.from.db=null;
      this.option.from.database=null;
    },
    clearTo(){
      this.option.to.db=null;
      this.option.to.database=null;
    },
    changeActive(dbName,isFrom){
      const key=isFrom?this.option.from.connection:this.option.to.connection;
      for (const db of this.initData.databaseList[key]) {
        if(db.label==dbName){
          if(isFrom){
            this.option.from.db=db;
          }else{
            this.option.to.db=db;
          }
        }
      }
      this.$forceUpdate()
    },
    startCompare() {
      this.loading.compare = true;
      this.emit("start", this.option);
    },
    confrimSync() {
      const sqlList = this.$refs.dataTable.getCheckboxRecords();
      if (!sqlList || sqlList.length == 0) {
        this.$message.error("Need to select at least one sql!");
        return;
      }
      this.loading.sync = true;
      this.emit("sync", {
        sqlList: sqlList,
        option: this.option,
      });
    },
    selectionChange(selection) {
      // this.toolbar.show = selection.length > 0
    },
    execute(sql) {
      if (!sql) return;
      this.emit("execute", sql);
    },
    refresh() {
      this.emit("route-" + this.$route.name);
    },
  },
  computed: {
    remainHeight() {
      return window.outerHeight - 340;
    },
  },
};
</script>

<style>
.opt-panel {
  width: 400px;
  display: inline-block;
  margin-top: 30px;
}
</style>