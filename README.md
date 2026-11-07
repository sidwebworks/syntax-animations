![Banner](https://github.com/sidwebworks/syntax-animated/blob/main/public/og_preview.png)

# 🎥 Syntax Animations

Turn your code into animated videos for social media, tutorials, or documentation — with style.

Unlike plain screen recordings, Syntax Animations works by creating slides for each step of your code. You decide how your snippet evolves — adding lines, refactoring, or changing variables — and the app smoothly animates the transitions between those slides.

The result? Beautiful, intentional animations that are clear, educational, and fun to watch.

## ✨ Key Features

- 📚 Slide-based code animation – break your code into steps and animate between them.

- 🌈 Supports any language – powered by TextMate grammars.

- 🎨 Custom themes – use any color theme for your code.

- 📱 Perfect for sharing – great for social media, tutorials, or classroom use.

## 🎬 Usage

- Paste or write your code.

- Create slides for each step or change.

- Preview transitions automatically between slides.

- Play and Export as video ready to share online.

👉 Try it live: https://syntax.rathi.sh

## 🛠 Development

The animation engine is written in Rust and compiled to WebAssembly. You need a Rust toolchain with the `wasm32-unknown-unknown` target to change it:

```sh
rustup target add wasm32-unknown-unknown
pnpm build:engine   # rebuilds app/lib/engine/engine.wasm
pnpm test:engine
```

The built `engine.wasm` is checked in, so `pnpm dev` works without Rust if you're only touching the app.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues, suggest features, or submit PRs.
