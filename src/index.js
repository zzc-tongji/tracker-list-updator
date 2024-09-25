import { ArgumentParser } from 'argparse';

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const f = (url, fetchOption) => {
  const timeoutMs = 10000;
  return Promise.race([
    fetch(url, fetchOption).catch((error) => {
      throw new Error(`fetch | ${url} | network issue | ${error.message}`);
    }),
    sleep(timeoutMs).then(() => {
      throw new Error(`fetch | ${url} | network issue | timeout after ${timeoutMs} ms`);
    }),
  ]);
};

const main = async () => {
  const parser = new ArgumentParser({
    description: 'Update Tracker List',
  });
  parser.add_argument('--tracker-provider', '-t', { help: 'tracker provider url(s) splited by "#"', required: true });
  parser.add_argument('--qbittorrent-site', '-q', { help: 'qbittorrent site url(s) splited by "#", format as "<protocol>://<username>@<password>:<hostname>"', required: true });
  const argv = parser.parse_args();
  // get tracker list
  const trackerProviderList = argv['tracker_provider'].split('#');
  const trackerList = [];
  for (let i = 0; i < trackerProviderList.length; i++) {
    const text = await f(trackerProviderList[i]).then((response) => {
      return response.text();
    }).catch((e) => {
      console.warn(`warning | ${e.message}`);
      return '';
    });
    if (!text) {
      continue;
    }
    trackerList.push(...text.split('\n').filter(l => l.trim()));
  }
  // qbittorrent
  const qbittorrentSiteList = argv['qbittorrent_site'].split('#');
  for (let i = 0; i < qbittorrentSiteList.length; i++) {
    const temp = /^(.*):\/\/(((.+):(.+))@|)(.*?)(\/|)$/.exec(qbittorrentSiteList[i]);
    if (!temp) {
      console.warn(`warning | invalid qbittorrent site | ${qbittorrentSiteList[i]}`);
      continue;
    }
    // login
    const baseUrl = `${temp[1]}://${temp[6]}`;
    const cookie = await f(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${temp[4]}&password=${temp[5]}`,
    }).then((response) => {
      for (const pair of response.headers.entries()) {
        if (pair[0].toLowerCase() === 'set-cookie') {
          return pair[1];
        }
      }
      return '';
    }).catch((e) => {
      console.warn(`warning | ${e.message}`);
      return '';
    });
    if (!cookie) {
      console.warn(`warning | fail to login | ${qbittorrentSiteList[i]}`);
      continue;
    }
    // set tracker list
    await f(`${baseUrl}/api/v2/app/setPreferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: `json=${JSON.stringify({ add_trackers: trackerList.join('\n') })}`,
    }).then((response) => {
      if (!response.ok) { throw new Error('fail to set tracker list'); }
    }).catch((e) => {
      console.warn(`warning | ${e.message}`);
    });
  }
  console.log('Finish.');
};

main();
