# Element → VS Code transcript search

Element's original `BaseHighlighter` and `HtmlHighlighter` classes power a native local transcript-search window in a separate VS Code copy. Yoinkr supplies the file loader, filtering, permissions and native host. It does not transfer the full Element interface or connect to Matrix.

Install root dependencies with `npm ci`, then use explicitly supplied destinations and a supported unmodified VS Code runtime:

```sh
npm run acquire:example-sources -- element-search /path/to/element-inputs
npm run build:element-example -- /path/to/element-inputs /path/to/code /path/to/element-demo
```

Launch the generated recipient using its launcher; open **Yoinkr messages → Open Element message search**. Search the supplied synthetic transcript or open a local JSON transcript of your own.

[Complete setup, input format, rollback and native verification](../../docs/CREATOR_EXAMPLES.md). [Pinned recovery recipe](../../recipes/element-search/recovery.json).

Twelve scoped Linux native checks were run during development. Full original Element baseline, live Matrix and Windows/macOS remain unverified. The pinned source explicitly offers AGPL-3.0-only OR GPL-3.0-only OR a commercial license. This example selects the GPL-3.0-only alternative and retains the complete copyright header, original files and both acquired open-source license texts; keep the notices and corresponding source when distributing derived output. Generated application copies are not tracked in Git.
