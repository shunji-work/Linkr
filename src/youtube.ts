// ===== YouTube の再生リストを扱う部分 =====
// ここには node 専用のもの(readline, child_process など)を入れないこと
// ブラウザでもそのまま動くので、React版はこのファイルをimportして画面だけ書けばよい

// APIから返ってくるJSONのうち、使う部分だけの型
//削除済みや非公開の動画はサムネイルが入っていないことがあるので ? を付けている
type PlaylistItemsResponse = {
    nextPageToken?: string;
    items: {
        contentDetails: { videoId: string };
        snippet: {
            title: string;
            thumbnails?: { medium?: { url: string } };
        };
    }[];
};

// 画面に出すときに使う、動画1本分のまとまり
export type PlaylistVideo = {
    videoId: string;
    title: string;
    thumbnailUrl: string;
    url: string;
};

const PLAYLIST_ITEMS_URL = "https://www.googleapis.com/youtube/v3/playlistItems";
const VIDEO_URL_PREFIX = "https://www.youtube.com/watch?v=";
//1回のリクエストで取れる上限(APIの仕様で50が最大)
const PAGE_SIZE = 50;

// ===== ① 再生リストのURLから再生リストIDを取り出す =====
//渡すもの:再生リストのURL
//返すもの:再生リストID。URLの形でないときや list= が付いていないときは null
export function extractPlaylistId(playlistUrl: string): string | null {
    if (!URL.canParse(playlistUrl)) {
        return null;
    }
    return new URL(playlistUrl).searchParams.get("list");
}

//APIに1回だけ問い合わせる。返事の中身は見ないで、そのまま返す
//渡すもの:APIキー、再生リストID、1回に取る件数、続きから取るときの合図
async function fetchPlaylistItemsPage(
    apiKey: string,
    playlistId: string,
    maxResults: number,
    pageToken?: string
): Promise<Response> {
    const params = new URLSearchParams({
        part: "snippet,contentDetails",
        playlistId: playlistId,
        maxResults: String(maxResults),
        key: apiKey,
    });
    //  続きがあるときは、nextPageTokenをpageTokenに付けて次のリクエストを送る
    if (pageToken) {
        params.set("pageToken", pageToken);
    }

    return fetch(`${PLAYLIST_ITEMS_URL}?${params}`);
}

// ===== ② 取ってきて、動画の一覧にする =====
//渡すもの:APIキー、再生リストID、何番目から、何番目まで(省略したら最後まで)
//返すもの:動画(ID・タイトル・サムネ・URL)の一覧
export async function fetchPlaylistVideos(
    apiKey: string,
    playlistId: string,
    startPosition: number,
    endPosition?: number
): Promise<PlaylistVideo[]> {
    //  届いたデータは実行が終わるまでためておく
    const videos: PlaylistVideo[] = [];
    let pageToken: string | undefined = undefined;

    //  「何番目まで」が決まっていれば、ためた件数がそこに届いたら止める
    //  決まっていなければ、nextPageTokenが届かなくなるまで回す
    while (endPosition === undefined || videos.length < endPosition) {
        const response = await fetchPlaylistItemsPage(apiKey, playlistId, PAGE_SIZE, pageToken);
        if (!response.ok) {
            throw new Error(`APIエラー(${response.status}):再生リストが存在しないか、非公開の可能性があります`);
        }

        const data: PlaylistItemsResponse = await response.json();
        const countBeforeThisPage = videos.length;
        for (const item of data.items) {
            const videoId = item.contentDetails.videoId;
            videos.push({
                videoId: videoId,
                title: item.snippet.title,
                //サムネが無い動画(削除済み・非公開)は空文字にしておき、画面側で枠だけ出す
                thumbnailUrl: item.snippet.thumbnails?.medium?.url ?? "",
                url: `${VIDEO_URL_PREFIX}${videoId}`,
            });
        }

        //  nextPageTokenが届かなかったら止める
        //  動画が1件も増えなかったときも止める(同じページが返り続けても回り続けないための保険)
        if (!data.nextPageToken || videos.length === countBeforeThisPage) {
            break;
        }
        pageToken = data.nextPageToken;
    }

    //ためたデータから「何番目から何番目まで」を切り出す
    //endPositionが未指定のときは、sliceは最後まで切り出してくれる
    return videos.slice(startPosition - 1, endPosition);
}

// ===== ②'' URLの一覧だけが欲しいとき用(ターミナル版が使う) =====
export async function fetchPlaylistVideoUrls(
    apiKey: string,
    playlistId: string,
    startPosition: number,
    endPosition?: number
): Promise<string[]> {
    const videos = await fetchPlaylistVideos(apiKey, playlistId, startPosition, endPosition);
    return videos.map((video) => video.url);
}

// ===== ②' 入力された再生リストが本当に使えるかを、1件だけ試しに取って確かめる =====
//返すもの:使えるならnull、入力し直せば直るならその理由(メッセージ)
//入力し直しても直らないもの(キーが違う、クォータ切れ、通信できない等)はエラーを投げて終わる
export async function findPlaylistProblem(apiKey: string, playlistId: string): Promise<string | null> {
    const response = await fetchPlaylistItemsPage(apiKey, playlistId, 1);
    if (response.ok) {
        return null;
    }
    if (response.status === 404) {
        return "その再生リストが見つかりません。非公開か、URLが違う可能性があります。";
    }
    throw new Error(`APIエラー(${response.status}):再生リストを取得できませんでした`);
}
