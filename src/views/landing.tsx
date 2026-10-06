import type { FC } from "hono/jsx";
import { type Locale, t } from "../lib/i18n";
import { Flash, Layout, type PageContext, REPO_URL } from "./layout";

export const EmailForm: FC<{ locale: Locale; id: string; value?: string; error?: string }> = ({ locale, id, value, error }) => {
  const m = t(locale).auth;
  return (
    <form method="post" action="/login" class="flex flex-col gap-2" data-pending-form>
      <label for={id} class="text-sm font-semibold">
        {m.email}
      </label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="email"
          type="email"
          required
          autocomplete="email"
          inputmode="email"
          placeholder={m.emailPlaceholder}
          value={value}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          class="field sm:max-w-xs"
        />
        <button type="submit" class="btn">
          {m.send}
        </button>
      </div>
      {error && (
        <div id={`${id}-error`}>
          <Flash kind="error">{error}</Flash>
        </div>
      )}
    </form>
  );
};

// The demo week: which day, which source calendar and which title each sample event has.
const DEMO_EVENTS = [
  { day: 0, cal: 0, title: 0, time: "9:30" },
  { day: 1, cal: 1, title: 1, time: "12:00" },
  { day: 2, cal: 1, title: 2, time: "19:00" },
  { day: 3, cal: 2, title: 3, time: "20:30" },
  { day: 4, cal: 0, title: 4, time: "7:15" },
];
const CAL_BG = ["bg-cal-1", "bg-cal-2", "bg-cal-3"];
const CAL_BORDER = ["border-cal-1", "border-cal-2", "border-cal-3"];

const Demo: FC<{ locale: Locale; now: number }> = ({ locale, now }) => {
  const d = t(locale).landing.demo;
  const today = new Date(now);
  const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ((today.getUTCDay() + 6) % 7)));
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86_400_000));
  const todayIndex = (today.getUTCDay() + 6) % 7;
  const grid = "grid grid-cols-[5.75rem_repeat(7,minmax(0,1fr))] gap-x-1.5";
  const cells = (render: (day: number) => unknown) => days.map((_, day) => <div class="min-h-9 py-1">{render(day) as never}</div>);

  return (
    <figure class="overflow-x-auto" aria-label={d.label}>
      <div class="min-w-[31rem] rounded-xl border border-line bg-white p-4 sm:p-5" aria-hidden="true">
        <div class={`${grid} items-end border-b border-line pb-3`}>
          <div />
          {days.map((date, i) => (
            <div class={i === todayIndex ? "text-ink" : "text-ink-soft"}>
              <div class="text-xs font-semibold">{d.days[i]}</div>
              <div class="text-3xl leading-none font-extrabold tabular-nums">{date.getUTCDate()}</div>
            </div>
          ))}
        </div>

        <div class="py-2">
          {d.sources.map((name, cal) => (
            <div class={`${grid} items-center`}>
              <div class="flex items-center gap-2 text-xs font-semibold">
                <span class={`size-2.5 rounded-sm ${CAL_BG[cal]}`} />
                {name}
              </div>
              {cells((day) =>
                DEMO_EVENTS.filter((e) => e.day === day && e.cal === cal).map((e) => (
                  <div class={`truncate rounded-sm px-1.5 py-1 text-xs font-semibold text-white ${CAL_BG[cal]}`}>{d.events[e.title]}</div>
                )),
              )}
            </div>
          ))}
        </div>

        <div class="border-t-2 border-ink pt-2">
          <div class={`${grid} demo-merge items-center`}>
            <div class="text-xs font-bold" style="--i:0">
              {d.full}
            </div>
            {cells((day) =>
              DEMO_EVENTS.filter((e) => e.day === day).map((e) => (
                <div class={`truncate rounded-sm border border-l-4 border-line bg-white px-1.5 py-1 text-xs leading-tight font-semibold ${CAL_BORDER[e.cal]}`}>
                  {d.events[e.title]}
                  <span class="block font-medium text-ink-soft tabular-nums">{e.time}</span>
                </div>
              )),
            ).map((cell, i) => (
              <div style={`--i:${i + 1}`}>{cell}</div>
            ))}
          </div>
          <div class={`${grid} demo-merge items-center`}>
            <div class="text-xs font-bold" style="--i:3">
              {d.busy}
            </div>
            {cells((day) =>
              DEMO_EVENTS.filter((e) => e.day === day).map(() => (
                <div class="hatch flex h-[2.4rem] items-center overflow-hidden rounded-sm border border-ink/40">
                  <span class="ml-1 hidden truncate rounded-sm bg-white px-1 text-[0.7rem] font-bold lg:inline">{d.busyTitle}</span>
                </div>
              )),
            ).map((cell, i) => (
              <div style={`--i:${i + 4}`}>{cell}</div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
};

export const LandingPage: FC<{ ctx: PageContext; now: number }> = ({ ctx, now }) => {
  const m = t(ctx.locale).landing;
  return (
    <Layout ctx={ctx}>
      <section class="mx-auto grid max-w-7xl items-center gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:pt-16">
        <div class="flex max-w-xl flex-col gap-6">
          <h1 class="text-5xl leading-[1.02] font-extrabold tracking-tight text-balance sm:text-6xl">{m.title}</h1>
          <p class="text-lg leading-relaxed text-ink-soft">{m.lead}</p>
          <EmailForm locale={ctx.locale} id="email-hero" />
          <p class="text-sm text-ink-soft">{m.emailNote}</p>
        </div>
        <Demo locale={ctx.locale} now={now} />
      </section>

      <section class="border-t border-line bg-white">
        <div class="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <h2 class="text-3xl font-extrabold tracking-tight">{m.howTitle}</h2>
          <ol class="mt-10 grid gap-10 md:grid-cols-3">
            {m.steps.map((step, i) => (
              <li class="flex gap-5">
                <span class="text-6xl leading-none font-extrabold text-ink/15 tabular-nums" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 class="text-lg font-bold">{step.title}</h3>
                  <p class="mt-1 leading-relaxed text-ink-soft">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section class="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
        <div>
          <h2 class="text-3xl font-extrabold tracking-tight">{m.privacyTitle}</h2>
          <p class="mt-3 max-w-prose leading-relaxed text-ink-soft">{m.privacyText}</p>
          <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <div>
              <p class="mb-2 text-sm font-bold">{m.demo.full}</p>
              <div class="rounded-md border border-l-4 border-line border-l-cal-1 bg-white p-4">
                <p class="font-bold">{m.sampleEvent.title}</p>
                <p class="mt-2 text-sm text-ink-soft tabular-nums">{m.sampleEvent.time}</p>
                <p class="text-sm text-ink-soft">{m.sampleEvent.place}</p>
                <p class="text-sm text-ink-soft">{m.sampleEvent.people}</p>
              </div>
            </div>
            <div>
              <p class="mb-2 text-sm font-bold">{m.demo.busy}</p>
              <div class="hatch flex h-[calc(100%-1.75rem)] min-h-32 flex-col justify-between rounded-md border border-ink/40 p-4">
                <span class="self-start rounded-sm bg-white px-1.5 font-bold">{m.demo.busyTitle}</span>
                <span class="self-start rounded-sm bg-white px-1.5 text-sm font-semibold tabular-nums">{m.sampleEvent.time}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex flex-col justify-center gap-6 leading-relaxed lg:pl-8">
          <div>
            <p class="font-bold">{m.keeps}</p>
            <ul class="mt-2 list-disc pl-5 text-ink-soft">
              {m.keepsList.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <p class="font-bold">{m.hides}</p>
            <ul class="mt-2 list-disc pl-5 text-ink-soft">
              {m.hidesList.map((item) => (
                <li>{item}</li>
              ))}
            </ul>
          </div>
          <p class="text-ink-soft">{m.skips}</p>
        </div>
      </section>

      <section class="border-y border-line bg-white">
        <div class="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <h2 class="text-3xl font-extrabold tracking-tight">{m.worksTitle}</h2>
          <ul class="mt-6 flex flex-wrap gap-2">
            {m.works.map((name) => (
              <li class="rounded-md border border-line px-3 py-1.5 font-semibold">{name}</li>
            ))}
          </ul>
          <p class="mt-4 text-ink-soft">{m.worksNote}</p>
        </div>
      </section>

      <section class="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h2 class="text-3xl font-extrabold tracking-tight">{m.faqTitle}</h2>
          <div class="mt-6 divide-y divide-line border-y border-line">
            {m.faq.map((item) => (
              <details class="group py-4">
                <summary class="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                  {item.q}
                  <span class="text-xl leading-none transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p class="mt-2 max-w-prose leading-relaxed text-ink-soft">
                  {item.a}{" "}
                  {item === m.faq.at(-1) && (
                    <a class="link" href={REPO_URL}>
                      GitHub
                    </a>
                  )}
                </p>
              </details>
            ))}
          </div>
        </div>
        <div class="self-start rounded-xl bg-ink p-8 text-paper">
          <p class="text-2xl font-extrabold tracking-tight">{m.title}</p>
          <div class="mt-6 [&_.field]:border-transparent [&_.btn]:bg-paper [&_.btn]:text-ink [&_.btn:hover]:bg-white [&_label]:text-paper">
            <EmailForm locale={ctx.locale} id="email-footer" />
          </div>
        </div>
      </section>
    </Layout>
  );
};
