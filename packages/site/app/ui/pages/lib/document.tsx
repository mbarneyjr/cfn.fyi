import { css, type Handle, type RemixNode } from 'remix/component';
import { ImportMap } from 'remix/component/server';
import { assets } from '#app/assets.ts';
import { routes } from '#app/routes.ts';
import { Footer } from '#app/ui/public/footer.tsx';
import { Navbar } from '#app/ui/public/navbar.tsx';
import { layout, space } from '#app/ui/public/styles.ts';
import { themeCss, tokens } from '#app/ui/public/tokens.ts';

const scriptEntry = await assets.getScriptEntry('app/ui/public/entry.ts');

export const origin = 'https://cfn.fyi';

export interface DocumentProps {
  children?: RemixNode;
  title?: string;
  description: string;
  path: string;
  noindex?: boolean;
  page?: { headline: string; description: string; datePublished?: string };
}

const resetCssHref = await assets.getHref('app/ui/public/reset.css');
const fontsCssHref = await assets.getHref('app/ui/public/fonts.css');
const themeCssHref = await assets.getHref('app/ui/public/theme.css');
const faviconHref = await assets.getHref('app/ui/public/favicon.svg');
const ogImageHref = await assets.getHref('app/ui/public/og.png');
const appleTouchIconHref = await assets.getHref('app/ui/public/apple-touch-icon.png');
const fontHrefs = await Promise.all(
  ['Regular', 'Bold', 'Italic'].map((style) => assets.getHref(`app/ui/public/fonts/IoskeleyMono-${style}.woff2`)),
);

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    const { children, title = 'cfn.fyi', description, path, noindex, page } = handle.props;
    const structuredData = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', '@id': `${origin}/#website`, url: origin, name: 'cfn.fyi', inLanguage: 'en-US' },
        ...(page
          ? [{ ...page, '@type': 'TechArticle', url: `${origin}${path}`, isPartOf: { '@id': `${origin}/#website` } }]
          : []),
      ],
    };
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
          <meta
            name="robots"
            content={noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1'}
          />
          <meta name="theme-color" content={tokens.color.background.light} media="(prefers-color-scheme: light)" />
          <meta name="theme-color" content={tokens.color.background.dark} media="(prefers-color-scheme: dark)" />
          <meta property="og:type" content="website" />
          <meta property="og:locale" content="en_US" />
          <meta property="og:site_name" content="cfn.fyi" />
          <link rel="canonical" href={`${origin}${path}`} />
          <meta property="og:url" content={`${origin}${path}`} />
          <meta property="og:title" content={title} />
          <meta property="og:description" content={description} />
          <meta property="og:image" content={`${origin}${ogImageHref}`} />
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content="cfn.fyi, CloudFormation Changelog" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content={`${origin}${ogImageHref}`} />
          <meta name="twitter:image:alt" content="cfn.fyi, CloudFormation Changelog" />
          <meta name="twitter:site" content="@mbarneyjr" />
          <meta name="twitter:creator" content="@mbarneyjr" />
          <link rel="icon" type="image/svg+xml" href={faviconHref} />
          <link rel="apple-touch-icon" href={appleTouchIconHref} />
          <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
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
          <style>{themeCss}</style>
          <link rel="stylesheet" href={themeCssHref} />
        </head>
        <body mix={css({ display: 'grid', gridTemplateRows: 'auto 1fr auto', gridTemplateColumns: 'minmax(0, 1fr)' })}>
          <header>
            <Navbar resources={path.startsWith(routes.resources.href())} />
          </header>
          <main mix={[layout.container, layout.stack, space.gap5, space.padBlock4]}>{children}</main>
          <Footer />
        </body>
      </html>
    );
  };
}
