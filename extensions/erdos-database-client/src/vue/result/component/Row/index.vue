<template>
  <div>
    <template v-if="scope.row.isFilter">
      <el-input class='edit-filter' v-model="filterObj[scope.column.title]" :clearable='true' placeholder="Filter" @clear="filter(null,scope.column.title)" @keyup.enter.native="filter($event,scope.column.title)">
      </el-input>
    </template>
    <template v-else-if="!scope.row.isFilter && result.dbType=='ElasticSearch'">
      <div class="edit-column" :contenteditable="editable" style="height: 100%; line-height: 33px;" @input="editListen($event,scope)" @contextmenu.prevent="onContextmenu($event,scope)" v-html='dataformat(scope.row[scope.column.title])'></div>
    </template>
    <template v-else>
      <div class="edit-column" :contenteditable="editable" style="height: 100%; line-height: 33px;" @input="editListen($event,scope)" @contextmenu.prevent="onContextmenu($event,scope)">
        <template v-if="scope.row[scope.column.title]==null || scope.row[scope.column.title]==undefined">
          <span class='null-column'>(NULL)</span>
        </template>
        <template v-else>
          <span v-text='dataformat(scope.row[scope.column.title])'></span>
        </template>
      </div>
    </template>
  </div>
</template>

<script>
import { wrapByDb } from "../../../../common/wrapper.js";

export default {
  props: ["result", "scope", "editList","filterObj"],
  methods: {
    dataformat(origin) {
      if (origin == undefined || origin == null) {
        return "<span class='null-column'>(NULL)</span>";
      }
      if (origin.hasOwnProperty("type")) {
        return String.fromCharCode.apply(null, new Uint16Array(origin.data));
      }
      return origin;
    },
    editListen(event, scope) {
      const { row, column, rowIndex } = scope;
      const editList = this.editList.concat([]);
      if (!editList[rowIndex]) {
        editList[rowIndex] = { ...row };
        delete editList[rowIndex]._XID;
        console.log(editList[rowIndex]);
      }
      editList[rowIndex][column.title] = event.target.textContent;
      this.$emit("sendToVscode", "dataModify");
      this.$emit("update:editList", editList);
    },
    filter(event, column, operation) {
      if (!operation) operation = "=";
      let inputvalue = "" + (event ? event.target.value : "");
      if (this.result.dbType == "ElasticSearch") {
        this.$emit("sendToVscode", "esFilter", {
          match: { [column]: inputvalue },
        });
        return;
      }

      let filterSql =
        this.result.sql.replace(/\n/, " ").replace(";", " ") + " ";

      let existsCheck = new RegExp(
        `(WHERE|AND)?\\s*\`?${column}\`?\\s*(=|is|>=|<=|<>)\\s*.+?\\s`,
        "igm"
      );

      if (inputvalue) {
        const condition =
          inputvalue.toLowerCase() === "null"
            ? `${column} is null`
            : `${wrapByDb(
                column,
                this.result.dbType
              )} ${operation} '${inputvalue}'`;
        if (existsCheck.exec(filterSql)) {
          // condition present
          filterSql = filterSql.replace(existsCheck, `$1 ${condition} `);
        } else if (filterSql.match(/\bwhere\b/gi)) {
          //have where
          filterSql = filterSql.replace(
            /\b(where)\b/gi,
            `\$1 ${condition} AND `
          );
        } else {
          //have not where
          filterSql = filterSql.replace(
            new RegExp(`(from\\s*.+?)\\s`, "ig"),
            `\$1 WHERE ${condition} `
          );
        }
      } else {
        // empty value, clear filter
        let beforeAndCheck = new RegExp(
          `\\b${column}\\b\\s*(=|is)\\s*.+?\\s*AND`,
          "igm"
        );
        if (beforeAndCheck.exec(filterSql)) {
          filterSql = filterSql.replace(beforeAndCheck, "");
        } else {
          filterSql = filterSql.replace(existsCheck, " ");
        }
      }
      this.$emit("execute", filterSql + ";");
    },
    onContextmenu(event, scope) {
      const { row, column } = scope;
      const name = column.title;
      const value = event.target.textContent;
      event.target.value = value;
      this.$contextmenu({
        items: [
          {
            label: `Copy`,
            onClick: () => {
              this.$emit("sendToVscode", "copy", value);
            },
            divided: true,
          },
          {
            label: `Open Edit Dialog`,
            onClick: () => {
              this.$emit("openEditor", row, false);
            },
          },
          {
            label: `Open Copy Dialog`,
            onClick: () => {
              this.$emit("openEditor", row, true);
            },
            divided: true,
          },
          {
            label: `Filter by ${name} = '${value}'`,
            onClick: () => {
              this.filter(event, name, "=");
            },
          },
          {
            label: "Filter by",
            divided: true,
            children: [
              {
                label: `Filter by ${name} > '${value}'`,
                onClick: () => {
                  this.filter(event, name, ">");
                },
              },
              {
                label: `Filter by ${name} >= '${value}'`,
                onClick: () => {
                  this.filter(event, name, ">=");
                },
                divided: true,
              },
              {
                label: `Filter by ${name} < '${value}'`,
                onClick: () => {
                  this.filter(event, name, "<");
                },
              },
              {
                label: `Filter by ${name} <= '${value}'`,
                onClick: () => {
                  this.filter(event, name, "<=");
                },
                divided: true,
              },
              {
                label: `Filter by ${name} LIKE '%${value}%'`,
                onClick: () => {
                  event.target.value = `%${value}%`;
                  this.filter(event, name, "LIKE");
                },
              },
              {
                label: `Filter by ${name} NOT LIKE '%${value}%'`,
                onClick: () => {
                  event.target.value = `%${value}%`;
                  this.filter(event, name, "NOT LIKE");
                },
              },
            ],
          },
        ],
        event,
        customClass: "class-a",
        zIndex: 3,
        minWidth: 230,
      });
      return false;
    },
  },
  computed: {
    editable() {
      return this.result.primaryKey && this.result.tableCount == 1;
    },
  },
};
</script>

<style>
</style>