/**
 * Render docs/*.md into site/docs/*.html.
 *
 *   npm run build:site
 *
 * The output is committed, so `site/` is servable as plain static files with
 * no build step — which is what makes it deployable anywhere. Re-run this
 * after editing anything in docs/.
 *
 * Links between documents are rewritten as they are rendered: a doc that says
 * `[architecture.md](./architecture.md)` becomes a link to the generated
 * page, and one that points up out of docs/ becomes a link to GitHub, because
 * the repository is not on the site.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { marked } from 'marked';

const REPO = 'https://github.com/acathon/retor-engine/blob/main';
const DOCS = 'docs';
const OUT = 'site/docs';

/** Order and grouping for the sidebar; anything unlisted lands in "More". */
const SECTIONS = [
  {
    title: 'START HERE',
    pages: ['getting-started', 'first-game'],
  },
  {
    title: 'TUTORIALS',
    pages: ['tutorial-bounce', 'tutorial-bounce-3d', 'tutorial-cards', 'tutorial-trex'],
  },
  {
    title: 'REFERENCE',
    pages: ['architecture', 'contributing'],
  },
];

/** Prettier titles than the filename, where the filename is unhelpful. */
const TITLES = {
  'getting-started': 'Getting started',
  'first-game': 'Your first game',
  'tutorial-bounce': 'Build a physics game',
  'tutorial-bounce-3d': 'Build a first-person game',
  'tutorial-cards': 'Build a card game',
  'tutorial-trex': 'Walkthrough: T-Rex Runner',
  architecture: 'Architecture',
  contributing: 'Contributing',
  README: 'Documentation hub',
};

const titleFor = (slug) => TITLES[slug] ?? slug.replace(/-/g, ' ');

/**
 * Rewrite a markdown link for the site.
 *
 * `./architecture.md` and `../examples/foo` mean different things once the
 * page is on a website: the first has a generated sibling, the second only
 * exists in the repository.
 */
function rewriteHref(href) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;

  const [path, hash = ''] = href.split('#');
  const anchor = hash ? `#${hash}` : '';

  // A sibling document inside docs/.
  const sibling = path.match(/^\.\/?([\w.-]+)\.md$/);
  if (sibling) {
    const slug = sibling[1];
    return `${slug === 'README' ? '../docs.html' : `./${slug}.html`}${anchor}`;
  }

  // Anything reaching out of docs/ lives in the repository, not on the site.
  if (path.startsWith('../') || path.startsWith('/')) {
    return `${REPO}/${path.replace(/^(\.\.\/)+/, '')}${anchor}`;
  }
  return href;
}

const renderer = new marked.Renderer();
const baseLink = renderer.link.bind(renderer);
renderer.link = (token) => baseLink({ ...token, href: rewriteHref(token.href) });

marked.setOptions({ renderer, mangle: false, headerIds: true });

/** The sidebar, with the current page marked. */
function sidebar(current) {
  const known = new Set(SECTIONS.flatMap((s) => s.pages));
  const extras = readdirSync(DOCS)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
    .filter((slug) => slug !== 'README' && !known.has(slug));

  const groups = extras.length
    ? [...SECTIONS, { title: 'MORE', pages: extras }]
    : SECTIONS;

  return groups
    .map(({ title, pages }) => {
      const links = pages
        .map((slug) => {
          const mark = slug === current ? ' aria-current="page"' : '';
          return `        <a href="./${slug}.html"${mark}>${titleFor(slug)}</a>`;
        })
        .join('\n');
      return `        <h4>${title}</h4>\n${links}`;
    })
    .join('\n');
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function page(slug, body) {
  const title = titleFor(slug);
  return `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escape(title)} — Cathode docs</title>
  <link rel="stylesheet" href="../assets/style.css" />
</head>

<body>
  <nav class="nav">
    <div class="wrap">
      <a class="brand" href="../index.html">CATHODE <span>ENGINE</span></a>
      <a href="../index.html">Overview</a>
      <a href="../games.html">Games</a>
      <a href="../docs.html" aria-current="page">Docs</a>
      <a href="https://github.com/acathon/retor-engine">GitHub</a>
    </div>
  </nav>

  <div class="wrap doc-layout">
    <aside class="doc-nav">
${sidebar(slug)}
    </aside>

    <article class="prose">
${body}
      <p class="doc-foot">
        Edit this page: <a href="${REPO}/docs/${slug}.md">docs/${slug}.md</a>
      </p>
    </article>
  </div>

  <footer>
    <div class="wrap">
      <p>Cathode · <a href="https://github.com/acathon/retor-engine">github.com/acathon/retor-engine</a></p>
    </div>
  </footer>
</body>

</html>
`;
}

mkdirSync(OUT, { recursive: true });

const slugs = readdirSync(DOCS)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => basename(f, '.md'));

for (const slug of slugs) {
  const md = readFileSync(join(DOCS, `${slug}.md`), 'utf8');
  writeFileSync(join(OUT, `${slug}.html`), page(slug, marked.parse(md)));
  console.log(`  docs/${slug}.md -> site/docs/${slug}.html`);
}

console.log(`\n${slugs.length} pages written to ${OUT}/`);
