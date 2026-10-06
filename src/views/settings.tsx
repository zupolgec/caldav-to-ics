import type { Child, FC } from "hono/jsx";
import type { Feed } from "../db";
import { t } from "../lib/i18n";
import { Flash, Layout, type PageContext } from "./layout";

export interface SettingsValues {
  calendar_name: string;
  busy_title: string;
  past_days: string;
  extra_emails: string;
}

export type SettingsErrors = Partial<Record<keyof SettingsValues, true>>;

export interface SettingsProps {
  ctx: PageContext;
  email: string;
  feed: Feed;
  values?: SettingsValues;
  errors?: SettingsErrors;
  flash?: string;
  deleteError?: string;
}

const Section: FC<{ title: string; children: Child }> = ({ title, children }) => (
  <section class="grid gap-6 border-t border-line py-10 md:grid-cols-[14rem_minmax(0,1fr)]">
    <h2 class="text-xl font-extrabold tracking-tight">{title}</h2>
    <div class="flex max-w-xl flex-col gap-5">{children}</div>
  </section>
);

const Field: FC<{ id: keyof SettingsValues; label: string; hint?: string; invalid?: boolean; children: Child }> = ({ id, label, hint, invalid, children }) => (
  <div class="flex flex-col gap-1">
    <label for={id} class={`text-sm font-semibold ${invalid ? "text-danger" : ""}`}>
      {label}
    </label>
    {children}
    {hint && (
      <p id={`${id}-hint`} class="text-sm leading-relaxed text-ink-soft">
        {hint}
      </p>
    )}
  </div>
);

export const SettingsPage: FC<SettingsProps> = ({ ctx, email, feed, values, errors = {}, flash, deleteError }) => {
  const m = t(ctx.locale).settings;
  const v: SettingsValues = values ?? {
    calendar_name: feed.calendar_name,
    busy_title: feed.busy_title,
    past_days: String(feed.past_days),
    extra_emails: feed.extra_emails,
  };
  const hasErrors = Object.keys(errors).length > 0;
  return (
    <Layout ctx={ctx} title={m.title}>
      <div class="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:px-8">
        <h1 class="mb-8 text-4xl font-extrabold tracking-tight">{m.title}</h1>
        {flash && (
          <div class="mb-8 max-w-xl">
            <Flash kind="ok">{flash}</Flash>
          </div>
        )}

        <Section title={m.calendarSection}>
          {hasErrors && <Flash kind="error">{m.invalid}</Flash>}
          <form method="post" action="/settings" class="flex flex-col gap-5">
            <Field id="calendar_name" label={m.calendarName} hint={m.calendarNameHint} invalid={errors.calendar_name}>
              <input
                id="calendar_name"
                name="calendar_name"
                required
                maxlength={80}
                value={v.calendar_name}
                aria-describedby="calendar_name-hint"
                aria-invalid={errors.calendar_name ? "true" : undefined}
                class="field"
              />
            </Field>
            <Field id="busy_title" label={m.busyTitle} invalid={errors.busy_title}>
              <input id="busy_title" name="busy_title" required maxlength={40} value={v.busy_title} aria-invalid={errors.busy_title ? "true" : undefined} class="field" />
            </Field>
            <Field id="past_days" label={m.pastDays} hint={m.pastDaysHint} invalid={errors.past_days}>
              <input
                id="past_days"
                name="past_days"
                type="number"
                inputmode="numeric"
                min={0}
                max={3650}
                required
                value={v.past_days}
                aria-describedby="past_days-hint"
                aria-invalid={errors.past_days ? "true" : undefined}
                class="field max-w-32 tabular-nums"
              />
            </Field>
            <Field id="extra_emails" label={m.extraEmails} hint={m.extraEmailsHint} invalid={errors.extra_emails}>
              <input
                id="extra_emails"
                name="extra_emails"
                type="text"
                autocomplete="off"
                value={v.extra_emails}
                aria-describedby="extra_emails-hint"
                aria-invalid={errors.extra_emails ? "true" : undefined}
                class="field"
              />
            </Field>
            <button type="submit" class="btn self-start">
              {m.save}
            </button>
          </form>
        </Section>

        <Section title={m.linksSection}>
          <p class="leading-relaxed text-ink-soft">{m.linksText}</p>
          <div class="flex flex-wrap gap-2">
            {(["full", "busy"] as const).map((kind) => (
              <form method="post" action="/settings/rotate" data-confirm={m.rotateConfirm}>
                <input type="hidden" name="feed" value={kind} />
                <button type="submit" class="btn-quiet">
                  {kind === "full" ? m.rotateFull : m.rotateBusy}
                </button>
              </form>
            ))}
          </div>
        </Section>

        <Section title={m.accountSection}>
          <p>{m.signedInAs(email)}</p>
          <form method="post" action="/account/delete" class="flex flex-col gap-3 rounded-lg border border-danger/30 p-5">
            <p class="font-bold text-danger">{m.deleteTitle}</p>
            <p class="leading-relaxed text-ink-soft">{m.deleteText}</p>
            <label for="confirm" class="text-sm font-semibold">
              {m.deleteConfirm}
            </label>
            <input id="confirm" name="confirm" type="email" autocomplete="off" required placeholder={email} class="field" aria-invalid={deleteError ? "true" : undefined} />
            {deleteError && <Flash kind="error">{deleteError}</Flash>}
            <button type="submit" class="btn self-start bg-danger hover:bg-danger/85">
              {m.deleteButton}
            </button>
          </form>
        </Section>
      </div>
    </Layout>
  );
};
