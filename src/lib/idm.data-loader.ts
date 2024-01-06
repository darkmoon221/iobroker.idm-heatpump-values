import axios from 'axios';
import * as crypto from 'crypto';


interface GraphData {
  name: string,
  values: any[]
}

export class IdmDataLoader {

  private readonly adapter: any;

  private readonly idmHost = 'https://www.myidm.at';

  // private readonly nav20Host = 'https://nav20.myidm.at';

  private localIdmUrl?: string;
  private pin?: string;

  private token?: string;

  private id?: string;

  private idmId?: string;

  private csrfToken?: string;

  constructor(idmDataLoader: any) {
    this.adapter = idmDataLoader;
  }

  public async login(localIdmUrl: string, pin: string, username: string, password: string): Promise<void> {
    this.adapter.log.info('Login to idm portal');

    this.localIdmUrl = localIdmUrl;
    this.pin = pin;

    const data = {
      'username': username,
      'password': this.encode(password)
    };

    const loginConfig = {
      method: 'post',
      url: this.idmHost + '/api/user/login',
      headers: {
        'User-Agent': 'IDM App (Android)',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data
    };

    try {
      const loginResponse = await axios(loginConfig);

      if (loginResponse.status === 200) {
        this.token = loginResponse.data['token'];
        this.id = loginResponse.data['installations'][0]['id'];
        this.idmId = this.parseIdmId(loginResponse.headers);

        this.adapter.log.debug('Data from login: (Token, Id, IdmId): ' + this.token + ', ' + this.id + ', ' + this.idmId);

      } else {
        this.adapter.log.error('IDM Portal login failed: ' + loginResponse.statusText + ', Check your credentials');
        this.adapter.setState('info.connection', false, true);
      }

    } catch (error) {
      this.adapter.log.error('IDM Portal login failed: ' + error);
      this.adapter.setState('info.connection', false, true);
    }
  }

  public async localLogin(localIdmUrl: string, pin: string,): Promise<void> {
    this.adapter.log.info('Login to local idm portal');

    this.localIdmUrl = localIdmUrl;
    this.pin = pin;

    const localLoginData = {
      'pin': this.pin
    };

    // Request one: Get the 'MYIDM' Id
    const getIdmIdConfig = {
      method: 'post',
      url: this.localIdmUrl + '/index.php',
      headers: {
        'User-Agent': 'IDM App (Android)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      maxRedirects: 0 // Do not redirect, need the cookie header of the response
    };

    try {
      await axios(getIdmIdConfig);
    } catch (error: any) {
      if (error?.response?.headers) {
        this.idmId = this.parseIdmId(error.response.headers);
      } else {
        this.adapter.log.error('Could not extract IDM ID' + error);
      }
    }

    // Request two: Login to get the csrf token
    const localLoginConfig = {
      method: 'post',
      url: this.localIdmUrl + '/index.php',
      headers: {
        'User-Agent': 'IDM App (Android)',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': this.idmId
      },
      data: localLoginData
    };

    try {
      const csrfResponse = await axios(localLoginConfig);
      this.csrfToken = this.getCsrfToken(csrfResponse.data);
      this.adapter.log.debug('Parsed csrf-token: ' + this.csrfToken);
    } catch (error) {
      this.adapter.log.error('Could not parse csrf-token' + error);
      this.adapter.setState('info.connection', false, true);
    }
  }

  public async getEnergyData(): Promise<void> {
    const dataConfig = {
      method: 'get',
      url: this.localIdmUrl + '/data/statistics.php?type=baenergyhp',
      headers: {
        'Cookie': this.idmId,
        'CSRF-Token': this.csrfToken
      }
    };

    try {
      const dataResponse = await axios(dataConfig);
      this.adapter.log.debug('Data response: ' + JSON.stringify(dataResponse.data).substring(0, 100));

      await this.adapter.setStateAsync('system.energy-consumption', {val: JSON.stringify(dataResponse.data), ack: true});

      await this.createJsonGraph(JSON.stringify(dataResponse.data));

    } catch (error) {
      this.adapter.log.error('Could not load energy data: ' + error);
      this.adapter.setState('info.connection', false, true);
    }
  }

  private getCsrfToken(input: string): string | undefined {
    const regexp: RegExp = new RegExp('(csrf_token)(=)(")([a-z0-9]*)(")');
    const groups = regexp.exec(input);
    if (groups && groups[4]) {
      return regexp.exec(input)![4];
    } else {
      return undefined;
    }
  }

  private encode = (input: string): string => {
    return crypto.createHash('sha1').update(input, 'binary').digest('hex');
  };

  private parseIdmId = (headers: any): string | undefined => {
    if (headers['set-cookie'] && headers['set-cookie'][0]) {
      const regex = new RegExp('(MYIDM=)([^;]+)(;)');
      const groups = regex.exec(headers['set-cookie'][0]);
      if (groups && groups[0]) {
        return groups[0];
      }
    }
    return undefined;
  };

  private async createJsonGraph(input: any): Promise<void> {

    const json = JSON.parse(input);
    const data = json['data'];
    const daily = data['daily'];

    const result: GraphData[] = [];

    for (const entry of daily) {
      const name = entry['name'];
      const values = entry['values'];

      result.push({name, values});
    }

    const heating = result.map(e => e.values[0]).map(x => x[0]).map(v => Math.round(v * 10) / 10);
    const water = result.map(e => e.values[0]).map(x => x[1]).map(v => Math.round(v * 10) / 10);
    const defrost = result.map(e => e.values[0]).map(x => x[2]).map(v => Math.round(v * 10) / 10);
    const colors = json['items'][0].map((x: any) => x.color);

    const graph = {
      'axisLabels': result.map(e => e.name),
      'graphs': [
        {
          'type': 'bar',
          'barIsStacked': true,
          'data': heating,
          'yAxis_id': 0,
          'barStackId': 1,
          'color': colors[0],
          'datalabel_color': '#000000',
          'datalabel_align': 'start'
        },
        {
          'type': 'bar',
          'barIsStacked': true,
          'data': water,
          'yAxis_id': 0,
          'barStackId': 1,
          'color': colors[1],
          'datalabel_color': '#000000',
          'datalabel_align': 'start'
        },
        {
          'type': 'bar',
          'barIsStacked': true,
          'data': defrost,
          'yAxis_id': 0,
          'barStackId': 1,
          'color': '#e8d73e',
          'datalabel_color': '#000000',
          'datalabel_align': 'start'
        }
      ]
    };
    await this.adapter.setStateAsync('graph.energy-consumption', {val: JSON.stringify(graph), ack: true}).catch((e: any) => this.adapter.log(e));
  }

}
