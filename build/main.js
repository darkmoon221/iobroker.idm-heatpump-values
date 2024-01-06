"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
__export(main_exports, {
  IdmHeatpumpValues: () => IdmHeatpumpValues
});
module.exports = __toCommonJS(main_exports);
var utils = __toESM(require("@iobroker/adapter-core"));
var import_idm_data_loader = require("./lib/idm.data-loader.js");
class IdmHeatpumpValues extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "idm-heatpump-values"
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    var _a, _b;
    this.setState("info.connection", false, true);
    this.log.info("config local IDM URL: " + this.config.localIdmUrl);
    this.log.info("config username: " + this.config.username);
    this.log.info("config password: ***");
    await this.setObjectNotExistsAsync("system.energy-consumption", {
      type: "state",
      common: {
        name: "energy-consumption",
        type: "object",
        role: "variable",
        read: true,
        write: true
      },
      native: {}
    });
    await this.setObjectNotExistsAsync("graph.energy-consumption", {
      type: "state",
      common: {
        name: "energy-consumption",
        type: "object",
        role: "variable",
        read: true,
        write: true
      },
      native: {}
    });
    this.idmDataLoader = new import_idm_data_loader.IdmDataLoader(this);
    await ((_a = this.idmDataLoader) == null ? void 0 : _a.localLogin(this.config.localIdmUrl, this.config.pin));
    await ((_b = this.idmDataLoader) == null ? void 0 : _b.getEnergyData());
    this.setTimeout(async () => {
      var _a2, _b2;
      await ((_a2 = this.idmDataLoader) == null ? void 0 : _a2.localLogin(this.config.localIdmUrl, this.config.pin));
      await ((_b2 = this.idmDataLoader) == null ? void 0 : _b2.getEnergyData());
    }, 5 * 60 * 1e3);
    this.setState("info.connection", true, true);
  }
  onUnload(callback) {
    try {
      callback();
    } catch (e) {
      callback();
    }
  }
  onStateChange(id, state) {
    if (state) {
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
    } else {
      this.log.info(`state ${id} deleted`);
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new IdmHeatpumpValues(options);
} else {
  (() => new IdmHeatpumpValues())();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IdmHeatpumpValues
});
//# sourceMappingURL=main.js.map
