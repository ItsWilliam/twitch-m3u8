const https = require('https');

function get(url) {
    return new Promise((resolve, reject) => {
        const nUrl = new URL(url);
        const options = {
            host: nUrl.host,
            hostname: nUrl.hostname,
            origin: nUrl.origin,
            path: nUrl.pathname + nUrl.search,
            href: nUrl.href,
            headers: {
                'client-id': clientId,
            },
        };
        /* console.log('clientId', clientId);
        console.log('options', options); */
        https.get(options, (response) => {
            // console.log('response', response);
                let data = {};
                data.statusCode = response.statusCode;
                data.body = [];
                response.on('data', (chunk) => data.body.push(chunk));
                response.on('end', () => {
                    data.body = data.body.join('');
                    resolve(data);
                });
            })
            .on('error', (error) => reject(error));
    });
}

function getAccessToken(id, vod) {
    return new Promise((resolve, reject) => {
        get(`https://api.twitch.tv/api/${vod ? 'vods' : 'channels'}/${id}/access_token?oauth_token=undefined&need_https=true&platform=web&player_type=picture-by-picture&player_backend=mediaplayer`)
            .then((data) => {
                if (data.statusCode != 200) {
                    // console.log('accessToken', data.body);
                    reject(new Error(`${JSON.parse(data.body).message}`));
                } else {
                    resolve(JSON.parse(data.body));
                }
            })
            .catch((error) => reject(error));
    });
}

function getPlaylist(id, accessToken, vod) {
    return new Promise((resolve, reject) => {
        get(`https://usher.ttvnw.net/${vod ? 'vod' : 'api/channel/hls'}/${id}.m3u8?client_id=${clientId}&token=${accessToken.token}&sig=${accessToken.sig}&allow_source&allow_audio_only`)
            .then((data) => {
                switch (data.statusCode) {
                    case 200:
                        resolve(resolve(data.body));
                        break;
                    case 404:
                        reject(new Error('Transcode does not exist - the stream is probably offline'));
                        break;
                    default:
                        reject(new Error(`Twitch returned status code ${data.statusCode}`));
                        break;
                }
            })
            .catch((error) => reject(error));
    });
}

function parsePlaylist(playlist) {
    const parsedPlaylist = [];
    const lines = playlist.split('\n');
    const lineLimit = lines.limit > 4 ? lines.length - 1 : lines.length;
    for (let i = 4; i < lineLimit; i += 3) {
        parsedPlaylist.push({
            quality: lines[i - 2].split('NAME="')[1].split('"')[0],
            resolution: (lines[i - 1].indexOf('RESOLUTION') != -1 ? lines[i - 1].split('RESOLUTION=')[1].split(',')[0] : null),
            url: lines[i]
        });
    }
    return parsedPlaylist;
}

function getStream(channel, raw) {
    return new Promise((resolve, reject) => {
        getAccessToken(channel)
            .then((accessToken) => getPlaylist(channel, accessToken))
            .then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
            .catch(error => reject(error));
    });
}

function getVod(vid, raw) {
    return new Promise((resolve, reject) => {
        getAccessToken(vid, true)
            .then((accessToken) => getPlaylist(vid, accessToken, true))
            .then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
            .catch(error => reject(error));
    });
}

module.exports = function (cid) {
    clientId = cid;
    return {
        getStream: getStream,
        getVod: getVod
    };
};

/* const twitch = test('kimne78kx3ncx6brgo4mv6wki5h1ko');
twitch.getStream('mizkif', false).then((result) => {
    console.log(result);
}); */
