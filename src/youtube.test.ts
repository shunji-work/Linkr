// ネットにつながなくても確かめられる部分だけのテスト
// 実行: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPlaylistId } from "./youtube";

test("再生リストのURLからIDを取り出せる", () => {
    assert.equal(
        extractPlaylistId("https://www.youtube.com/playlist?list=PLtest123"),
        "PLtest123"
    );
});

test("動画ページのURLでも list= が付いていれば取り出せる", () => {
    assert.equal(
        extractPlaylistId("https://www.youtube.com/watch?v=abc&list=PLtest123&index=3"),
        "PLtest123"
    );
});

test("URLの形になっていない文字列はnull", () => {
    assert.equal(extractPlaylistId("さくら"), null);
});

test("list= が付いていないURLはnull", () => {
    assert.equal(extractPlaylistId("https://www.youtube.com/watch?v=abc"), null);
});
