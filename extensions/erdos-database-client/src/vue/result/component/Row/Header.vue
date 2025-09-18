<template>
  <el-tooltip class="item" effect="dark" :content="getTip(result.columnList[index],scope.column)" placement="left-start">
    <div>
      <span>
        <span v-if="result.columnList[index]&& (result.columnList[index].nullable != 'YES')" style="color: #f94e4e; position: relative; top: .2em;">
          *
        </span>
        <span class="column-name">
          {{ scope.column.title }}<br />
        </span>
      </span>
      <span class="column-type" v-if="result.columnList[index]">
        {{result.columnList[index].type}}
      </span>
    </div>
  </el-tooltip>
</template>

<script>
export default {
  props: ["scope", "result","index"],
  methods: {
    getTip(column, scopeColumn) {
      if (!column || !column.comment) return scopeColumn.title;
      return column.comment;
    },
  },
};
</script>

<style>
</style>