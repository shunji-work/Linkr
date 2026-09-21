import { createInterface, type Interface } from "node:readline/promises";
import { execSync } from "node:child_process";

// APIから返ってくるJSONのうち、使う部分だけの型
type PlaylistItemsResponse = {
    nextPageToken?: string;
    items: { contentDetails: { videoId: string } }[];
};

// ===== ② 取ってきて、URLの一覧にする(React版でも使い回す) =====
//渡すもの:APIキー、再生リストID、何番目から、何番目まで(省略したら最後まで)
//返すもの:URLの一覧
async function fetchPlaylistVideoUrls(
    apiKey: string,
    playlistId: string,
    startPosition: number,
    endPosition?: number
): Promise<string[]> {
    //  届いたデータは実行が終わるまでためておく
    const videoIds: string[] = [];
    let pageToken: string | undefined = undefined;

    //  「何番目まで」が決まっていれば、ためた件数がそこに届いたら止める
    //  決まっていなければ、nextPageTokenが届かなくなるまで回す
    while (endPosition === undefined || videoIds.length < endPosition) {
        //apiに送るリクエストを作って送る
        const params = new URLSearchParams({
            part: "contentDetails",
            playlistId: playlistId,
            maxResults: "50",
            key: apiKey,
        });
        //  止めないときは、nextPageTokenをpageTokenに付けて次のリクエストを送る
        if (pageToken) {
            params.set("pageToken", pageToken);
        }

        const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
        if (!response.ok) {
            throw new Error(`APIエラー(${response.status}):再生リストが存在しないか、非公開の可能性があります`);
        }

        const data: PlaylistItemsResponse = await response.json();
        for (const item of data.items) {
            videoIds.push(item.contentDetails.videoId);
        }

        //  nextPageTokenが届かなかったら止める
        if (!data.nextPageToken) {
            break;
        }
        pageToken = data.nextPageToken;
    }

    //ためたデータから「何番目から何番目まで」を切り出す
    //endPositionが未指定のときは、sliceは最後まで切り出してくれる
    //動画IDを https://www.youtube.com/watch?v=動画ID の形にする
    return videoIds
        .slice(startPosition - 1, endPosition)
        .map((videoId) => `https://www.youtube.com/watch?v=${videoId}`);
}

// ===== ③ 出力する(ターミナル版) =====
//URLの一覧を箇条書きにしてpbcopyでクリップボードに入れる
function copyUrlsToClipboard(videoUrls: string[]) {
    const text = videoUrls.join("\n");
    execSync("pbcopy", { input: text });
}

// ===== ① のうち「何番目から何番目まで」を聞く部分(ターミナル版) =====
//範囲を指定するときだけ呼ぶ
async function askRange(rl: Interface): Promise<{ startPosition: number; endPosition: number }> {
    //何番目から何番目までかを入力させる
    let startPosition: number | null = null;
    while (startPosition === null) {
        const startInput = await rl.question("何番目から?(例: 1): ");
        const startNumber = Number(startInput);
        if (!Number.isInteger(startNumber) || startNumber < 1) {
            console.log("1以上の整数で入力してください。");
            continue;
        }
        startPosition = startNumber;
    }

    let endPosition: number | null = null;
    while (endPosition === null) {
        const endInput = await rl.question("何番目まで?(例: 10): ");
        const endNumber = Number(endInput);
        if (!Number.isInteger(endNumber)) {
            console.log("整数で入力してください。");
            continue;
        }
        if (endNumber < startPosition) {
            console.log(`${startPosition}以上の数字を入力してください。`);
            continue;
        }
        endPosition = endNumber;
    }

    return { startPosition, endPosition };
}

async function main() {
    // ===== ① 入力を受け取る(ターミナル版) =====
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    //ターミナルで再生リストのリンクを入力させる
    //おかしな入力なら、その場でもう一度聞き直す
    let playlistId: string | null = null;
    while (!playlistId) {
        const playlistUrl = await rl.question("再生リストのURL: ");
        if (!URL.canParse(playlistUrl)) {
            console.log("URLの形になっていません。もう一度入力してください。");
            continue;
        }
        playlistId = new URL(playlistUrl).searchParams.get("list");
        if (!playlistId) {
            console.log("再生リストのURLではありません。もう一度入力してください。");
        }
    }

    //全部取るか、範囲を指定するかを選ばせる
    let fetchAll: boolean | null = null;
    while (fetchAll === null) {
        const modeInput = await rl.question("全部取りますか?\n  1: 全部\n  2: 範囲を指定\n選択(1/2): ");
        if (modeInput === "1") {
            fetchAll = true;
        } else if (modeInput === "2") {
            fetchAll = false;
        } else {
            console.log("1 か 2 で入力してください。");
        }
    }

    //全部モードなら1番目から、終わりまで(endPositionは決めない)
    let startPosition = 1;
    let endPosition: number | undefined;
    if (!fetchAll) {
        ({ startPosition, endPosition } = await askRange(rl));
    }

    rl.close();

    // ===== ② を呼び出す =====
    const apiKey = process.env.VITE_YOUTUBE_API_KEY;
    if (!apiKey) {
        console.log(".env に VITE_YOUTUBE_API_KEY がありません。");
        return;
    }
    const videoUrls = await fetchPlaylistVideoUrls(apiKey, playlistId, startPosition, endPosition);

    if (videoUrls.length === 0) {
        console.log(fetchAll ? "再生リストに動画がありませんでした。" : "指定した範囲に動画がありませんでした。");
        return;
    }

    // ===== ③ を呼び出す =====
    copyUrlsToClipboard(videoUrls);
    console.log(`${videoUrls.length}件のURLをクリップボードにコピーしました。`);
}

main();