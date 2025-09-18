<template>
  <div>
    <InfoPanel/>
    <div class="design-toolbar">
      <el-button @click="column.visible=true" type="primary" title="Insert" size="mini" circle>
        <i class="codicon codicon-add"></i>
      </el-button>
    </div>
    <ux-grid :data="designData.editColumnList" stripe style="width: 100%" :cell-style="{height: '25px'}" :height="remainHeight()">
      <ux-table-column align="center" field="name" title="Name" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="type" title="Type" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="comment" title="Comment" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="maxLength" width="80" title="Length" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" field="defaultValue" width="120" title="Default" show-overflow-tooltip="true"></ux-table-column>
      <ux-table-column align="center" title="Primary Key" width="100" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isPrimary"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column align="center" title="Unique" width="80" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isUnique"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column align="center" title="Not Null" width="80" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.nullable=='NO'"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column align="center" title="Auto Incrment" width="140" show-overflow-tooltip="true">
        <template v-slot="{ row }">
          <el-checkbox disabled :checked="row.isAutoIncrement"></el-checkbox>
        </template>
      </ux-table-column>
      <ux-table-column title="Operation" width="120">
        <template v-slot="{ row }">
          <el-button @click="openEdit(row)" title="edit" size="mini" circle>
            <i class="codicon codicon-edit"></i>
          </el-button>
          <el-button @click="deleteConfirm(row)" title="delete" type="danger" size="mini" circle>
            <i class="codicon codicon-trash"></i>
          </el-button>
        </template>
      </ux-table-column>
    </ux-grid>
    <el-dialog :title="'Update Column'" :visible.sync="column.editVisible" top="3vh" size="mini">
      <el-form :inline='true'>
        <el-form-item label="Name">
          <el-input v-model="editColumn.name"></el-input>
        </el-form-item>
        <el-form-item label="Type">
          <el-input v-model="editColumn.type"></el-input>
        </el-form-item>
        <el-form-item label="Comment">
          <el-input v-model="editColumn.comment"></el-input>
        </el-form-item>
        <el-form-item label="Not Null">
          <el-checkbox v-model="editColumn.isNotNull"></el-checkbox>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button type="primary" :loading="column.editloading" @click="updateColumn">Update</el-button>
        <el-button @click="column.editVisible=false">Cancel</el-button>
      </span>
    </el-dialog>
    <el-dialog :title="'Add Column'" :visible.sync="column.visible" top="3vh" size="mini">
      <el-form :inline='true'>
        <el-form-item label="Name">
          <el-input v-model="column.name"></el-input>
        </el-form-item>
        <el-form-item label="Type">
          <el-input v-model="column.type"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button type="primary" :loading="column.loading" @click="createcolumn">Create</el-button>
        <el-button @click="column.visible=false">Cancel</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { inject } from "../mixin/vscodeInject";
import { wrapByDb } from "../../common/wrapper";
import InfoPanel from "./InfoPanel";
export default {
  mixins: [inject],
  components:{InfoPanel},
  data() {
    return {
      designData: {
        table: null,
        dbType: null,
        columnList: [],
        editColumnList: [],
      },
      editColumn: {},
      column: {
        visible: false,
        editVisible: false,
        loading: false,
        editLoading: false,

        column: null,
        type: null,
        nullable: false,
      },
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.designData = data;
      this.designData.editColumnList = [...this.designData.columnList];
    })
      .on("success", () => {
        this.column.loading = false;
        this.column.editLoading = false;
        this.column.visible = false;
        this.column.editVisible = false;
        this.init();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      })
      .init();
  },
  methods: {
    remainHeight() {
      return window.outerHeight - 280;
    },
    updateColumn() {
      this.emit("updateColumn", {
        newColumnName: this.editColumn.name,
        columnType: this.editColumn.type,
        comment: this.editColumn.comment,
        nullable: !this.editColumn.isNotNull,
        table: this.designData.table,
        columnName: this.column.name,
      });
    },
    createcolumn() {
      this.column.loading = true;
      this.execute(
        `ALTER TABLE ${wrapByDb(
          this.designData.table,
          this.designData.dbType
        )} ADD ${wrapByDb(this.column.name, this.designData.dbType)} ${
          this.column.type
        }`
      );
    },
    openEdit(row) {
      this.column.name = row.name;
      this.editColumn = {...row};
      this.column.editVisible = true;
      this.column.editLoading = false;
    },
    deleteConfirm(row) {
      this.$confirm("Are you sure you want to delete this column?", "Warning", {
        confirmButtonText: "OK",
        cancelButtonText: "Cancel",
        type: "warning",
      }).then(() => {
        this.execute(
          `ALTER TABLE ${wrapByDb(
            this.designData.table,
            this.designData.dbType
          )} DROP COLUMN ${row.name}`
        );
      });
    },
    execute(sql) {
      if (!sql) return;
      this.emit("execute", sql);
    },
  },
};
</script>

<style>
</style>