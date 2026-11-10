import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = new URL('.', import.meta.url);
const output = new URL('dist/', root);
const apiUrl = (process.env.API_URL || 'http://127.0.0.1:8080/graphql').trim();

if (!/^https?:\/\//i.test(apiUrl)) {
  throw new Error('API_URL precisa ser uma URL HTTP ou HTTPS absoluta.');
}

await mkdir(output, { recursive: true });
for (const entry of ['index.html', 'propostas.html', 'despesas.html', 'main.js', 'propostas.js', 'despesas.js', 'style.css', 'assets']) {
  try {
    await cp(new URL(entry, root), new URL(entry, output), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const configPath = new URL('config.js', output);
const quotedApiUrl = JSON.stringify(apiUrl).replaceAll('<', '\\u003c');
await writeFile(configPath, `window.APP_CONFIG = Object.freeze({ API_URL: ${quotedApiUrl} });\n`);

for (const page of ['index.html', 'propostas.html', 'despesas.html']) {
  const path = new URL(page, output);
  try {
    let html = await readFile(path, 'utf8');
    html = html.replace('</head>', '    <script src="config.js"></script>\n</head>');
    await writeFile(path, html);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
