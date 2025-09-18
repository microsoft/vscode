import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
import VueRouter from 'vue-router'
import UmyTable from 'umy-table'
import UmyTableLocale from 'umy-table/lib/locale'

import 'umy-table/lib/theme-chalk/index.css';
import "../../public/theme/auto.css"
import "../../public/theme/umyui.css"
import "../../public/theme/codicons.css"
import "tailwindcss/tailwind.css"

Vue.use(VueRouter)
Vue.use(ElementUI, { locale });

// Configure UmyTable to use English locale
UmyTableLocale.use({
  plx: {
    table: {
      emptyText: 'No Data',
      confirmFilter: 'Confirm',
      resetFilter: 'Reset',
      clearFilter: 'All',
      sumText: 'Sum',
      text: {
        selectAll: 'Select All',
        unSelectAll: 'Unselect All'
      }
    }
  }
});

Vue.use(UmyTable);

Vue.config.productionTip = false

import connect from "./connect/index.vue";
import status from "./status/index.vue";
import design from "./design/index.vue";
import structDiff from "./structDiff/index.vue";
import keyView from "./redis/keyView.vue";
import terminal from "./redis/terminal.vue";
import redisStatus from "./redis/redisStatus.vue";
import forward from "./forward/index.vue";
import sshTerminal from "./xterm/index.vue";

const router = new VueRouter({
  routes: [
    { path: '/connect', component: connect, name: 'connect' },
    { path: '/status', component: status, name: 'status' },
    { path: '/design', component: design, name: 'design' },
    { path: '/structDiff', component: structDiff, name: 'structDiff' },
    // redis
    { path: '/keyView', component: keyView, name: 'keyView' },
    { path: '/terminal', component: terminal, name: 'terminal' },
    { path: '/redisStatus', component: redisStatus, name: 'redisStatus' },
    // ssh
    { path: '/forward', component: forward, name: 'forward' },
    { path: '/sshTerminal', component: sshTerminal, name: 'sshTerminal' },
  ]
})

new Vue({
  el: '#app',
  components: { App },
  router,
  template: '<App/>'
})
