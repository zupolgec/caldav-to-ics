import type { Child, FC } from "hono/jsx";
import { type Locale, LOCALES, t } from "../lib/i18n";

export const REPO_URL = "https://github.com/zupolgec/caldav-to-ics";
// Bump when public/app.css or public/app.js change, so browsers fetch the new files.
const ASSET_VERSION = "2";

export interface PageContext {
  locale: Locale;
  path: string;
  signedIn: boolean;
  /** Address of the signed-in user, shown in the header. */
  email?: string;
}

const LANGUAGE_NAMES: Record<Locale, string> = { it: "Italiano", en: "English" };

/** `fill`: the page content stretches to fill the height between header and footer. */
export const Layout: FC<{ ctx: PageContext; title?: string; fill?: boolean; children: Child }> = ({ ctx, title, fill, children }) => {
  const m = t(ctx.locale);
  return (
    <html lang={ctx.locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title ? `${title} | Calendario` : m.meta.title}</title>
        <meta name="description" content={m.meta.description} />
        <meta name="theme-color" content="#fbfbf8" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preload" href="/fonts/schibsted-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link rel="stylesheet" href={`/app.css?v=${ASSET_VERSION}`} />
        <script src={`/app.js?v=${ASSET_VERSION}`} defer />
      </head>
      <body class="flex min-h-dvh flex-col font-sans">
        <header class="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <a href={ctx.signedIn ? "/dashboard" : "/"} class="group flex shrink-0 items-baseline text-xl font-extrabold tracking-tight" aria-label="Calendario">
            <span>calendario</span>
            <span class={`font-medium text-ink-soft transition-colors group-hover:text-ink ${ctx.signedIn ? "hidden sm:inline" : ""}`}>.condividi.link</span>
          </a>
          <nav class="flex items-center gap-0 text-sm font-semibold sm:gap-3" aria-label="Menu">
            {ctx.signedIn ? (
              <>
                {ctx.email && <span class="mr-2 hidden font-medium text-ink-soft md:inline">{ctx.email}</span>}
                <NavLink href="/dashboard" current={ctx.path === "/dashboard"}>
                  {m.nav.calendars}
                </NavLink>
                <NavLink href="/settings" current={ctx.path === "/settings"}>
                  {m.nav.settings}
                </NavLink>
                <form method="post" action="/logout">
                  <button type="submit" class="rounded-md px-2 py-1.5 hover:bg-panel">
                    {m.nav.signOut}
                  </button>
                </form>
              </>
            ) : (
              ctx.path !== "/login" && (
                <NavLink href="/login" current={false}>
                  {m.nav.signIn}
                </NavLink>
              )
            )}
          </nav>
        </header>
        <main class={fill ? "flex flex-1 flex-col" : "flex-1"}>{children}</main>
        <footer class="flex flex-wrap items-center justify-between gap-4 border-t border-line px-5 py-5 text-sm text-ink-soft sm:px-8">
          <a class="link font-medium" href={REPO_URL}>
            {m.landing.source}
          </a>
          <div class="flex items-center gap-1" role="group" aria-label={m.nav.language}>
            {LOCALES.map((locale) => (
              <a
                href={`/lang/${locale}?next=${encodeURIComponent(ctx.path)}`}
                hreflang={locale}
                lang={locale}
                aria-current={locale === ctx.locale ? "true" : undefined}
                class="rounded-md px-2 py-1 font-semibold aria-[current]:bg-ink aria-[current]:text-paper hover:text-ink"
              >
                {LANGUAGE_NAMES[locale]}
              </a>
            ))}
          </div>
        </footer>
      </body>
    </html>
  );
};

const NavLink: FC<{ href: string; current: boolean; children: Child }> = ({ href, current, children }) => (
  <a href={href} aria-current={current ? "page" : undefined} class="rounded-md px-2 py-1.5 hover:bg-panel aria-[current]:underline aria-[current]:underline-offset-8">
    {children}
  </a>
);

export const Flash: FC<{ kind: "ok" | "error"; children: Child }> = ({ kind, children }) =>
  kind === "ok" ? (
    <p role="status" class="rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-sm font-medium">
      {children}
    </p>
  ) : (
    <p role="alert" class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
      {children}
    </p>
  );
