import type { FC } from "hono/jsx";
import type { SourceRow } from "../db";
import { t } from "../lib/i18n";
import { type PreviewDay, type PreviewEvent, addDays } from "../preview";
import { Layout, type PageContext } from "./layout";

const CAL_BG = ["bg-cal-1", "bg-cal-2", "bg-cal-3", "bg-cal-4", "bg-cal-5", "bg-cal-6"];
const CAL_BORDER = ["border-l-cal-1", "border-l-cal-2", "border-l-cal-3", "border-l-cal-4", "border-l-cal-5", "border-l-cal-6"];

export interface PreviewProps {
  ctx: PageContext;
  view: "full" | "busy";
  weekStart: string;
  today: string;
  tz: string;
  /** True when the timezone is a guess: the page reloads once the browser has told us. */
  tzGuessed: boolean;
  days: PreviewDay[] | null;
  sources: SourceRow[];
}

export const PreviewPage: FC<PreviewProps> = ({ ctx, view, weekStart, today, tz, tzGuessed, days, sources }) => {
  const m = t(ctx.locale).preview;
  const link = (week: string, v = view) => `/preview?week=${week}${v === "busy" ? "&view=busy" : ""}`;
  const range = new Intl.DateTimeFormat(ctx.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(
    new Date(`${weekStart}T12:00:00Z`),
    new Date(`${addDays(weekStart, 6)}T12:00:00Z`),
  ).replace(/(^|\D)0(\d)/g, "$1$2"); // some locales pad the first day ("05–11 ottobre")
  const weekday = new Intl.DateTimeFormat(ctx.locale, { weekday: "short", timeZone: "UTC" });

  return (
    <Layout ctx={ctx} title={m.title}>
      <div class="mx-auto flex max-w-7xl flex-col gap-6 px-5 pt-6 pb-16 sm:px-8" data-reload-on-tz={tzGuessed ? "" : undefined}>
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-4xl font-extrabold tracking-tight">{m.title}</h1>
            <p class="mt-2 text-ink-soft">{view === "full" ? m.introFull : m.introBusy}</p>
          </div>
          <nav class="flex rounded-lg border border-line bg-white p-1 text-sm font-semibold" aria-label={m.show}>
            {(["full", "busy"] as const).map((v) => (
              <a
                href={link(weekStart, v)}
                aria-current={v === view ? "page" : undefined}
                class="flex items-center gap-2 rounded-md px-3 py-1.5 aria-[current]:bg-ink aria-[current]:text-paper hover:bg-panel aria-[current]:hover:bg-ink"
              >
                {v === "busy" ? <span class="hatch size-3 rounded-sm border border-current" aria-hidden="true" /> : <span class="size-3 rounded-sm bg-current" aria-hidden="true" />}
                {v === "full" ? m.full : m.busy}
              </a>
            ))}
          </nav>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3">
          <h2 class="text-xl font-bold tabular-nums">{range}</h2>
          <div class="flex flex-wrap items-center gap-2">
            <a class="btn-quiet" href={link(addDays(weekStart, -7))} rel="prev" aria-label={m.previous}>
              <Chevron direction="left" />
              <span class="hidden sm:inline">{m.previous}</span>
            </a>
            <a class="btn-quiet" href={link("")}>
              {m.today}
            </a>
            <a class="btn-quiet" href={link(addDays(weekStart, 7))} rel="next" aria-label={m.next}>
              <span class="hidden sm:inline">{m.next}</span>
              <Chevron direction="right" />
            </a>
          </div>
        </div>

        {sources.length === 0 ? (
          <div class="rounded-lg border-2 border-dashed border-line p-6">
            <p class="font-bold">{t(ctx.locale).dashboard.emptyTitle}</p>
            <a class="link mt-2 inline-block" href="/dashboard">
              {m.goToCalendars}
            </a>
          </div>
        ) : !days ? (
          <p role="status" class="font-semibold">
            {m.pending}
          </p>
        ) : (
          <>
            <ol class="grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-7">
              {days.map((day) => {
                const date = new Date(`${day.date}T12:00:00Z`);
                const isToday = day.date === today;
                return (
                  <li class="flex flex-col gap-2 bg-white p-2.5 md:min-h-64" aria-current={isToday ? "date" : undefined}>
                    <div class="flex items-baseline gap-2 md:flex-col md:gap-0">
                      <span class="text-xs font-semibold text-ink-soft">{weekday.format(date)}</span>
                      <span
                        class={`text-2xl leading-none font-extrabold tabular-nums md:text-3xl ${isToday ? "-mx-1 rounded-md bg-ink px-1 text-paper" : ""}`}
                      >
                        {date.getUTCDate()}
                      </span>
                    </div>
                    {day.events.length === 0 ? (
                      <p class="-mt-1 text-sm text-ink-soft md:sr-only">{m.noEvents}</p>
                    ) : (
                      <ul class="flex flex-col gap-1.5">
                        {day.events.map((event) => (
                          <EventChip event={event} view={view} labels={m} />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
            <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
              {view === "full" ? (
                <p class="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>{m.legend}</span>
                  {sources.map((source) => (
                    <span class="flex items-center gap-1.5 font-semibold text-ink">
                      <span class={`size-2.5 rounded-sm ${CAL_BG[source.color % CAL_BG.length]}`} aria-hidden="true" />
                      {source.label}
                    </span>
                  ))}
                </p>
              ) : (
                <span />
              )}
              <p>{m.timezone(tz)}</p>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

const EventChip: FC<{ event: PreviewEvent; view: "full" | "busy"; labels: ReturnType<typeof t>["preview"] }> = ({ event, view, labels }) => {
  const when = event.allDay ? labels.allDay : event.time;
  if (view === "busy") {
    return (
      <li class="hatch flex min-h-11 flex-col items-start justify-between gap-1 rounded-sm border border-ink/40 p-1">
        <span class="rounded-sm bg-white px-1 text-xs font-bold">{event.title}</span>
        <span class="rounded-sm bg-white px-1 text-xs font-semibold tabular-nums">{when}</span>
      </li>
    );
  }
  const color = event.color ?? -1;
  const accent = color >= 0 ? CAL_BORDER[color % CAL_BORDER.length] : "border-l-ink";
  return (
    <li
      class={`rounded-sm border border-l-4 bg-white px-2 py-1 text-sm leading-snug ${accent} ${event.free ? "border-dashed border-line" : "border-line"} ${event.cancelled ? "opacity-60" : ""}`}
    >
      <span class={`line-clamp-3 font-semibold break-words ${event.cancelled ? "line-through" : ""}`}>{event.title}</span>
      <span class="block text-xs text-ink-soft tabular-nums">
        {when}
        {event.cancelled && `, ${labels.cancelled}`}
        {event.free && `, ${labels.free}`}
      </span>
    </li>
  );
};

const Chevron: FC<{ direction: "left" | "right" }> = ({ direction }) => (
  <svg viewBox="0 0 16 16" class="size-4" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d={direction === "left" ? "M10 3 5 8l5 5" : "m6 3 5 5-5 5"} />
  </svg>
);
