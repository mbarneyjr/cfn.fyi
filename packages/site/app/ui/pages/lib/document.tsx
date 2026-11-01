import { css, type Handle, type RemixNode } from 'remix/component';
import { ImportMap } from 'remix/component/server';
import { assets } from '#app/assets.ts';
import { Footer } from '#app/ui/public/footer.tsx';
import { Navbar } from '#app/ui/public/navbar.tsx';
import { layout, space } from '#app/ui/public/styles.ts';

const scriptEntry = await assets.getScriptEntry('app/ui/public/entry.ts');

const origin = 'https://cfn.fyi';

export interface DocumentProps {
  children?: RemixNode;
  title?: string;
  description: string;
  path: string;
}

const resetCssHref = await assets.getHref('app/ui/public/reset.css');
const fontsCssHref = await assets.getHref('app/ui/public/fonts.css');
const themeCssHref = await assets.getHref('app/ui/public/theme.css');
const faviconHref = await assets.getHref('app/ui/public/favicon.svg');
const fontHrefs = await Promise.all(
  ['Regular', 'Bold', 'Italic'].map((style) => assets.getHref(`app/ui/public/fonts/IoskeleyMono-${style}.woff2`)),
);

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    const { children, title = 'cfn.fyi', description, path } = handle.props;
    const { href, importMap, preloads } = scriptEntry;
    return (
      <html lang="en-US" data-rmx-preserve-attrs="data-theme">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <script>
            {`try{const t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch{}`}
          </script>
          <title>{title}</title>
          <meta name="description" content={description} />
          <meta property="og:type" content="website" />
          <meta property="og:locale" content="en_US" />
          <meta property="og:site_name" content="cfn.fyi" />
          <link rel="canonical" href={`${origin}${path}`} />
          <meta property="og:url" content={`${origin}${path}`} />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:site" content="@mbarneyjr" />
          <meta name="twitter:creator" content="@mbarneyjr" />
          <link rel="icon" type="image/svg+xml" href={faviconHref} />
          <ImportMap value={importMap} />
          {preloads.map((preloadHref) => (
            <link key={preloadHref} rel="modulepreload" href={preloadHref} />
          ))}
          <script type="module" src={href}></script>

          {fontHrefs.map((fontHref) => (
            <link key={fontHref} rel="preload" href={fontHref} as="font" type="font/woff2" crossOrigin="anonymous" />
          ))}
          <link rel="stylesheet" href={resetCssHref} />
          <link rel="stylesheet" href={fontsCssHref} />
          <link rel="stylesheet" href={themeCssHref} />
        </head>
        <body mix={css({ display: 'grid', gridTemplateRows: 'auto 1fr auto', gridTemplateColumns: 'minmax(0, 1fr)' })}>
          <header>
            <Navbar />
          </header>
          <main mix={[layout.container, layout.stack, space.gap5, space.padBlock4]}>{children}</main>
          <Footer />
        </body>
      </html>
    );
  };
}
