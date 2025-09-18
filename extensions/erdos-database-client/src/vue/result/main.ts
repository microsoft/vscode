import Vue from 'vue'
import App from './App.vue'
import ElementUI from 'element-ui';
import locale from 'element-ui/lib/locale/lang/en'
Vue.use(ElementUI, { locale });
import Contextmenu from "./component/Contextmenu"
Vue.use(Contextmenu);

import UmyTable from 'umy-table'
import UmyTableLocale from 'umy-table/lib/locale'
import 'umy-table/lib/theme-chalk/index.css';
import "../../../public/theme/auto.css"
import "../../../public/theme/umyui.css"
import "../../../public/theme/codicons.css"
import './view.css'

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

new Vue({
  el: '#app',
  components: { App },
  template: '<App/>'
})
