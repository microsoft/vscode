import { getVscodeEvent } from "../util/vscode";

export const inject = {
    data() {
        return {
            vscodeEvent: null
        }
    },
    mounted() {
        this.vscodeEvent = getVscodeEvent()
    },
    methods: {
        init() {
            this.vscodeEvent.emit("route-" + this.$route.name);
        }, on(event, callback) {
            this.vscodeEvent.on(event, callback)
            return this;
        },
        emit(event, data) {
            this.vscodeEvent.emit(event, data)
            return this;
        }
    },
    destroyed() {
        this.vscodeEvent.destroy();
    },
}