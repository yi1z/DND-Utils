This project is a statically exported [Next.js](https://nextjs.org) site.

## Run the build
To start the server, use `python -m http.server 8080 -d out` or `npx serve out`.

To access the website, open [this link](http://localhost:8080).

## Development

Before running the app, make sure the source 5echm content is available. By default the ingest script reads from `../5echm_web`. You can override that path with `SOURCE_5ECHM`.

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Build For Distribution

Create a distributable build:

```bash
npm run build
```

That command will:

- ingest content from `../5echm_web` or `SOURCE_5ECHM`
- prerender the site into static files
- write the final distributable site to `out/`

## Share It

You have two practical distribution options:

1. Zip and share `out/`
2. Upload `out/` to a static host such as GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, or any basic web server

Anyone hosting the site only needs the contents of `out/`. They do not need the source code, Node.js, or the original `5echm_web` directory.

## Notes

- `out/` is the publishable artifact
- trailing slashes are enabled, so static hosts should serve directory indexes normally
- rebuilding requires access to the source 5echm files because `npm run build` reruns the ingest step

## Deploy

For GitHub Pages, publish the `out/` directory. For a VPS or NAS, copy `out/` into the web root and serve it as a normal static site.
