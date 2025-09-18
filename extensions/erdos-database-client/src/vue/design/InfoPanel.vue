<template>
  <div class="ml-4">
    <div class="mb-3">
      <div class="inline-block mr-10">
        <label class="inline-block mr-5 font-bold w-14">
          Table
          <span class="mr-1 text-red-600">*</span>
        </label>
        <input class="w-64 field__input" required v-model="table.name" />
      </div>
      <div class="inline-block mr-10">
        <label class="inline-block w-32 mr-5 font-bold">
          Comment
          <span class="mr-1 text-red-600">*</span>
        </label>
        <input class="w-64 field__input" v-model="table.comment" />
      </div>
      <el-button @click="rename" type="success">Update</el-button>
    </div>
  </div>
</template>

<script>
import { wrapByDb } from "../../common/wrapper";
import { inject } from "../mixin/vscodeInject";
export default {
  mixins: [inject],
  data() {
    return {
      designData: { table: null, dbType: null },
      table: {
        name: null,
        comment: null,
        visible: false,
        loading: false,
        type: null,
      },
    };
  },
  mounted() {
    this.on("design-data", (data) => {
      this.designData = data;
      this.table.name = data.table;
      this.table.comment = data.comment;
      this.designData.editIndex = [...this.designData.indexs];
    })
      .on("success", () => {
        this.$message.success("Update success!");
        this.init();
      })
      .on("error", (msg) => {
        this.$message.error(msg);
      })
      .init();
  },
  methods: {
    rename() {
      this.emit("updateTable", {
        newTableName: this.table.name,
        newComment: this.table.comment,
      });
    },
    createIndex() {
      this.index.loading = true;
      this.execute(
        `ALTER TABLE ${wrapByDb(this.designData.table, this.designData.dbType)} ADD ${this.index.type} (${wrapByDb(
          this.index.column,
          this.designData.dbType
        )})`
      );
    },
    execute(sql) {
      if (!sql) return;
      this.emit("execute", sql);
    },
  },
};
</script>

<style>
.field__input {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-dropdown-border);
  color: var(--vscode-input-foreground);
  padding: 4px;
  margin: 2px 0;
}

.field__input:focus {
  border-color: inherit;
  outline: 0;
}
</style>
