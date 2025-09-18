<template>
  <div id="app">
    <!-- auto refresh row -->
    <el-row>
      <el-col>
        <div style="float: right;">
          <el-tag type="info">
            <i class="el-icon-refresh"></i>
            Auto Refresh
          </el-tag>

          <el-tooltip class="item" effect="dark" :content="'Auto Refresh Switch, Refresh Every 2 Seconds'" placement="bottom">
            <el-switch v-model="autoRefresh" @change="refreshInit">
            </el-switch>
          </el-tooltip>
        </div>
      </el-col>
    </el-row>

    <!-- server status row -->
    <el-row :gutter="10" class="status-container status-card">
      <!-- server -->
      <el-col :span="8">
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <i class="fa fa-server"></i>
            <span>Server</span>
          </div>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Redis Version:
              <span class="server-status-text">{{this.connectionStatus.redis_version}}</span>
            </el-tag>
          </p>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              OS:
              <span class="server-status-text" :title="connectionStatus.os">{{this.connectionStatus.os}}</span>
            </el-tag>
          </p>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Process ID:
              <span class="server-status-text">{{this.connectionStatus.process_id}}</span>
            </el-tag>
          </p>
        </el-card>
      </el-col>

      <!-- memory row -->
      <el-col :span="8">
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <i class="fa fa-microchip"></i>
            <span> Memory</span>
          </div>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Used Memory:
              <span class="server-status-text">{{this.connectionStatus.used_memory_human}}</span>
            </el-tag>
          </p>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Used Memory Peak:
              <span class="server-status-text">{{this.connectionStatus.used_memory_peak_human}}</span>
            </el-tag>
          </p>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Used Memory Lua:
              <span class="server-status-text">{{Math.round(this.connectionStatus.used_memory_lua / 1024)}}K</span>
            </el-tag>
          </p>
        </el-card>
      </el-col>

      <!-- stats row -->
      <el-col :span="8">
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <i class="fa fa-thermometer-three-quarters"></i>
            <span>Stats</span>
          </div>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Connected Clients:
              <span class="server-status-text">{{this.connectionStatus.connected_clients}}</span>
            </el-tag>
          </p>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Total Connections:
              <span class="server-status-text">{{this.connectionStatus.total_connections_received}}</span>
            </el-tag>
          </p>

          <p class="server-status-tag-p">
            <el-tag class='server-status-container' type="info" size="big">
              Total Commands:
              <span class="server-status-text">{{this.connectionStatus.total_commands_processed}}</span>
            </el-tag>
          </p>
        </el-card>
      </el-col>
    </el-row>

    <!-- key statistics -->
    <el-row class="status-card">
      <el-col>
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <i class="fa fa-bar-chart"></i>
            <span>Key Statistics</span>
          </div>

          <el-table :data="DBKeys" stripe>
            <el-table-column fixed prop="db" label="DB">
            </el-table-column>
            <el-table-column sortable prop="keys" label="Keys" :sort-method="sortByKeys">
            </el-table-column>
            <el-table-column sortable prop="expires" label="Expires" :sort-method="sortByExpires">
            </el-table-column>
            <el-table-column sortable prop="avg_ttl" label="Avg TTL" :sort-method="sortByTTL">
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- redis all info -->
    <el-row class="status-card">
      <el-col>
        <el-card class="box-card">
          <div slot="header" class="clearfix">
            <i class="fa fa-info-circle"></i>
            <span> All Redis Info</span>
          </div>

          <el-table :data="AllRedisInfo" stripe>
            <el-table-column fixed prop="key" label="Key">
            </el-table-column>
            <el-table-column prop="value" label="Value">
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

  </div>
</template>

<script>
import { getVscodeEvent } from "../util/vscode"
let vscodeEvent
export default {
  data() {
    return {
      autoRefresh: false,
      refreshTimer: null,
      refreshInterval: 2000,
      connectionStatus: {},
      statusConnection: null,
    }
  },
  mounted() {
    vscodeEvent = getVscodeEvent()
    this.refreshInit()
    vscodeEvent.on("info", (info) => {
      this.initStatus(info)
    })
    vscodeEvent.emit("route-" + this.$route.name)
  },
  destroyed() {
    clearInterval(this.refreshTimer)
    vscodeEvent.destroy()
  },
  methods: {
    refreshInit() {
      this.refreshTimer=setInterval(() => {
        if (this.autoRefresh) {
          vscodeEvent.emit("route-" + this.$route.name)
        }
      },2000);
    },
    sortByKeys(a, b) {
      return a.keys - b.keys
    },
    sortByExpires(a, b) {
      return a.expires - b.expires
    },
    sortByTTL(a, b) {
      return a.avg_ttl - b.avg_ttl
    },
    initStatus(content) {
      if (!content) {
        return {}
      }

      content = content.split("\n")
      const lines = {}

      for (let i of content) {
        i = i.replace(/\s/gi, "")
        if (i.startsWith("#") || !i) continue

        const kv = i.split(":")
        lines[kv[0]] = kv[1]
      }

      this.connectionStatus = lines
    },
  },
  computed: {
    DBKeys() {
      const dbs = []

      for (const i in this.connectionStatus) {
        if (i.startsWith("db")) {
          const item = this.connectionStatus[i]
          const array = item.split(",")

          dbs.push({
            db: i,
            keys: array[0].split("=")[1],
            expires: array[1].split("=")[1],
            avg_ttl: array[2].split("=")[1],
          })
        }
      }

      return dbs
    },
    AllRedisInfo() {
      const infos = []

      for (const i in this.connectionStatus) {
        infos.push({ key: i, value: this.connectionStatus[i] })
      }

      return infos
    },
  },
}
</script>

<style scoped>
body {
  background-color: #f7f7f7;
  font-family: "Helvetica Neue", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
}

.el-row.status-card {
  margin-top: 20px;
}

.server-status-tag-p {
  height: 32px;
}

.server-status-container {
  width: 100%;
  overflow-x: hidden;
  text-overflow: ellipsis;
}

.server-status-text {
  color: #43b50b;
}
</style>