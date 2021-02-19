import axios, { AxiosResponse } from 'axios';

export interface AccessToken {
    value: string,
    signature: string,
}

export interface StreamData {
    url: string,
    resolution: string | null,
    quality: string
}

export interface GraphQlPacket {
    operationName: string,
    variables: {
        isLive: boolean,
        isVod: boolean,
        login: string,
        playerType: string,
        vodID: string | number,
    },
    query: string,
}


export default function test (cid: string): { getVod: typeof getVod, getStream: typeof getStream } {
    const clientId = cid;

    function get(url: string): Promise<AxiosResponse> {
        return new Promise((resolve, reject) => {
            axios.get(url, {
                headers: {
                    'client-id': clientId,
                },
            })
            .then((response) => resolve(response))
            .catch((error) => reject(error));
        });
    }
    
    function post(url: string, data: string): Promise<AxiosResponse<any>> {
        return new Promise((resolve, reject) => {
            axios.post(url, data, {
                headers: {
                    'client-id': clientId,
                },
            })
            .then((response) => resolve(response))
            .catch((error) => reject(error));
        });
    }
    
    function getAccessToken(channel: string | null, vod: boolean, id: string | number = "" ): Promise<AccessToken> {
        return new Promise((resolve, reject) => {
            const query = makeGraphQlPacket(channel, vod, id);
            post('https://gql.twitch.tv/gql', JSON.stringify(query)).then((response): void => {
                if (response.status !== 200) {
                    reject(new Error(`Failed to get access token (${response.status}): ${response.data}`));
                } else {
                    // console.log('data.data', data.data);
                    if (response.data === undefined) {
                        reject(new Error(`malformed response - missing data: ${response.data}`));
                    }
                    const data = response.data;
                    // console.log('data', data);
                    if (data.length === 0) {
                        reject(new Error(`data missing from response: ${data}`));
                    }
                    if (data[0].data === undefined) {
                        reject(new Error(`data missing from response: ${data}`));
                    }
                    if (!vod && data[0].data.streamPlaybackAccessToken === undefined) {
                        reject(new Error(`streamPlaybackAccessToken missing from data: ${JSON.stringify(data)}`));
                    } else if (vod && data[0].data.videoPlaybackAccessToken === undefined) {
                        reject(new Error(`videoPlaybackAccessToken missing from data: ${JSON.stringify(data)}`));
                    }
                    const accessToken = !vod ? data[0].data.streamPlaybackAccessToken : data[0].data.videoPlaybackAccessToken;
                    resolve(accessToken);
                }
            }).catch((error) => reject(error));
        });
    }
    
    function makeGraphQlPacket(channel: string | null, vod: boolean, id: string | number = ""): Array<GraphQlPacket> {
        return [{
            operationName: 'PlaybackAccessToken_Template',
            variables: {
                isLive: !vod,
                isVod: vod,
                login: channel ? channel : "",
                playerType: "site",
                vodID: id,
            },
            query: `query PlaybackAccessToken_Template(
                $login: String!
                $isLive: Boolean!
                $vodID: ID!
                $isVod: Boolean!
                $playerType: String!
              ) {
                streamPlaybackAccessToken(
                  channelName: $login
                  params: {
                    platform: "web"
                    playerBackend: "mediaplayer"
                    playerType: $playerType
                  }
                ) @include(if: $isLive) {
                  value
                  signature
                  __typename
                }
                videoPlaybackAccessToken(
                  id: $vodID
                  params: {
                    platform: "web"
                    playerBackend: "mediaplayer"
                    playerType: $playerType
                  }
                ) @include(if: $isVod) {
                  value
                  signature
                  __typename
                }
              }`,
        }]
    }
    
    function getPlaylist(id: string | number, accessToken: AccessToken, vod: boolean = false): Promise<string> {
        return new Promise((resolve, reject) => {
            get(`https://usher.ttvnw.net/${vod ? 'vod' : 'api/channel/hls'}/${id}.m3u8?client_id=${clientId}&token=${accessToken.value}&sig=${accessToken.signature}&allow_source&allow_audio_only`)
                .then((response) => {
                    switch (response.status) {
                        case 200:
                            resolve(response.data);
                            break;
                        case 404:
                            reject(new Error('Transcode does not exist - the stream is probably offline'));
                            break;
                        default:
                            reject(new Error(`Twitch returned status code ${response.status}`));
                            break;
                    }
                })
                .catch((error) => reject(error));
        });
    }
    
    function parsePlaylist(playlist: string): Array<StreamData> {
        const parsedPlaylist: Array<StreamData> = [];
        const lines = playlist.split('\n');
        const lineLimit = lines.length > 4 ? lines.length - 1 : lines.length;
        for (let i = 4; i < lineLimit; i += 3) {
            parsedPlaylist.push({
                quality: lines[i - 2].split('NAME="')[1].split('"')[0],
                resolution: (lines[i - 1].indexOf('RESOLUTION') != -1 ? lines[i - 1].split('RESOLUTION=')[1].split(',')[0] : null),
                url: lines[i]
            });
        }
        return parsedPlaylist;
    }
    
    function getStream(channel: string, raw: boolean = false): Promise<string | StreamData[]> {
        return new Promise((resolve, reject) => {
            getAccessToken(channel, false)
                .then((accessToken) => getPlaylist(channel, accessToken))
                .then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
                .catch(error => reject(error));
        });
    }
    
    function getVod(vid: string | number, raw: boolean = false): Promise<string | StreamData[]> {
        return new Promise((resolve, reject) => {
            getAccessToken(null, true, vid)
                .then((accessToken) => getPlaylist(vid, accessToken, true))
                .then((playlist) => resolve((raw ? playlist : parsePlaylist(playlist))))
                .catch(error => reject(error));
        });
    }

    return {
        getVod: getVod,
        getStream: getStream
    }
    
};

const twitch = test('kimne78kx3ncx6brgo4mv6wki5h1ko');
twitch.getStream('mizkif', false).then((result: any) => {
    console.log('mizkif stream', result);
}).catch((error: { message: any; }) => {
    console.log('error', error.message);
});

twitch.getVod('872482730', false).then((result: any) => {
    console.log('mizkif vod', result);
}).catch((error: { message: any; }) => {
    console.log('error', error.message);
});