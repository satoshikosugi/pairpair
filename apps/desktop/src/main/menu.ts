import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import log from "electron-log";
import { getMainWindow } from "./window";
import { sendToRenderer } from "./window";

type HelpGuideKind = "host" | "guest";
type MenuRole = "host" | "guest" | null;
let currentMenuRole: MenuRole = null;

const GUIDE_TITLES: Record<HelpGuideKind, string> = {
  host: "ホストの使い方",
  guest: "ゲストの使い方",
};

const GUIDE_SECTIONS: Record<HelpGuideKind, Array<{ heading: string; items: string[] }>> = {
  host: [
    {
      heading: "開始前",
      items: [
        "ホストとして開始したら、共有する画面またはアプリを選びます。画面共有とアプリ共有のどちらにも対応しています。",
        "画質はプリセットまたは適応モードから選べます。直前の共有ソースや設定は次回の初期値として復元されます。",
        "必要なら「あいことば」を設定します。接続コード照合後に追加認証され、値そのものはシグナリングサーバーへ送信されません。",
        "「直前のセッション」から前回に近い条件で新しいセッションを作り直せます。",
      ],
    },
    {
      heading: "セッション中",
      items: [
        "ゲスト接続後は下部パネルから操作を許可し、権限プリセットで許可範囲を即時に切り替えられます。",
        "一時停止、権限取り消し、セッション終了はいつでも実行できます。",
        "共有中でも共有元の切り替え、画質変更、統計表示の切り替えができます。",
        "注釈、ゲストカーソル、注目スポットは共有中の画面上へ重ねて表示されます。",
        "アプリ共有では、共有対象アプリを前面に出しておくと入力が安定します。",
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
        "メニューはリモート操作中の Command 系ショートカットと衝突しにくい最小構成です。",
      ],
    },
  ],
  guest: [
    {
      heading: "接続手順",
      items: [
        "ゲストとして参加したら、接続コードを入力して接続します。",
        "ホストが「あいことば」を設定している場合は、コード照合後に追加入力欄が表示されます。",
        "接続後、リモート画面を左クリックすると操作権限を取得します。マーカーモード中はクリックしても操作を奪いません。",
        "下部パネルには現在の権限プリセットと各操作の許可状態が表示されます。",
      ],
    },
    {
      heading: "表示と移動",
      items: [
        "「フィット」は表示領域に合わせて自動拡大縮小します。",
        "「等倍」はホスト解像度を保ったまま表示します。余白がある場合は中央に配置されます。",
        "「等倍」で映像が表示領域より大きい場合は、右ドラッグで見たい位置へパンできます。",
        "Ctrl + 右クリックで「ここを見て」を送ると、相手に注目位置を短時間ハイライト表示できます。",
        "ホイール方向はツールバーの「ホイール: Windows / Mac」で切り替えられ、設定は保存されます。",
      ],
    },
    {
      heading: "操作と注釈",
      items: [
        "操作権限中は、許可されているマウス / ホイール / キーボード / クリップボード操作だけがホストへ送信されます。",
        "クリップボード権限が有効なときは、送る / 貼り付け / 受け取ると履歴が使えます。",
        "マーカーを ON にすると描画モードになります。Undo で直前の線を戻せます。",
        "ESC 1回で描画を全削除し、短時間で ESC 2回ならマーカーモードを終了します。",
        "日本語入力切替は物理キーの状態を優先して送信します。",
      ],
    },
    {
      heading: "全画面と役割切替",
      items: [
        "「全画面」でヘッダなし表示になります。",
        "全画面終了は ESC を素早く 2 回です。1回目の ESC はローカル終了待ちとして保持されます。",
        "メニューの「役割切替」から、自分をホストに切り替えて画面共有を始められます。",
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
        <p class="lead">PairPair の現在の実装に合わせた概要ガイドです。画面上で説明している細かな操作は省略し、権限、表示、注釈、全画面、役割切替などの要点だけをまとめています。</p>
        ${sections}
        <footer>更新日: 2026-06-14</footer>
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

function openMainWindowDevTools(): void {
  const win = BrowserWindow.getFocusedWindow() ?? getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.openDevTools({ mode: "detach" });
}

export function setupApplicationMenu(role: MenuRole = null): void {
  currentMenuRole = role;
  log.info(`[Menu] setupApplicationMenu called: role=${String(role)}`);
  const helpSubmenu: MenuItemConstructorOptions[] = [
    {
      label: "ホストの使い方",
      click: () => openGuideWindow("host"),
    },
    {
      label: "ゲストの使い方",
      click: () => openGuideWindow("guest"),
    },
    { type: "separator" },
    {
      label: "DevTools を表示",
      click: () => openMainWindowDevTools(),
    },
  ];

  const template: MenuItemConstructorOptions[] = process.platform === "darwin"
    ? [
      {
        role: "appMenu",
        label: app.name,
        submenu: [
          { role: "about", label: "PairPair について" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide", label: "PairPair を隠す" },
          { role: "hideOthers", label: "ほかを隠す" },
          { role: "unhide", label: "すべて表示" },
          { type: "separator" },
          { role: "quit", label: "PairPair を終了" },
        ],
      },
      {
        label: "ウインドウ",
        role: "windowMenu",
      },
      {
        label: "ヘルプ",
        role: "help",
        submenu: helpSubmenu,
      },
    ]
    : [
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
        submenu: helpSubmenu,
      },
    ];

  if (role === "guest") {
    template.splice(1, 0, {
      label: "役割切替",
      submenu: [
        {
          label: "自分をホストに切り替え",
          click: () => sendToRenderer("session:promote-guest-to-host"),
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  log.info(`[Menu] Application menu set: items=[${template.map((t) => String(t.label)).join(", ")}]`);
}

export function refreshApplicationMenu(): void {
  setupApplicationMenu(currentMenuRole);
}
