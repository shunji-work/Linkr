// ===== ターミナル版の入口 =====
// 画面とのやり取り(入力・クリップボード)だけを置く
// 再生リストを取ってくる部分は src/youtube.ts にあり、React版でもそのまま使える

import { createInterface, type Interface } from "node:readline/promises";
import { execSync } from "node:child_process";
import { extractPlaylistId, fetchPlaylistVideoUrls, findPlaylistProblem } from "./src/youtube";

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
    //APIキーが無いと何もできないので、入力を聞く前に確かめる
    const apiKey = process.env.VITE_YOUTUBE_API_KEY;
    if (!apiKey) {
        console.log(".env に VITE_YOUTUBE_API_KEY がありません。");
        return;
    }

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
        playlistId = extractPlaylistId(playlistUrl);
        if (!playlistId) {
            console.log("再生リストのURLではありません。もう一度入力してください。");
            continue;
        }

        //URLの形は合っていても、その再生リストが実際に取れるとは限らないのでここで確かめる
        const problem = await findPlaylistProblem(apiKey, playlistId);
        if (problem) {
            console.log(`${problem}もう一度入力してください。`);
            playlistId = null;
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
    const videoUrls = await fetchPlaylistVideoUrls(apiKey, playlistId, startPosition, endPosition);

    if (videoUrls.length === 0) {
        console.log(fetchAll ? "再生リストに動画がありませんでした。" : "指定した範囲に動画がありませんでした。");
        return;
    }

    // ===== ③ を呼び出す =====
    copyUrlsToClipboard(videoUrls);
    console.log(`${videoUrls.length}件のURLをクリップボードにコピーしました。`);
}

//取得の途中で失敗したとき(クォータ切れ、通信断など)に、長いエラー表示ではなく理由の1行だけ出す
main().catch((error) => {
    console.log(error instanceof Error ? error.message : error);
    process.exit(1);
});
