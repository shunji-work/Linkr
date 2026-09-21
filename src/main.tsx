// ===== React版の入口 =====
// index.html の <div id="root"> の中に App を描画するだけ

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./App.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("index.html に <div id=\"root\"> がありません。");
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>
);
