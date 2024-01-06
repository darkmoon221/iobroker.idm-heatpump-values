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
var idm_data_loader_exports = {};
__export(idm_data_loader_exports, {
  IdmDataLoader: () => IdmDataLoader
});
module.exports = __toCommonJS(idm_data_loader_exports);
var import_axios = __toESM(require("axios"));
var crypto = __toESM(require("crypto"));
class IdmDataLoader {
  constructor(idmDataLoader) {
    this.idmHost = "https://www.myidm.at";
    this.encode = (input) => {
      return crypto.createHash("sha1").update(input, "binary").digest("hex");
    };
    this.parseIdmId = (headers) => {
      if (headers["set-cookie"] && headers["set-cookie"][0]) {
        const regex = new RegExp("(MYIDM=)([^;]+)(;)");
        const groups = regex.exec(headers["set-cookie"][0]);
        if (groups && groups[0]) {
          return groups[0];
        }
      }
      return void 0;
    };
    this.adapter = idmDataLoader;
  }
  async login(localIdmUrl, pin, username, password) {
    this.adapter.log.info("Login to idm portal");
    this.localIdmUrl = localIdmUrl;
    this.pin = pin;
    const data = {
      "username": username,
      "password": this.encode(password)
    };
    const loginConfig = {
      method: "post",
      url: this.idmHost + "/api/user/login",
      headers: {
        "User-Agent": "IDM App (Android)",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      data
    };
    try {
      const loginResponse = await (0, import_axios.default)(loginConfig);
      if (loginResponse.status === 200) {
        this.token = loginResponse.data["token"];
        this.id = loginResponse.data["installations"][0]["id"];
        this.idmId = this.parseIdmId(loginResponse.headers);
        this.adapter.log.debug("Data from login: (Token, Id, IdmId): " + this.token + ", " + this.id + ", " + this.idmId);
      } else {
        this.adapter.log.error("IDM Portal login failed: " + loginResponse.statusText + ", Check your credentials");
        this.adapter.setState("info.connection", false, true);
      }
    } catch (error) {
      this.adapter.log.error("IDM Portal login failed: " + error);
      this.adapter.setState("info.connection", false, true);
    }
  }
  async localLogin(localIdmUrl, pin) {
    var _a;
    this.adapter.log.info("Login to local idm portal");
    this.localIdmUrl = localIdmUrl;
    this.pin = pin;
    const localLoginData = {
      "pin": this.pin
    };
    const getIdmIdConfig = {
      method: "post",
      url: this.localIdmUrl + "/index.php",
      headers: {
        "User-Agent": "IDM App (Android)",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      maxRedirects: 0
    };
    try {
      await (0, import_axios.default)(getIdmIdConfig);
    } catch (error) {
      if ((_a = error == null ? void 0 : error.response) == null ? void 0 : _a.headers) {
        this.idmId = this.parseIdmId(error.response.headers);
      } else {
        this.adapter.log.error("Could not extract IDM ID" + error);
      }
    }
    const localLoginConfig = {
      method: "post",
      url: this.localIdmUrl + "/index.php",
      headers: {
        "User-Agent": "IDM App (Android)",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": this.idmId
      },
      data: localLoginData
    };
    try {
      const csrfResponse = await (0, import_axios.default)(localLoginConfig);
      this.csrfToken = this.getCsrfToken(csrfResponse.data);
      this.adapter.log.debug("Parsed csrf-token: " + this.csrfToken);
    } catch (error) {
      this.adapter.log.error("Could not parse csrf-token" + error);
      this.adapter.setState("info.connection", false, true);
    }
  }
  async getEnergyData() {
    const dataConfig = {
      method: "get",
      url: this.localIdmUrl + "/data/statistics.php?type=baenergyhp",
      headers: {
        "Cookie": this.idmId,
        "CSRF-Token": this.csrfToken
      }
    };
    try {
      const dataResponse = await (0, import_axios.default)(dataConfig);
      this.adapter.log.debug("Data response: " + JSON.stringify(dataResponse.data).substring(0, 100));
      await this.adapter.setStateAsync("system.energy-consumption", { val: JSON.stringify(dataResponse.data), ack: true });
      await this.createJsonGraph(JSON.stringify(dataResponse.data));
    } catch (error) {
      this.adapter.log.error("Could not load energy data: " + error);
      this.adapter.setState("info.connection", false, true);
    }
  }
  getCsrfToken(input) {
    const regexp = new RegExp('(csrf_token)(=)(")([a-z0-9]*)(")');
    const groups = regexp.exec(input);
    if (groups && groups[4]) {
      return regexp.exec(input)[4];
    } else {
      return void 0;
    }
  }
  async createJsonGraph(input) {
    const json = JSON.parse(input);
    const data = json["data"];
    const daily = data["daily"];
    const result = [];
    for (const entry of daily) {
      const name = entry["name"];
      const values = entry["values"];
      result.push({ name, values });
    }
    const heating = result.map((e) => e.values[0]).map((x) => x[0]).map((v) => Math.round(v * 10) / 10);
    const water = result.map((e) => e.values[0]).map((x) => x[1]).map((v) => Math.round(v * 10) / 10);
    const defrost = result.map((e) => e.values[0]).map((x) => x[2]).map((v) => Math.round(v * 10) / 10);
    const colors = json["items"][0].map((x) => x.color);
    const graph = {
      "axisLabels": result.map((e) => e.name),
      "graphs": [
        {
          "type": "bar",
          "barIsStacked": true,
          "data": heating,
          "yAxis_id": 0,
          "barStackId": 1,
          "color": colors[0],
          "datalabel_color": "#000000",
          "datalabel_align": "start"
        },
        {
          "type": "bar",
          "barIsStacked": true,
          "data": water,
          "yAxis_id": 0,
          "barStackId": 1,
          "color": colors[1],
          "datalabel_color": "#000000",
          "datalabel_align": "start"
        },
        {
          "type": "bar",
          "barIsStacked": true,
          "data": defrost,
          "yAxis_id": 0,
          "barStackId": 1,
          "color": "#e8d73e",
          "datalabel_color": "#000000",
          "datalabel_align": "start"
        }
      ]
    };
    await this.adapter.setStateAsync("graph.energy-consumption", { val: JSON.stringify(graph), ack: true }).catch((e) => this.adapter.log(e));
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IdmDataLoader
});
//# sourceMappingURL=idm.data-loader.js.map
