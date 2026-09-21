// ===== 画面本体(React版) =====
// ターミナル版(cli.ts)の main() と同じ順番を、そのまま画面に置き換えたもの
// ①入力を受け取る → ②取ってくる → ③コピーする

import { useState } from "react";
import { extractPlaylistId, fetchPlaylistVideos, findPlaylistProblem, type PlaylistVideo } from "./youtube";

const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY;

//「何番目から何番目まで」の入力を確かめる(ターミナル版の askRange と同じ言い方にしている)
//返すもの:使える数字ならその2つ、おかしければ理由
function checkRange(
    startInput: string,
    endInput: string
): { startPosition: number; endPosition: number } | { problem: string } {
    const startNumber = Number(startInput);
    if (!Number.isInteger(startNumber) || startNumber < 1) {
        return { problem: "「何番目から」は1以上の整数で入力してください。" };
    }

    const endNumber = Number(endInput);
    if (!Number.isInteger(endNumber)) {
        return { problem: "「何番目まで」は整数で入力してください。" };
    }
    if (endNumber < startNumber) {
        return { problem: `「何番目まで」は${startNumber}以上の数字を入力してください。` };
    }

    return { startPosition: startNumber, endPosition: endNumber };
}

export function App() {
    // ===== ① 入力(ターミナル版のrl.questionにあたる部分) =====
    const [playlistUrl, setPlaylistUrl] = useState("");
    const [fetchAll, setFetchAll] = useState(true);
    const [startInput, setStartInput] = useState("1");
    const [endInput, setEndInput] = useState("10");

    // ===== 取ってきた結果と、画面に出す知らせ =====
    const [videos, setVideos] = useState<PlaylistVideo[]>([]);
    //一覧の先頭が再生リストの何番目だったか(連番の表示に使う)
    const [firstPosition, setFirstPosition] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    //APIキーが無いと何もできないので、その案内だけ出して終わり
    if (!apiKey) {
        return (
            <main className="app">
                <h1>Linkr</h1>
                <p className="message">.env に VITE_YOUTUBE_API_KEY がありません。</p>
            </main>
        );
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        setMessage(null);
        setVideos([]);
        setIsCopied(false);

        //入力された文字から再生リストIDを取り出す
        const playlistId = extractPlaylistId(playlistUrl);
        if (!playlistId) {
            setMessage("再生リストのURLではありません。");
            return;
        }

        //全部モードなら1番目から、終わりまで(endPositionは決めない)
        let startPosition = 1;
        let endPosition: number | undefined;
        if (!fetchAll) {
            const range = checkRange(startInput, endInput);
            if ("problem" in range) {
                setMessage(range.problem);
                return;
            }
            startPosition = range.startPosition;
            endPosition = range.endPosition;
        }

        setIsLoading(true);
        try {
            //URLの形は合っていても、その再生リストが実際に取れるとは限らないのでここで確かめる
            const problem = await findPlaylistProblem(apiKey, playlistId);
            if (problem) {
                setMessage(problem);
                return;
            }

            // ===== ② 取ってくる =====
            const foundVideos = await fetchPlaylistVideos(apiKey, playlistId, startPosition, endPosition);
            if (foundVideos.length === 0) {
                setMessage(fetchAll ? "再生リストに動画がありませんでした。" : "指定した範囲に動画がありませんでした。");
                return;
            }
            setVideos(foundVideos);
            setFirstPosition(startPosition);
        } catch (error) {
            //取得の途中で失敗したとき(クォータ切れ、通信断など)に、理由の1行だけ出す
            setMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setIsLoading(false);
        }
    }

    // ===== ③ コピーする(ターミナル版のpbcopyにあたる部分) =====
    async function handleCopy() {
        const text = videos.map((video) => video.url).join("\n");
        try {
            await navigator.clipboard.writeText(text);
            setIsCopied(true);
            window.setTimeout(() => setIsCopied(false), 2000);
        } catch {
            setMessage("コピーできませんでした。ブラウザの設定を確認してください。");
        }
    }

    return (
        <main className="app">
            <h1>Linkr</h1>
            <p className="lead">再生リストのURLを入れると、中の動画のURLをまとめてコピーできます。</p>

            <form className="form" onSubmit={handleSubmit}>
                <label className="field">
                    <span className="field-label">再生リストのURL</span>
                    <input
                        type="text"
                        value={playlistUrl}
                        onChange={(event) => setPlaylistUrl(event.target.value)}
                        placeholder="https://www.youtube.com/playlist?list=..."
                        autoFocus
                    />
                </label>

                <label className="checkbox">
                    <input
                        type="checkbox"
                        checked={fetchAll}
                        onChange={(event) => setFetchAll(event.target.checked)}
                    />
                    <span>全部取得</span>
                </label>

                {/* チェックを外したときだけ、何番目から何番目までを聞く */}
                {!fetchAll && (
                    <div className="range">
                        <label className="field field-narrow">
                            <span className="field-label">何番目から</span>
                            <input
                                type="number"
                                min="1"
                                value={startInput}
                                onChange={(event) => setStartInput(event.target.value)}
                            />
                        </label>
                        <label className="field field-narrow">
                            <span className="field-label">何番目まで</span>
                            <input
                                type="number"
                                min="1"
                                value={endInput}
                                onChange={(event) => setEndInput(event.target.value)}
                            />
                        </label>
                    </div>
                )}

                <button type="submit" disabled={isLoading}>
                    {isLoading ? "取得中…" : "取得"}
                </button>
            </form>

            {message && <p className="message">{message}</p>}

            {videos.length > 0 && (
                <section className="result">
                    <div className="result-header">
                        <span>{videos.length}件</span>
                        <button type="button" onClick={handleCopy}>
                            {isCopied ? "コピーしました" : "全部コピー"}
                        </button>
                    </div>

                    <ol className="video-list">
                        {videos.map((video, index) => (
                            <li key={video.videoId} className="video">
                                {/* 再生リストの中で何番目かを出す(範囲指定を決めるときの目印になる) */}
                                <span className="video-index">{firstPosition + index}</span>
                                {video.thumbnailUrl ? (
                                    <img className="thumbnail" src={video.thumbnailUrl} alt="" loading="lazy" />
                                ) : (
                                    <div className="thumbnail thumbnail-empty" />
                                )}
                                <div className="video-text">
                                    <a href={video.url} target="_blank" rel="noreferrer">
                                        {video.title}
                                    </a>
                                    <span className="video-url">{video.url}</span>
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </main>
    );
}
