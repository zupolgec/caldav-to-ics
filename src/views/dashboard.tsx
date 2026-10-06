import type { FC } from "hono/jsx";
import type { Feed, SourceRow } from "../db";
import { type Locale, relativeTime, t } from "../lib/i18n";
import { Flash, Layout, type PageContext } from "./layout";

const CAL_BG = ["bg-cal-1", "bg-cal-2", "bg-cal-3", "bg-cal-4", "bg-cal-5", "bg-cal-6"];

export interface AddForm {
  url?: string;
  username?: string;
  error?: string;
}

export interface DashboardProps {
  ctx: PageContext;
  feed: Feed;
  sources: SourceRow[];
  origin: string;
  now: number;
  flash?: string;
  form?: AddForm;
}

export const DashboardPage: FC<DashboardProps> = (props) => {
  const { ctx, feed, sources, origin, now, flash, form } = props;
  const m = t(ctx.locale).dashboard;
  const fullUrl = `${origin}/c/${feed.full_token}.ics`;
  const busyUrl = `${origin}/c/${feed.busy_token}.ics`;

  return (
    <Layout ctx={ctx} title={m.title} fill>
      <div class="grid flex-1 border-t border-line lg:grid-cols-2">
        <section class="px-5 py-10 sm:px-8 lg:py-12" aria-labelledby="calendars-title">
          <div class="mx-auto flex max-w-xl flex-col gap-6 lg:mr-12 lg:ml-auto">
            <div>
              <h1 id="calendars-title" class="text-3xl font-extrabold tracking-tight">
                {m.title}
              </h1>
              <p class="mt-2 leading-relaxed text-ink-soft">
                {m.intro}{" "}
                <button type="button" class="link" data-dialog-open="help">
                  {m.help}
                </button>
              </p>
            </div>

            {flash && <Flash kind="ok">{flash}</Flash>}

            <form method="post" action="/calendars" class="flex flex-col gap-2" data-pending-form>
              <label for="calendar-url" class="text-sm font-semibold">
                {m.url}
              </label>
              <div class="flex flex-col gap-2 sm:flex-row">
                <input
                  id="calendar-url"
                  name="url"
                  type="text"
                  inputmode="url"
                  autocomplete="off"
                  spellcheck={false}
                  required
                  placeholder={m.urlPlaceholder}
                  value={form?.url}
                  aria-invalid={form?.error ? "true" : undefined}
                  aria-describedby={form?.error ? "calendar-error" : undefined}
                  class="field"
                />
                <button type="submit" class="btn" data-pending-label={m.adding}>
                  {m.add}
                </button>
              </div>
              <details class="group" open={!!form?.username}>
                <summary class="cursor-pointer text-sm font-semibold text-ink-soft hover:text-ink">{m.needsLogin}</summary>
                <div class="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label for="calendar-username" class="text-sm font-semibold">
                      {m.username}
                    </label>
                    <input id="calendar-username" name="username" type="text" autocomplete="off" value={form?.username} class="field mt-1" />
                  </div>
                  <div>
                    <label for="calendar-password" class="text-sm font-semibold">
                      {m.password}
                    </label>
                    <input id="calendar-password" name="password" type="password" autocomplete="new-password" class="field mt-1" />
                  </div>
                  <p class="text-sm leading-relaxed text-ink-soft sm:col-span-2">{m.loginHint}</p>
                </div>
              </details>
              {form?.error && (
                <div id="calendar-error">
                  <Flash kind="error">{form.error}</Flash>
                </div>
              )}
            </form>

            {sources.length === 0 ? (
              <div class="rounded-lg border-2 border-dashed border-line p-6">
                <p class="font-bold">{m.emptyTitle}</p>
                <p class="mt-1 text-ink-soft">{m.emptyText}</p>
              </div>
            ) : (
              <ul class="divide-y divide-line border-y border-line">
                {sources.map((source) => (
                  <SourceItem source={source} locale={ctx.locale} now={now} />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section class="bg-panel px-5 py-10 sm:px-8 lg:py-12" aria-labelledby="links-title">
          <div class="mx-auto flex max-w-xl flex-col gap-8 lg:mr-auto lg:ml-12">
            <div>
              <h2 id="links-title" class="text-3xl font-extrabold tracking-tight">
                {m.linksTitle}
              </h2>
              <p class="mt-2 leading-relaxed text-ink-soft">{m.linksIntro}</p>
              <p class="mt-3 text-sm font-semibold">
                {sources.length === 0
                  ? m.noSources
                  : feed.last_success_at
                    ? m.status(relativeTime(ctx.locale, feed.last_success_at, now), m.events(feed.event_count), feed.past_days)
                    : m.pending}
              </p>
            </div>
            <LinkField id="full-url" label={m.full} hint={m.fullHint} url={fullUrl} name={feed.calendar_name} locale={ctx.locale} />
            <LinkField id="busy-url" label={m.busy} hint={m.busyHint(feed.busy_title)} url={busyUrl} name={feed.calendar_name} locale={ctx.locale} busy />
            {sources.length > 0 && (
              <a class="link self-start" href="/preview">
                {m.previewLink}
              </a>
            )}
          </div>
        </section>
      </div>
      <HelpDialog locale={ctx.locale} />
    </Layout>
  );
};

const SourceItem: FC<{ source: SourceRow; locale: Locale; now: number }> = ({ source, locale, now }) => {
  const m = t(locale).dashboard;
  return (
    <li class="flex items-start gap-3 py-4">
      <span class={`mt-1.5 size-3 shrink-0 rounded-sm ${CAL_BG[source.color % CAL_BG.length]}`} aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-bold">{source.label}</p>
        <p class="truncate text-sm text-ink-soft">{source.url_hint}</p>
        {source.last_error ? (
          <p class="mt-1 text-sm font-medium text-danger">
            {source.last_fetched_at ? m.failing(relativeTime(locale, source.last_fetched_at, now)) : m.failingNever}
          </p>
        ) : (
          source.last_fetched_at && (
            <p class="mt-1 text-sm text-ink-soft">
              <span class="font-semibold text-ink">{m.events(source.event_count ?? 0)}</span>, {m.updated(relativeTime(locale, source.last_fetched_at, now))}
            </p>
          )
        )}
      </div>
      <form method="post" action={`/calendars/${source.id}/delete`} data-confirm={m.removeConfirm(source.label)}>
        <button type="submit" class="btn-quiet">
          {m.remove}
        </button>
      </form>
    </li>
  );
};

const LinkField: FC<{ id: string; label: string; hint: string; url: string; name: string; locale: Locale; busy?: boolean }> = ({
  id,
  label,
  hint,
  url,
  name,
  locale,
  busy,
}) => {
  const m = t(locale).dashboard;
  const webcal = url.replace(/^https?:/, "webcal:");
  const subscribe = [
    { name: "Apple", href: webcal },
    { name: "Google", href: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` },
    { name: "Outlook", href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}` },
  ];
  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center gap-2">
        {busy ? <span class="hatch size-3 rounded-sm border border-ink/50" aria-hidden="true" /> : <span class="size-3 rounded-sm bg-ink" aria-hidden="true" />}
        <label for={id} class="font-bold">
          {label}
        </label>
      </div>
      <p id={`${id}-hint`} class="text-sm leading-relaxed text-ink-soft">
        {hint}
      </p>
      <div class="flex gap-2">
        <input id={id} type="text" readonly value={url} aria-describedby={`${id}-hint`} class="field min-w-0 text-sm tabular-nums" data-select-on-focus />
        <button type="button" class="btn" data-copy={id} data-copied-label={m.copied} aria-live="polite">
          {m.copy}
        </button>
      </div>
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span class="text-ink-soft">{m.openIn}</span>
        {subscribe.map((s) => (
          <a class="link" href={s.href} target={s.name === "Apple" ? undefined : "_blank"} rel="noopener noreferrer">
            {s.name}
          </a>
        ))}
      </p>
    </div>
  );
};

const HelpDialog: FC<{ locale: Locale }> = ({ locale }) => {
  const m = t(locale).helpDialog;
  return (
    <dialog
      id="help"
      aria-labelledby="help-title"
      class="m-auto max-h-[85dvh] w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-ink/40"
    >
      <div class="sticky top-0 flex items-start justify-between gap-4 border-b border-line bg-paper px-6 py-5">
        <div>
          <h2 id="help-title" class="text-2xl font-extrabold tracking-tight">
            {m.title}
          </h2>
          <p class="mt-1 text-ink-soft">{m.intro}</p>
        </div>
        <form method="dialog">
          <button type="submit" class="btn-quiet">
            {m.close}
          </button>
        </form>
      </div>
      <div class="flex flex-col gap-6 px-6 py-6">
        {m.providers.map((provider) => (
          <section>
            <h3 class="font-bold">{provider.name}</h3>
            <ol class="mt-2 list-decimal space-y-1 pl-5 leading-relaxed text-ink-soft">
              {provider.steps.map((step) => (
                <li>{step}</li>
              ))}
            </ol>
            {"note" in provider && provider.note && <p class="mt-2 text-sm leading-relaxed text-ink-soft">{provider.note}</p>}
          </section>
        ))}
      </div>
    </dialog>
  );
};
