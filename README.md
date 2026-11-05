# grok-sandbox

丘芽美湖の試作場。Grok と一緒に、空巡りの続きをここで試す。

公開している展示は [空巡り](https://mikookame.github.io/game-gallery/)。

- 羽結び
- 風渡り
- ほしつなぎ
- 音綴り

ここは未公開の下書き用。仕上がったものは、それぞれのリポジトリに置く。

## 墨鳥

テクスチャなしの鳥モデルを、墨絵の陰影で眺めるビューア。Three.js。アニメーションは28クリップ。

```bash
npm install
npm run dev
```

ブラウザで http://127.0.0.1:8080/ 。

`public/bird.glb` と `public/og.jpg` はバイナリなので、リポジトリには `public/encoded/` の分割 base64 を置いている。`npm install` が `scripts/unpack-assets.mjs` を走らせて元のファイルに戻す。
