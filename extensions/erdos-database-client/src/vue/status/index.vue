<template>
  <div class='status-container'>
    <el-tabs v-model="activePanel" @tab-click="changePannel">
      <el-tab-pane label="dashBoard" name="dashBoard" v-if="info.dbType=='MySQL'">
        <el-row style="height:45vh">
          <el-col :span="24">
            Queries:
            <div id="queries"></div>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            Traffic:
            <div id="traffic"></div>
          </el-col>
          <el-col :span="12">
            Server Sessions:
            <div id="sessions"></div>
          </el-col>
        </el-row>
      </el-tab-pane>
      <el-tab-pane label="processList" name="processList">
        <ux-grid :data="process.rows" size='small' :cell-style="{height: '35px'}" style="width: 100%" :height="remainHeight()">
          <ux-table-column :field="field.name" :title="field.name" v-for="(field,index) in process.fields" :key="index" align="center" show-overflow-tooltip="true" />
        </ux-grid>
      </el-tab-pane>
      <el-tab-pane label="variableList" name="variableList" v-if="info.dbType!='SqlServer'">
        <ux-grid :data="variableList.rows" size='small' :cell-style="{height: '35px'}" style="width: 100%" :height="remainHeight()">
          <ux-table-column :field="field.name" :title="field.name" v-for="(field,index) in variableList.fields" :key="index" align="center" show-overflow-tooltip="true" />
        </ux-grid>
      </el-tab-pane>
      <el-tab-pane label="statusList" name="statusList" v-if="info.dbType!='SqlServer'">
        <ux-grid :data="statusList.rows" size='small' :cell-style="{height: '35px'}" style="width: 100%" :height="remainHeight()">
          <ux-table-column :field="field.name" :title="field.name" v-for="(field,index) in statusList.fields" :key="index" align="center" show-overflow-tooltip="true" />
        </ux-grid>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
import { Chart } from "g2";
import { inject } from "../mixin/vscodeInject";

export default {
  name: "status",
  mixins: [inject],
  data() {
    return {
      info: {},
      activePanel: "processList",
      process: { fields: [], rows: [] },
      variableList: { fields: [], rows: [] },
      statusList: { fields: [], rows: [] },
      dashBoard: {
        sessions: { data: [], lock: false, chart: null, previous: null },
        queries: { data: [], lock: false, chart: null, previous: null },
        traffic: { data: [], lock: false, chart: null, previous: null },
      },
    };
  },
  mounted() {
    function createChart(id, data) {
      const chart = new Chart({
        container: id,
        autoFit: true,
        height: 300,
      });
      chart.data(data);
      chart.line().position("now*value").color("type").size(2);
      chart.render();
      return chart;
    }

    function loadChart(id, chartOption, data, before) {
      const copy = JSON.parse(JSON.stringify(data));
      if (!chartOption.previous) {
        chartOption.previous = copy;
      }
      chartOption.data.push(...data);
      if (before) {
        before(data, chartOption.previous);
      }
      chartOption.previous = copy;
      if (!chartOption.chart) {
        chartOption.chart = createChart(id, chartOption.data);
      } else {
        if (chartOption.data.length >= data.length * 100) {
          for (let index = 0; index < data.length; index++) {
            chartOption.data.shift();
          }
        }
        chartOption.chart.changeData(chartOption.data);
      }
      chartOption.lock = false;
    }

    this.on("info", (info) => {
      this.info = info;
      this.activePanel =
        this.info.dbType == "MySQL" ? "dashBoard" : "processList";
    })
      .on("processList", (data) => {
        this.process = data;
      })
      .on("variableList", (data) => {
        this.variableList = data;
      })
      .on("statusList", (data) => {
        this.statusList = data;
      })
      .on("dashBoard", (data) => {
        loadChart("sessions", this.dashBoard.sessions, data.sessions);
        loadChart(
          "queries",
          this.dashBoard.queries,
          data.queries,
          (data, previous) => {
            for (let index = 0; index < previous.length; index++) {
              data[index].value = data[index].value - previous[index].value;
            }
          }
        );
        loadChart(
          "traffic",
          this.dashBoard.traffic,
          data.traffic,
          (data, previous) => {
            for (let index = 0; index < previous.length; index++) {
              data[index].value =
                (data[index].value - previous[index].value) / 1000 + "kb";
            }
          }
        );
      })
      .init();
    this.emit("processList").emit("variableList").emit("statusList");
    this.sendLoadDashBoard();
    setInterval(() => {
      this.sendLoadDashBoard();
    }, 1000);
  },
  methods: {
    remainHeight() {
      return window.outerHeight - 150;
    },
    sendLoadDashBoard() {
      if (this.dashBoard.sessions.lock) return;
      this.dashBoard.sessions.lock = true;
      this.emit("dashBoard");
    },
    changePannel() {
      switch (this.activePanel) {
        case "processList":
          this.emit("processList");
          break;
        case "variableList":
          this.emit("variableList");
          break;
        case "statusList":
          this.emit("statusList");
          break;
        case "dashBoard":
          this.sendLoadDashBoard();
          break;
      }
    },
  },
};
</script>

<style >
.status-container {
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", Arial, sans-serif;
}
.el-tabs__header {
  margin: 0 !important;
}
</style>