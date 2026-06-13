import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { getMainWindow } from "./window";
import { sendToRenderer } from "./window";

type HelpGuideKind = "host" | "guest";

const GUIDE_TITLES: Record<HelpGuideKind, string> = {
  host: "ホストの使い方",
  guest: "ゲストの使い方",
};

const GUIDE_SECTIONS: Record<HelpGuideKind, Array<{ heading: string; items: string[] }>> = {
  host: [
    {
      heading: "開始前",
      items: [
        "ホストとして開始したら、共有する画面またはアプリを選びます。",
        "画質は従来プリセットか適応モードを選択できます。前回使った共有ソースと画質設定は次回起動時に復元されます。",
        "必要なら「あいことば」を設定します。接続コード照合後に、P2P 上で追加認証されます。",
      ],
    },
    {
      heading: "セッション中",
      items: [
        "ゲストが接続したら、下部パネルの「操作を許可」で操作権限を渡します。",
        "必要に応じて「一時停止」または「操作権限を取り消す」で即座に操作を止められます。",
        "アプリ共有中は、共有対象アプリを前面に出しておくとホイールやキー入力が安定します。",
        "注釈とゲストカーソルは共有ディスプレイ上の透明オーバーレイに投影されます。",
      ],
    },
    {
      heading: "ショートカット",
      items: [
        "Windows: Ctrl+Alt+P で一時停止、Ctrl+Alt+Escape で権限取り消し、Ctrl+Alt+Shift+Q でセッション終了です。",
        "macOS: Command+Control+P で一時停止、Command+Control+R で権限取り消し、Command+Control+Shift+Q でセッション終了です。",
      ],
    },
    {
      heading: "macOS の注意",
      items: [
        "初回は「画面収録」と「アクセシビリティ」の許可が必要です。未許可だと共有やリモート入力が動作しません。",
        "ゲストへ渡すのは接続コードだけです。あいことばを設定した場合でも、値そのものはシグナリングサーバーへ送信されません。",
      ],
    },
  ],
  guest: [
    {
      heading: "接続手順",
      items: [
        "ゲストとして参加したら、接続コードを入力して接続します。",
        "ホストが「あいことば」を設定している場合は、コード照合後に追加入力欄が表示されます。",
        "接続完了後、リモート画面を左クリックすると操作権限を取得します。",
      ],
    },
    {
      heading: "表示と移動",
      items: [
        "「フィット」は表示領域に合わせて自動拡大縮小します。",
        "「等倍」はホスト解像度を保ったまま表示します。余白がある場合は中央に配置されます。",
        "「等倍」で映像が表示領域より大きい場合は、右ドラッグで見たい位置へパンできます。",
        "ホイール方向はツールバーの「ホイール: Windows / Mac」で切り替えられ、設定は保存されます。",
      ],
    },
    {
      heading: "操作と注釈",
      items: [
        "操作権限中はマウス、ホイール、キーボード入力がホストへ送信されます。",
        "マーカーを ON にすると描画モードになり、色変更時にも自動でマーカーモードへ入ります。",
        "Undo で直前の線を消せます。ESC 1回で全削除、短時間でESC 2回ならマーカーモードを終了します。",
        "日本語入力切替は物理キーの状態を優先して送信します。JIS キーボードのかな / 英数キーにも対応します。",
      ],
    },
    {
      heading: "全画面",
      items: [
        "「全画面」でヘッダなし表示になります。",
        "全画面終了は ESC を素早く 2 回です。1回目の ESC はローカル終了待ちとして保持されます。",
      ],
    },
    {
      heading: "macOS の注意",
      items: [
        "macOS でリモート操作を行う場合も「アクセシビリティ」許可が必要です。",
        "ローカルの PairPair メニューは、Command 系ショートカットがリモート操作と衝突しないよう最小構成にしてあります。",
      ],
    },
  ],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function buildGuideHtml(kind: HelpGuideKind): string {
  const title = GUIDE_TITLES[kind];
  const sections = GUIDE_SECTIONS[kind]
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.heading)}</h2>
          <ul>
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </section>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
  <html lang="ja">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #0b1020;
          --panel: #16213e;
          --line: rgba(255,255,255,0.12);
          --text: #eef4ff;
          --muted: #a3b5d8;
          --accent: #4cc9f0;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif;
          background:
            radial-gradient(circle at top left, rgba(76, 201, 240, 0.18), transparent 28%),
            linear-gradient(180deg, #0d1326 0%, var(--bg) 100%);
          color: var(--text);
        }
        main {
          max-width: 920px;
          margin: 0 auto;
          padding: 32px 28px 40px;
        }
        h1 {
          margin: 0 0 10px;
          font-size: 30px;
        }
        p.lead {
          margin: 0 0 24px;
          color: var(--muted);
          line-height: 1.7;
        }
        section {
          background: rgba(22, 33, 62, 0.92);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 18px 20px;
          margin-bottom: 16px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
        }
        h2 {
          margin: 0 0 10px;
          font-size: 18px;
          color: var(--accent);
        }
        ul {
          margin: 0;
          padding-left: 22px;
        }
        li {
          color: var(--text);
          line-height: 1.75;
          margin-bottom: 6px;
        }
        footer {
          margin-top: 20px;
          color: var(--muted);
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <main>
        <h1>${escapeHtml(title)}</h1>
        <p class="lead">PairPair の実装済み挙動に合わせた操作ガイドです。接続、表示モード、注釈、ショートカット、macOS 固有の注意点まで含めています。</p>
        ${sections}
        <footer>更新日: 2026-06-13</footer>
      </main>
    </body>
  </html>`;
}

function openGuideWindow(kind: HelpGuideKind): void {
  const parent = BrowserWindow.getFocusedWindow() ?? getMainWindow();
  const win = new BrowserWindow({
    parent,
    width: 900,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: `PairPair ヘルプ - ${GUIDE_TITLES[kind]}`,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  void win.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(buildGuideHtml(kind))}`);
}

export function setupApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about", label: "PairPair について" },
        { type: "separator" },
        {
          label: "終了",
          click: () => app.quit(),
        },
      ],
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "ホストの使い方",
          click: () => openGuideWindow("host"),
        },
        {
          label: "ゲストの使い方",
          click: () => openGuideWindow("guest"),
        },
      ],
    },
    {
      label: "役割切替",
      submenu: [
        {
          label: "自分をホストに切り替え",
          click: () => sendToRenderer("session:promote-guest-to-host"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
