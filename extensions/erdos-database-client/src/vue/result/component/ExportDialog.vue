<template>
  <el-dialog :title="'Export Option'" :visible="visible" width="30%" top="3vh" size="mini" @close="$emit('update:visible',false)">
    <el-form :model="exportOption">
      <el-form-item label="Export File Type">
        <el-select v-model="exportOption.type">
          <el-option :label="'Xlsx'" value="xlsx"></el-option>
          <el-option :label="'Sql'" value="sql"></el-option>
          <el-option :label="'Json'" value="json"></el-option>
          <el-option :label="'Csv'" value="csv"> </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="Remove Limit">
        <el-switch v-model="exportOption.withOutLimit"></el-switch>
      </el-form-item>
    </el-form>
    <span slot="footer" class="dialog-footer">
      <el-button type="primary" :loading="loading" @click="loading=true;$emit('exportHandle',exportOption);">Export</el-button>
      <el-button @click="$emit('update:visible',false)">Cancel</el-button>
    </span>
  </el-dialog>
</template>

<script>
export default {
  props: ["visible"],
  data() {
    return {
      loading: false,
      exportOption: {
        withOutLimit: true,
        type: "xlsx",
      },
    }
  },
  watch:{
    visible(){
      this.loading=false;
    }
  }
}
</script>

<style>
</style>